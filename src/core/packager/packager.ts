import { readFileSync, mkdirSync, existsSync, writeFileSync, cpSync, rmSync, readdirSync, statSync } from 'fs';
import { join, relative, extname, dirname, basename } from 'path';
import { HtmlBuilder } from './html-builder';
import { getAdapter } from './network-adapters';
import { buildZip } from './zip-builder';
import { getNetwork, NETWORKS, maxSizeForFormat } from '../../shared/networks';
import { PackageResult, OutputFormat } from '../../shared/types';
import { PackagerOptions, PackagerResult } from './types';
import { packDirectoryToZip } from './asset-inliner';
import { rewriteCocosJs, shouldRewriteCocosJs } from './cocos-js-rewriter';
import { generateFullHtml, generatePayloadJs } from './runtime-loader';
import { buildLauncher, fillLauncherPayloadUrl, validateLauncher, effectiveLauncherBytes } from './launcher-builder';
import { resolveTemplate } from './template-resolver';
import { extractStoreUrls, detectRegionalParams } from './store-url-extractor';
import {
  detectRiskyAudio,
  riskyAudioMarker,
  detectHostileMp3,
  hostileMp3Marker,
} from './audio-format-check';
import { extractAxonUsage, validateAxonEvents } from './axon-events';
import { buildVersionBanner } from './version-banner';
import CleanCSS from 'clean-css';

/** Substring that identifies a usable Google Play Store URL (what Unity's
 *  Creative Pack validator greps the raw HTML for). */
const GOOGLE_PLAY_MARKER = 'play.google.com/store/apps/details';

/** Image extensions accepted for the custom splash logo → MIME for the data URL. */
const SPLASH_LOGO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Read the optional client splash logo into a base64 `data:` URL. Returns
 *  undefined (→ default PLBX splash) on no path, unsupported type, or read error. */
export function resolveSplashLogoDataUrl(path?: string): string | undefined {
  if (!path) return undefined;
  const mime = SPLASH_LOGO_MIME[extname(path).toLowerCase()];
  if (!mime) return undefined;
  try {
    return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
  } catch {
    return undefined;
  }
}

/** Resolve the packager version for the startup banner. Prefer the explicitly
 *  passed value; otherwise read package.json; finally fall back to '0.0.0'. */
function resolvePackagerVersion(explicit?: string): string {
  if (explicit) return explicit;
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function packageForNetworks(options: PackagerOptions): Promise<PackagerResult> {
  const startTime = Date.now();
  const results: PackageResult[] = [];

  // Read the base HTML from build directory
  const htmlPath = join(options.buildDir, 'index.html');
  if (!existsSync(htmlPath)) {
    throw new Error(`Build HTML not found: ${htmlPath}`);
  }
  const baseHtml = readFileSync(htmlPath, 'utf-8');

  // Optional client splash logo — read once, shared across networks. Unreadable
  // path / unsupported type falls back to the default PLBX splash (no hard fail).
  const splashLogoDataUrl = resolveSplashLogoDataUrl(options.config.customSplashLogo);

  // Startup version banner injected into every build (console.log on run).
  const versionBanner = buildVersionBanner(resolvePackagerVersion(options.packagerVersion));

  // Store URLs to mirror as plaintext <head> comments so network validators
  // (e.g. Unity Creative Pack) that grep the raw HTML can find them. Sources:
  //   1. Programmatic PackageConfig.storeUrl* (CLI/back-compat).
  //   2. Literals extracted from the build's source — covers the primary path
  //      where game code calls set_google_play_url("...") (otherwise buried in
  //      the base64 asset ZIP and invisible to a plaintext validator scan).
  const headStoreUrls = Array.from(
    new Set(
      [options.config.storeUrlAndroid, options.config.storeUrlIos, ...extractStoreUrls(options.buildDir)].filter(
        (u): u is string => !!u,
      ),
    ),
  );
  const hasGooglePlayUrl = headStoreUrls.some((u) => u.includes(GOOGLE_PLAY_MARKER));

  // Regional/localization params in store URLs (gl/hl, Apple country path, etc.)
  // should be absent so the creative serves globally. Advisory for ALL networks.
  const regionalWarnings: string[] = [];
  for (const u of headStoreUrls) {
    const params = detectRegionalParams(u);
    if (params.length) {
      regionalWarnings.push(
        `Store URL has regional/localization parameter(s) — remove for global delivery: ` +
          `${u} → ${params.join(', ')}`,
      );
    }
  }

  // AppLovin "Axon" playable-analytics events are authored in the game source
  // (the packager never injects them) and end up base64-zipped in the final
  // HTML — invisible to a plaintext scan. Extract them once from the build
  // source so the applovin branch below can warn on spec violations.
  const axonUsage = extractAxonUsage(options.buildDir);

  // Risky audio (ogg/opus/webm) — Safari/iOS WebAudio decodeAudioData can't
  // decode these on older / in-app WebViews, so the playable can hang on boot.
  // Scanned once from the build source (the encoding-agnostic source of truth);
  // surfaced as a warning + a plaintext <head> marker the preview validator reads.
  const riskyAudio = detectRiskyAudio(options.buildDir);

  // WebKit-hostile MP3 (heuristic): a Xing VBR header on an ultra-short clip can
  // be rejected by Safari/iOS decodeAudioData even though ffmpeg/Chrome/CoreAudio
  // decode it — and that one bad clip hangs the whole playable. Advisory only;
  // the loader's decode guard is the real safety net. See audio-format-check.ts.
  const hostileMp3 = detectHostileMp3(options.buildDir);

  for (const networkId of options.networks) {
    options.onProgress?.(networkId, 'starting');

    try {
      const network = getNetwork(networkId);
      if (!network) {
        throw new Error(`Unknown network: ${networkId}`);
      }

      const adapter = getAdapter(networkId);

      // Clone HTML and apply network adapter
      const builder = new HtmlBuilder(baseHtml);
      adapter.transform(builder, options.config);

      // Startup version banner + plaintext store-URL <head> comments (super-html parity).
      builder.injectBodyScript(versionBanner);
      for (const url of headStoreUrls) {
        builder.injectHeadComment(url);
      }
      // Plaintext marker so the preview validator can warn on iOS-risky audio
      // (the real extensions are buried in the encoded asset container).
      if (riskyAudio.length && network.format !== 'launcher-payload') {
        builder.injectHeadComment(riskyAudioMarker(riskyAudio));
      }
      // Plaintext marker for WebKit-hostile MP3s (heuristic) — same plumbing.
      if (hostileMp3.length && network.format !== 'launcher-payload') {
        builder.injectHeadComment(hostileMp3Marker(hostileMp3));
      }

      // Non-fatal warning: a network whose validator requires a Google Play Store
      // URL (e.g. Unity) but none was found in the build. We don't abort — the
      // missing URL will surface at the network's own validation step.
      const warnings: string[] = [];

      // Regional store-URL params — applies to every network shipping the URL.
      for (const w of regionalWarnings) {
        warnings.push(w);
        console.warn(`[plbx] ${network.name}: ${w}`);
        options.onProgress?.(networkId, 'processing', w);
      }

      // iOS-risky audio (ogg/opus/webm) — advisory, every network.
      if (riskyAudio.length) {
        const w =
          `${riskyAudio.length} risky audio file(s) may not play on iOS WebView ` +
          `(decodeAudioData can't decode ogg/opus/webm) — re-encode to mp3/m4a: ` +
          riskyAudio.join(', ');
        warnings.push(w);
        console.warn(`[plbx] ${network.name}: ${w}`);
        options.onProgress?.(networkId, 'processing', w);
      }

      // WebKit-hostile MP3 (ultra-short VBR) — advisory, every network. Safari/iOS
      // decodeAudioData may reject these and hang the playable; the loader guard
      // degrades it to a silent clip, but re-encoding to CBR is the clean fix.
      if (hostileMp3.length) {
        const w =
          `${hostileMp3.length} MP3 file(s) may fail Safari/iOS WebAudio decode ` +
          `(ultra-short VBR/Xing — re-encode to plain CBR, e.g. ffmpeg -write_xing 0): ` +
          hostileMp3.join(', ');
        warnings.push(w);
        console.warn(`[plbx] ${network.name}: ${w}`);
        options.onProgress?.(networkId, 'processing', w);
      }

      if (network.requiresStoreUrl && !hasGooglePlayUrl) {
        const w =
          `${network.name}: no Google Play Store URL found in the build — the network validator ` +
          `will reject this creative. Set it in game code via ` +
          `set_google_play_url("https://play.google.com/store/apps/details?id=...").`;
        warnings.push(w);
        console.warn(`[plbx] ${w}`);
        options.onProgress?.(networkId, 'processing', w);
      }

      // AppLovin Axon event-spec conformance (advisory — these events are
      // developer-authored, so we never abort the build, only warn).
      if (networkId === 'applovin') {
        for (const c of validateAxonEvents(axonUsage)) {
          if (c.ok) continue;
          // Use the detail (a self-contained problem statement); the label is the
          // desired-state name ("Axon analytics integrated") and reads as a
          // contradiction when prefixed to a failure ("…integrated: No … found").
          const w = `AppLovin Axon events — ${c.detail || c.label}`;
          warnings.push(w);
          console.warn(`[plbx] ${w}`);
          options.onProgress?.(networkId, 'processing', w);
        }
      }

      if (network.format === 'launcher-payload') {
        options.onProgress?.(networkId, 'processing', 'Building launcher + payload...');

        const lpConfig = network.launcherPayload;
        if (!lpConfig) {
          throw new Error(`Network "${networkId}" has format=launcher-payload but no launcherPayload config`);
        }

        const outDir = join(options.outputDir, networkId);
        mkdirSync(outDir, { recursive: true });

        const launcherLoaderMode = options.config.legacyLoaderNetworks?.includes(networkId)
          ? 'systemjs'
          : (options.config.loaderMode ?? 'self-contained');
        // Build payload.js (IIFE injecting full Cocos runtime into launcher's document).
        // Apply the same cocos-js rewrite as the main path (currentScript/new URL +
        // for self-contained also XMLHttpRequest/createElement → FB-safe shims).
        const launcherSelfContained = launcherLoaderMode === 'self-contained';
        const zipBuffer = await packDirectoryToZip(options.buildDir, undefined, {
          excludeExtensions: ['.css', '.html'],
          transform: (path, content) =>
            shouldRewriteCocosJs(path) ? rewriteCocosJs(content.toString('utf-8'), { selfContained: launcherSelfContained }) : null,
        });
        const zipBase64 = zipBuffer.toString('base64');
        const cssContent = extractAndMinifyCss(options.buildDir);

        const payloadJs = generatePayloadJs({
          originalHtml: builder.toHtml(),
          zipBase64,
          cssContent,
          buildDir: options.buildDir,
          loaderMode: launcherLoaderMode,
        });

        const assetTitle =
          options.templateVariables?.assetTitle ||
          options.templateVariables?.projectName ||
          deriveProjectNameFromBuildDir(options.buildDir) ||
          network.name;
        // Moloco spec v2.0 §2.2.1: ASSET_REVISION must be YYYYMMDD.NN (UTC),
        // NN = revision within the day from 00. ISO "YYYY-MM-DD" is rejected by QA.
        const assetRevision = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.00';
        const launcher = buildLauncher({
          // Panel-configurable (Moloco CDN card); falls back to the network default.
          assetProvider: options.templateVariables?.assetProvider || lpConfig.assetProvider,
          assetTitle,
          assetRevision,
          assetVersion: lpConfig.assetVersion,
          payloadUrl: '#PAYLOAD_URL#',
          includeSplash: lpConfig.includeSplash,
        });

        // Strict launcher size ceiling — fail loud if exceeded, do not ship oversized.
        // Measured with the payload-URL reserve: the shipped launcher-final.html
        // carries a ~93-char CDN URL where launcher.html has the 13-char placeholder.
        const launcherSize = effectiveLauncherBytes(launcher);
        if (launcherSize > lpConfig.launcherMaxSize) {
          throw new Error(
            `[${network.name}] launcher.html is ${launcherSize}B (with payload-URL reserve), exceeds strict limit ${lpConfig.launcherMaxSize}B — aborting`,
          );
        }
        const payloadSize = Buffer.byteLength(payloadJs, 'utf-8');

        // Structural launcher checks (ASSET_PROVIDER metadata, IMP_BEACON placement, etc.)
        const structuralErrors = validateLauncherStructure(launcher);
        if (structuralErrors.length > 0) {
          throw new Error(`[${network.name}] launcher.html structural errors: ${structuralErrors.join('; ')}`);
        }

        // Forbidden + required string checks against launcher + payload concatenation
        const combined = launcher + '\n' + payloadJs;
        assertNoForbiddenStrings(combined, adapter.getForbiddenStrings(), network.name);
        assertHasRequiredStrings(combined, adapter.getRequiredStrings(), network.name);

        const launcherPath = join(outDir, 'launcher.html');
        const payloadPath = join(outDir, 'payload.js');
        // Sibling for local QA / Moloco testbed — same launcher with the
        // <script src="#PAYLOAD_URL#"> replaced by an inline <script> containing
        // the payload IIFE verbatim. Self-contained: no sibling-file fetch, so
        // sandboxed validators that don't serve adjacent files (Moloco preview
        // tool, etc.) can open it directly. Production launcher.html keeps the
        // placeholder so the upload pipeline substitutes the real CDN URL.
        const launcherLocalPath = join(outDir, 'launcher-local.html');
        const inlineScriptPayload = payloadJs.replace(/<\/script>/gi, '<\\/script>');
        const launcherLocal = launcher.replace(
          /<script\s+src=["']?#PAYLOAD_URL#["']?\s*>\s*<\/script>/i,
          `<script>${inlineScriptPayload}</script>`,
        );
        writeFileSync(launcherPath, launcher);
        writeFileSync(payloadPath, payloadJs);
        writeFileSync(launcherLocalPath, launcherLocal);

        results.push({
          networkId,
          networkName: network.name,
          outputPath: launcherPath,
          outputSize: launcherSize,
          maxSize: lpConfig.launcherMaxSize,
          withinLimit: launcherSize <= lpConfig.launcherMaxSize,
          format: 'launcher-payload',
          secondaryPath: payloadPath,
          secondarySize: payloadSize,
          secondaryMaxSize: lpConfig.payloadMaxSize,
          secondaryWithinLimit: payloadSize <= lpConfig.payloadMaxSize,
          warnings: warnings.length ? warnings : undefined,
        });

        options.onProgress?.(networkId, 'done');
        continue;
      }

      // Determine all formats to build
      const formats: OutputFormat[] = [network.format];
      if (network.dualFormat) {
        formats.push(network.format === 'html' ? 'zip' : 'html');
      }

      for (const format of formats) {
        const formatSuffix = formats.length > 1 ? `-${format}` : '';
        let outputPath: string = '';
        let outputSize: number = 0;
        // The inlined non-wrap path may emit multiple encoding variants and push
        // its own results; this guards the shared single push below.
        let pushed = false;

        // Resolve output path from template
        const template = options.outputTemplate || '{networkId}/index.{ext}';
        const resolved = resolveTemplate(template, {
          network: network.id,
          networkId: network.id,
          format,
          ext: format,
          ...options.templateVariables,
        });
        outputPath = join(options.outputDir, resolved);
        mkdirSync(dirname(outputPath), { recursive: true });

        // Determine if this format needs a fully-inlined single HTML.
        // True for: html format, singleFileZip networks, or dualFormat networks
        // where the primary format is html (inlineAssets) but we also emit a ZIP.
        const needsInlinedHtml =
          format === 'html' || network.singleFileZip || (format === 'zip' && network.dualFormat && network.inlineAssets);
        // Determine if the inlined HTML should be wrapped in a ZIP
        const wrapInZip = format === 'zip' && (network.singleFileZip || (network.dualFormat && network.inlineAssets));

        if (needsInlinedHtml) {
          // Build a fully-inlined single HTML file.
          // For html format it's written as-is; for singleFileZip/dualFormat ZIP it's wrapped in a ZIP.
          options.onProgress?.(networkId, 'processing', `Building ${wrapInZip ? 'single-file ZIP' : format.toUpperCase()}...`);

          // Per-network loader engine: global loaderMode, overridable by pinning
          // a network into legacyLoaderNetworks (rollback path).
          const globalLoaderMode = options.config.loaderMode ?? 'self-contained';
          const effectiveLoaderMode = options.config.legacyLoaderNetworks?.includes(networkId)
            ? 'systemjs'
            : globalLoaderMode;

          // Pack everything except index.html and CSS (inlined separately).
          // transform: переписываем cocos-js/*.js под наш runtime (см.
          // cocos-js-rewriter.ts) — обходит emscripten currentScript-trap; для
          // self-contained также XMLHttpRequest→_XMLLocalRequest и createElement
          // script→_createLocalJSElement (FB-safe, движок грузит из кеша).
          const selfContained = effectiveLoaderMode === 'self-contained';
          const zipBuffer = await packDirectoryToZip(options.buildDir, undefined, {
            excludeExtensions: ['.css', '.html'],
            transform: (path, content) =>
              shouldRewriteCocosJs(path) ? rewriteCocosJs(content.toString('utf-8'), { selfContained }) : null,
          });
          const zipBase64 = zipBuffer.toString('base64');

          // Extract and minify CSS for inline injection
          const cssContent = extractAndMinifyCss(options.buildDir);

          const finalHtml = generateFullHtml({
            originalHtml: builder.toHtml(),
            zipBase64,
            cssContent,
            buildDir: options.buildDir,
            loaderMode: effectiveLoaderMode,
            showSplash: options.config.showSplash !== false,
            splashLogoDataUrl,
          });

          assertNoForbiddenStrings(finalHtml, adapter.getForbiddenStrings(), network.name);
          assertHasRequiredStrings(finalHtml, adapter.getRequiredStrings(), network.name);

          if (wrapInZip) {
            // Wrap the single HTML in a ZIP (+ optional config.json)
            const tempDir = join(dirname(outputPath), `_temp_${networkId}`);
            mkdirSync(tempDir, { recursive: true });
            // Some networks (Mintegral, per their 2026 zip-naming rule) require the
            // inner HTML to match the playable filename — i.e. the outer .zip
            // basename — rather than the generic index.html, or the load fails.
            let innerHtmlName = 'index.html';
            if (network.htmlMatchesZipName) {
              let zipBase = basename(outputPath, extname(outputPath));
              // Default template leaves the basename as "index" — auto-name after
              // the playable (assetTitle / projectName override, else the build
              // folder name) so it works out of the box without a custom template.
              if (!zipBase || zipBase === 'index') {
                zipBase =
                  options.templateVariables?.assetTitle ||
                  options.templateVariables?.projectName ||
                  deriveProjectNameFromBuildDir(options.buildDir) ||
                  '';
              }
              // Mintegral 2026 moderation rule: "Html file name are supported with
              // letters, Numbers, and underscores only." sanitizeFileBase keeps
              // dashes/dots (fine for other targets) so apply a stricter pass here
              // — collapse anything outside [A-Za-z0-9_] to underscore. Rename the
              // outer .zip too: htmlMatchesZipName means the network loads the inner
              // HTML by the zip basename, so both must match AND both must be clean.
              zipBase = sanitizeFileBase(zipBase)
                .replace(/[^A-Za-z0-9_]+/g, '_')
                .replace(/^_+|_+$/g, '');
              if (zipBase && zipBase !== 'index') {
                innerHtmlName = `${zipBase}.html`;
                outputPath = join(dirname(outputPath), `${zipBase}${extname(outputPath)}`);
              }
            }
            writeFileSync(join(tempDir, innerHtmlName), finalHtml);

            const extraFiles: Array<{ zipPath: string; content: string }> = [];
            const zipConfig = adapter.getZipConfig(options.config);
            if (zipConfig) {
              extraFiles.push({
                zipPath: 'config.json',
                content: JSON.stringify(zipConfig),
              });
            }

            const zipResult = await buildZip({
              sourceDir: tempDir,
              outputPath,
              prefix: network.zipStructure || '',
              extraFiles,
            });

            outputPath = zipResult.outputPath;
            outputSize = zipResult.size;
            rmSync(tempDir, { recursive: true, force: true });
          } else {
            // Per-encoding emit (self-contained only). The chosen encoding writes the
            // primary `index.html`. In "both" (A/B) mode base122 keeps the bare name
            // and the base64 sibling carries a `.b64` suffix.
            const encodings = resolveInlinedEncodings(options.config, effectiveLoaderMode);
            const multi = encodings.length > 1;
            for (const enc of encodings) {
              const html =
                enc === 'base64'
                  ? finalHtml
                  : generateFullHtml({
                      originalHtml: builder.toHtml(),
                      zipBase64,
                      cssContent,
                      buildDir: options.buildDir,
                      loaderMode: effectiveLoaderMode,
                      showSplash: options.config.showSplash !== false,
                      splashLogoDataUrl,
                      encoding: 'base122',
                    });
              if (enc === 'base122') {
                assertNoForbiddenStrings(html, adapter.getForbiddenStrings(), network.name);
                assertHasRequiredStrings(html, adapter.getRequiredStrings(), network.name);
              }
              const variantPath =
                enc === 'base64' && multi ? outputPath.replace(/(\.[^.\\/]+)$/, '.b64$1') : outputPath;
              writeFileSync(variantPath, html);
              const variantSize = statSync(variantPath).size;
              const baseId = formats.length > 1 ? `${networkId}-${format}` : networkId;
              results.push({
                networkId: enc === 'base64' && multi ? `${baseId}-b64` : baseId,
                networkName: network.name,
                outputPath: variantPath,
                outputSize: variantSize,
                maxSize: maxSizeForFormat(network, format),
                withinLimit: variantSize <= maxSizeForFormat(network, format),
                format,
                warnings: warnings.length ? warnings : undefined,
              });
            }
            pushed = true;
          }
        } else {
          // ZIP — copy build dir + transformed HTML + extras
          options.onProgress?.(networkId, 'processing', `Building ZIP...`);

          const tempDir = join(dirname(outputPath), `_temp_${networkId}`);
          mkdirSync(tempDir, { recursive: true });

          cpSync(options.buildDir, tempDir, { recursive: true });
          const zipBranchHtml = builder.toHtml();
          assertNoForbiddenStrings(zipBranchHtml, adapter.getForbiddenStrings(), network.name);
          assertHasRequiredStrings(zipBranchHtml, adapter.getRequiredStrings(), network.name);
          writeFileSync(join(tempDir, 'index.html'), zipBranchHtml);

          const extraFiles: Array<{ zipPath: string; content: string }> = [];

          const zipConfig = adapter.getZipConfig(options.config);
          if (zipConfig) {
            extraFiles.push({
              zipPath: 'config.json',
              content: JSON.stringify(zipConfig),
            });
          }

          const zipResult = await buildZip({
            sourceDir: tempDir,
            outputPath,
            prefix: network.zipStructure || '',
            jsBundleName: adapter.getJsBundleName() || undefined,
            extraFiles,
          });

          outputPath = zipResult.outputPath;
          outputSize = zipResult.size;

          rmSync(tempDir, { recursive: true, force: true });
        }

        if (!pushed) {
          results.push({
            networkId: formats.length > 1 ? `${networkId}-${format}` : networkId,
            networkName: network.name,
            outputPath,
            outputSize,
            maxSize: maxSizeForFormat(network, format),
            withinLimit: outputSize <= maxSizeForFormat(network, format),
            format,
            warnings: warnings.length ? warnings : undefined,
          });
        }
      }

      options.onProgress?.(networkId, 'done');
    } catch (error: any) {
      options.onProgress?.(networkId, 'error', error.message);
      results.push({
        networkId,
        networkName: getNetwork(networkId)?.name || networkId,
        outputPath: '',
        outputSize: 0,
        maxSize: getNetwork(networkId)?.maxSize || 0,
        withinLimit: false,
        format: getNetwork(networkId)?.format || 'html',
      });
    }
  }

  return {
    results,
    totalTime: Date.now() - startTime,
  };
}

/**
 * Scan generated HTML against a network adapter's validator-forbidden
 * substrings and throw if any are present. Prevents shipping builds that
 * the network's validator would reject (e.g. Mintegral PlayTurbo rejects
 * creatives mentioning "preview-util.js" anywhere — including JS comments).
 */
function assertNoForbiddenStrings(html: string, forbidden: string[], networkName: string): void {
  if (!forbidden.length) return;
  const found = forbidden.filter((needle) => html.includes(needle));
  if (found.length === 0) return;
  throw new Error(
    `[${networkName}] Generated HTML contains validator-forbidden string(s): ` +
      found.map((s) => `"${s}"`).join(', ') +
      `. This build would be rejected by the network validator — aborting.`,
  );
}

/**
 * Scan generated HTML for adapter-required substrings and throw if any are
 * missing. Guards against silent regressions in transitive code paths where
 * critical runtime wiring (e.g. MRAID defer-boot gate) could be stripped
 * without any test-level signal, manifesting only as black screen in prod.
 */
function assertHasRequiredStrings(html: string, required: string[], networkName: string): void {
  if (!required.length) return;
  const missing = required.filter((needle) => !html.includes(needle));
  if (missing.length === 0) return;
  throw new Error(
    `[${networkName}] Generated HTML is missing required string(s): ` +
      missing.map((s) => `"${s}"`).join(', ') +
      `. Build is broken — aborting.`,
  );
}

/**
 * Resolve which asset-container encodings to emit for the inlined-HTML path.
 * base122 requires the self-contained loader (its decoder is only wired into
 * that unpack), so it's dropped for systemjs-pinned outputs. Defaults to
 * ['base64'] when unset; always returns a non-empty, de-duplicated list.
 */
function resolveInlinedEncodings(
  config: { assetEncodings?: ('base64' | 'base122')[] },
  loaderMode: 'self-contained' | 'systemjs',
): ('base64' | 'base122')[] {
  const sel: ('base64' | 'base122')[] =
    config.assetEncodings && config.assetEncodings.length ? config.assetEncodings : ['base64'];
  const deduped = sel.filter((e, i) => sel.indexOf(e) === i);
  // base122's decoder is only wired into the self-contained unpack → systemjs
  // outputs fall back to base64.
  if (loaderMode !== 'self-contained') return ['base64'];
  return deduped.length ? deduped : ['base64'];
}

/**
 * Make a string safe to use as a ZIP-entry / file basename: keep letters,
 * digits, dot, underscore and dash; collapse everything else to underscore.
 * Preserves case (Mintegral playable names like "RISE_play036_01" are mixed-case).
 */
function sanitizeFileBase(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Walk up the build directory path looking for the first directory whose name
 * isn't a generic build-output folder. Used as a fallback assetTitle for the
 * Moloco V2 launcher metadata header when no projectName was provided.
 *
 * .../Playables/_Prod/moloco-piggy-merge/build/web-mobile → moloco-piggy-merge
 */
function deriveProjectNameFromBuildDir(buildDir: string): string | null {
  const skip = new Set([
    'build',
    'web-mobile',
    'web-desktop',
    'web',
    'html',
    'plbx-html',
    'dist',
    'output',
    'out',
  ]);
  const parts = buildDir.split(/[\\/]+/).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!skip.has(parts[i].toLowerCase())) return parts[i];
  }
  return null;
}

/**
 * Structural sanity checks for a Moloco V2 launcher.html.
 * Catches issues a substring search can't — element placement, ordering, etc.
 */
// Package-time gate — delegates to the shared validateLauncher (single source of
// truth, also drives the preview "Validate" window) and surfaces failures as
// error strings so the build aborts on a malformed launcher.
function validateLauncherStructure(html: string): string[] {
  return validateLauncher(html)
    .filter((c) => !c.ok)
    .map((c) => c.detail || c.label);
}

/**
 * Extract and minify all CSS files from build directory.
 * Returns concatenated minified CSS string for inline injection.
 */
function extractAndMinifyCss(buildDir: string): string {
  const cssFiles: string[] = [];

  function scanDir(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (extname(entry.name) === '.css') {
        cssFiles.push(readFileSync(fullPath, 'utf-8'));
      }
    }
  }

  scanDir(buildDir);

  if (cssFiles.length === 0) return '';

  const combined = cssFiles.join('\n');
  const minified = new CleanCSS({ level: 2 }).minify(combined);
  return minified.styles || combined;
}

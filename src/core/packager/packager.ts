import { readFileSync, mkdirSync, existsSync, writeFileSync, cpSync, rmSync, readdirSync, statSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { HtmlBuilder } from './html-builder';
import { getAdapter } from './network-adapters';
import { buildZip } from './zip-builder';
import { getNetwork, NETWORKS } from '../../shared/networks';
import { PackageResult, OutputFormat } from '../../shared/types';
import { PackagerOptions, PackagerResult } from './types';
import { packDirectoryToZip } from './asset-inliner';
import { rewriteCocosJs, shouldRewriteCocosJs } from './cocos-js-rewriter';
import { generateFullHtml, generatePayloadJs } from './runtime-loader';
import { buildLauncher, fillLauncherPayloadUrl } from './launcher-builder';
import { resolveTemplate } from './template-resolver';
import CleanCSS from 'clean-css';

export async function packageForNetworks(options: PackagerOptions): Promise<PackagerResult> {
  const startTime = Date.now();
  const results: PackageResult[] = [];

  // Read the base HTML from build directory
  const htmlPath = join(options.buildDir, 'index.html');
  if (!existsSync(htmlPath)) {
    throw new Error(`Build HTML not found: ${htmlPath}`);
  }
  const baseHtml = readFileSync(htmlPath, 'utf-8');

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
        const assetRevision = new Date().toISOString().slice(0, 10);
        const launcher = buildLauncher({
          assetProvider: lpConfig.assetProvider,
          assetTitle,
          assetRevision,
          assetVersion: lpConfig.assetVersion,
          payloadUrl: '#PAYLOAD_URL#',
          includeSplash: lpConfig.includeSplash,
        });

        // Strict launcher size ceiling — fail loud if exceeded, do not ship oversized
        const launcherSize = Buffer.byteLength(launcher, 'utf-8');
        if (launcherSize > lpConfig.launcherMaxSize) {
          throw new Error(
            `[${network.name}] launcher.html is ${launcherSize}B, exceeds strict limit ${lpConfig.launcherMaxSize}B — aborting`,
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
        let outputPath: string;
        let outputSize: number;

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
          });

          assertNoForbiddenStrings(finalHtml, adapter.getForbiddenStrings(), network.name);
          assertHasRequiredStrings(finalHtml, adapter.getRequiredStrings(), network.name);

          if (wrapInZip) {
            // Wrap the single HTML in a ZIP (+ optional config.json)
            const tempDir = join(dirname(outputPath), `_temp_${networkId}`);
            mkdirSync(tempDir, { recursive: true });
            writeFileSync(join(tempDir, 'index.html'), finalHtml);

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
            writeFileSync(outputPath, finalHtml);
            outputSize = statSync(outputPath).size;
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

        results.push({
          networkId: formats.length > 1 ? `${networkId}-${format}` : networkId,
          networkName: network.name,
          outputPath,
          outputSize,
          maxSize: network.maxSize,
          withinLimit: outputSize <= network.maxSize,
          format,
        });
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
function validateLauncherStructure(html: string): string[] {
  const errors: string[] = [];
  if (!/<!--\s*ASSET_PROVIDER=/.test(html)) {
    errors.push('metadata comment header missing ASSET_PROVIDER=');
  }
  if (!/<script\s+src=["']?mraid\.js["']?[^>]*>/i.test(html)) {
    errors.push('<script src="mraid.js"> missing');
  }
  if (!/window\.MOLOCO_MACROS\s*=/.test(html)) {
    errors.push('window.MOLOCO_MACROS object not declared');
  }
  // At least four required macros — Moloco DSP requires these key names
  for (const macro of ['mraid_viewable', 'game_viewable', 'click', 'final_url']) {
    if (!html.includes(macro)) {
      errors.push(`MOLOCO_MACROS missing required key: ${macro}`);
    }
  }
  if (!/%\{IMP_BEACON\}/.test(html)) {
    errors.push('%{IMP_BEACON} placeholder missing');
  }
  // IMP_BEACON must sit just before </body> per spec (Moloco substitutes the
  // tracking pixel as the last DOM hit before page unload)
  if (!/%\{IMP_BEACON\}\s*<\/body>/i.test(html)) {
    errors.push('%{IMP_BEACON} must be the last content before </body>');
  }
  return errors;
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

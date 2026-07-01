import http from 'http';
import { join, extname, basename } from 'path';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import JSZip from 'jszip';
import { generatePreviewUtil } from './sdk-mocks';
import { scanLoaderHealth, LoaderCheck } from './loader-health';
import { parseRiskyAudioMarker, parseHostileMp3Marker } from '../packager/audio-format-check';
import { getNetwork, maxSizeForFormat } from '../../shared/networks';
import { resolveTemplate } from '../packager/template-resolver';
import { validateLauncher, LauncherCheck } from '../packager/launcher-builder';
import { AXON_EVENTS } from '../packager/axon-events';
import { detectRegionalParams } from '../packager/store-url-extractor';

let _server: http.Server | null = null;
let _port = 0;
// Output-naming context from the active preview session, so findBuildFile can
// resolve the SAME path the packager wrote (custom templates move the file out
// of the default {networkId}/ folder). Set by startPreviewServer.
let _previewTemplate: string | undefined;
let _previewTemplateVars: Record<string, string> | undefined;

interface BuildFile {
  path: string;
  isZip: boolean;
  /** For launcher-payload format: path to the sibling payload.js */
  payloadPath?: string;
}

/**
 * Resolve the exact build file the packager produced for a network using the
 * output-naming template, trying the network's format ext plus html/zip. Returns
 * the first existing path, or null. This is what makes the validator work with
 * non-default Output Naming (e.g. `{networkId}.{ext}`, `{projectName}/...`).
 */
function resolveTemplatedBuildPath(
  outputDir: string,
  networkId: string,
  template: string,
  templateVariables?: Record<string, string>,
): BuildFile | null {
  const net = getNetwork(networkId);
  const exts = Array.from(new Set([net?.format, 'html', 'zip'].filter(Boolean) as string[]));
  for (const ext of exts) {
    try {
      const rel = resolveTemplate(template, {
        network: networkId,
        networkId,
        format: ext,
        ext,
        ...(templateVariables || {}),
      });
      const full = join(outputDir, rel);
      if (existsSync(full)) return { path: full, isZip: ext === 'zip' || full.toLowerCase().endsWith('.zip') };
    } catch {
      // Bad template/var for this ext — try the next.
    }
  }
  return null;
}

export function findBuildFile(
  outputDir: string,
  networkId: string,
  opts?: { template?: string; templateVariables?: Record<string, string> },
): BuildFile | null {
  // 1. Honor the output-naming template (explicit opts, else the active session).
  const template = opts?.template ?? _previewTemplate;
  const templateVars = opts?.templateVariables ?? _previewTemplateVars;
  if (template) {
    const templated = resolveTemplatedBuildPath(outputDir, networkId, template, templateVars);
    if (templated) return templated;
  }

  // 2. Fallback heuristic: the default {networkId}/ layout.
  const dir = join(outputDir, networkId);
  if (!existsSync(dir)) return null;

  // launcher-payload format (molocoV2 etc.): prefer production launcher.html
  // over launcher-local.html — preview-util.js will substitute #PAYLOAD_URL#
  // with a /preview/{networkId}/payload.js route so the launcher still works
  // without the inlined payload bloating every request.
  const launcherHtml = join(dir, 'launcher.html');
  const payloadJs = join(dir, 'payload.js');
  if (existsSync(launcherHtml) && existsSync(payloadJs)) {
    return { path: launcherHtml, isZip: false, payloadPath: payloadJs };
  }

  // Check for index.html first
  const indexHtml = join(dir, 'index.html');
  if (existsSync(indexHtml)) return { path: indexHtml, isZip: false };

  // Look for any .zip file
  const files = readdirSync(dir);
  const zipFile = files.find((f) => f.endsWith('.zip'));
  if (zipFile) return { path: join(dir, zipFile), isZip: true };

  // Look for any .html file
  const htmlFile = files.find((f) => f.endsWith('.html'));
  if (htmlFile) return { path: join(dir, htmlFile), isZip: false };

  return null;
}

export async function extractHtmlFromZip(zipPath: string): Promise<string> {
  const data = readFileSync(zipPath);
  const zip = await JSZip.loadAsync(data);
  // Prefer index.html; then the HTML named after the .zip basename — Mintegral's
  // 2026 zip-naming requirement names the inner HTML after the outer .zip (e.g.
  // web-mobile-001.zip → web-mobile-001.html), so index.html is absent; then any
  // root-level .html, then any .html anywhere in the archive.
  const zipBase = basename(zipPath, extname(zipPath));
  const htmlFile =
    zip.file('index.html') ||
    zip.file(`${zipBase}.html`) ||
    zip.file(/^[^/]+\.html$/i)[0] ||
    zip.file(/\.html$/i)[0];
  if (!htmlFile) {
    throw new Error('No HTML file found in ZIP: ' + zipPath);
  }
  return htmlFile.async('string');
}

/** Substrings identifying store URLs — what validators (e.g. Unity Creative
 *  Pack) grep the raw HTML for. */
const GOOGLE_PLAY_MARKER = 'play.google.com/store/apps/details';
const APP_STORE_MARKERS = ['apps.apple.com/', 'itunes.apple.com/'];

/**
 * Static validator: does the BUILT HTML carry the store URLs as plaintext?
 * Networks like Unity grep the raw markup; a URL set only in game code
 * (set_google_play_url / set_app_store_url) is buried in the base64 asset ZIP
 * and won't be found there — the packager mirrors it into a <head> comment,
 * which is what this scans for. Reads the built HTML (zip-aware).
 */
async function buildStoreUrlPresence(
  outputDir: string,
  networkId: string,
): Promise<{ google: boolean; apple: boolean }> {
  try {
    const file = findBuildFile(outputDir, networkId);
    if (!file) return { google: false, apple: false };
    const html = file.isZip ? await extractHtmlFromZip(file.path) : readFileSync(file.path, 'utf-8');
    return {
      google: html.includes(GOOGLE_PLAY_MARKER),
      apple: APP_STORE_MARKERS.some((m) => html.includes(m)),
    };
  } catch {
    return { google: false, apple: false };
  }
}

/** Full store-URL literals in the built HTML (the plaintext head-comment mirror —
 *  base64-zipped game code isn't matched). */
const STORE_URL_RE =
  /https?:\/\/[^\s"'<>)\\]*(?:play\.google\.com|apps\.apple\.com|itunes\.apple\.com)[^\s"'<>)\\]*/gi;

/**
 * Static validator: do the build's store URLs carry regional/localization params
 * (gl/hl, Apple /us/ country path, …)? They should be absent so the creative
 * serves globally. `present` = the build has any store URL at all (so the preview
 * shows the check as a pass when clean, instead of a silent N/A). Reads the built
 * HTML (zip-aware); mirrors the package-time regional gate (packager.ts).
 */
/**
 * Static validator: iOS-risky audio (ogg/opus/webm) in the build. Reads the
 * packager's plaintext `<head>` marker (zip-aware) — the real asset extensions
 * are buried in the encoded container, so the marker is the reliable signal.
 * Returns the offending file list ([] when none / unreadable).
 */
async function buildRiskyAudio(outputDir: string, networkId: string): Promise<string[]> {
  try {
    const file = findBuildFile(outputDir, networkId);
    if (!file) return [];
    const html = file.isZip ? await extractHtmlFromZip(file.path) : readFileSync(file.path, 'utf-8');
    return parseRiskyAudioMarker(html);
  } catch {
    return [];
  }
}

/**
 * Static validator: WebKit-hostile MP3 (ultra-short VBR/Xing) in the build.
 * Reads the packager's plaintext `<head>` marker like buildRiskyAudio above.
 * Returns the offending file list ([] when none / unreadable).
 */
async function buildHostileMp3(outputDir: string, networkId: string): Promise<string[]> {
  try {
    const file = findBuildFile(outputDir, networkId);
    if (!file) return [];
    const html = file.isZip ? await extractHtmlFromZip(file.path) : readFileSync(file.path, 'utf-8');
    return parseHostileMp3Marker(html);
  } catch {
    return [];
  }
}

async function buildStoreUrlRegional(
  outputDir: string,
  networkId: string,
): Promise<{ present: boolean; warnings: string[] }> {
  try {
    const file = findBuildFile(outputDir, networkId);
    if (!file) return { present: false, warnings: [] };
    const html = file.isZip ? await extractHtmlFromZip(file.path) : readFileSync(file.path, 'utf-8');
    const urls = Array.from(new Set(html.match(STORE_URL_RE) || []));
    if (urls.length === 0) return { present: false, warnings: [] };
    const warnings: string[] = [];
    for (const u of urls) {
      const params = detectRegionalParams(u);
      if (params.length) warnings.push(`${u} → ${params.join(', ')}`);
    }
    return { present: true, warnings };
  } catch {
    return { present: false, warnings: [] };
  }
}

/**
 * Static launcher checks for the Validate window (launcher-payload networks only).
 * Runs the shared validateLauncher() against the production launcher.html so the
 * window mirrors what the package-time gate enforces — wrong macro values,
 * malformed ASSET_REVISION, relative payload, size, etc. Returns [] for non
 * launcher-payload networks or when no launcher.html exists yet.
 */
function buildLauncherChecks(outputDir: string, networkId: string): LauncherCheck[] {
  try {
    if (getNetwork(networkId)?.format !== 'launcher-payload') return [];
    const launcherPath = join(outputDir, networkId, 'launcher.html');
    if (!existsSync(launcherPath)) return [];
    return validateLauncher(readFileSync(launcherPath, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Static loader-health fingerprint for the Validate window. Reads the built HTML
 * (zip-aware) and runs the capability scan (robust defer-boot gate, virtual-scheme
 * guard, boot-safety version floor). All checks are blocking. Returns [] when the
 * build can't be read so a transient read error never masquerades as a pass.
 */
async function buildLoaderHealth(
  outputDir: string,
  networkId: string,
  mraid: boolean,
): Promise<LoaderCheck[]> {
  try {
    const file = findBuildFile(outputDir, networkId);
    if (!file) return [];
    const html = file.isZip ? await extractHtmlFromZip(file.path) : readFileSync(file.path, 'utf-8');
    return scanLoaderHealth(html, { mraid });
  } catch {
    return [];
  }
}

function injectPreviewUtil(html: string, utilScript: string): string {
  const headIdx = html.indexOf('<head>');
  if (headIdx === -1) {
    // Try <head with attributes
    const headMatch = html.match(/<head[^>]*>/);
    if (headMatch && headMatch.index !== undefined) {
      const insertAt = headMatch.index + headMatch[0].length;
      return html.slice(0, insertAt) + '<script>' + utilScript + '</script>' + html.slice(insertAt);
    }
    // No head tag — prepend
    return '<script>' + utilScript + '</script>' + html;
  }
  const insertAt = headIdx + '<head>'.length;
  return html.slice(0, insertAt) + '<script>' + utilScript + '</script>' + html.slice(insertAt);
}

function getBuildSize(outputDir: string, networkId: string): number {
  const buildFile = findBuildFile(outputDir, networkId);
  if (!buildFile) return 0;
  try {
    return statSync(buildFile.path).size;
  } catch {
    return 0;
  }
}

// Per-network CTA method labels for the checklist
const CTA_LABELS: Record<string, string> = {
  facebook: 'CTA (FbPlayableAd.onCTAClick)',
  moloco: 'CTA (FbPlayableAd.onCTAClick)',
  google: 'CTA (ExitApi.exit)',
  mintegral: 'CTA (window.install)',
  tiktok: 'CTA (playableSDK.openAppStore)',
  pangle: 'CTA (playableSDK.openAppStore)',
  bigo: 'CTA (BGY_MRAID.open)',
  vungle: 'CTA (postMessage download)',
  mytarget: 'CTA (MTRG.onCTAClick)',
  yandex: 'CTA (yandexHTML5BannerApi)',
};

// Networks requiring full gameReady/gameStart/gameEnd/gameClose lifecycle
const FULL_LIFECYCLE = new Set(['mintegral']);

// Networks requiring gameReady + gameStart (SDK calls gameStart after gameReady)
const PARTIAL_LIFECYCLE = new Set(['tiktok', 'pangle']);

// Networks where game_end/complete is explicitly validated
const GAME_END_REQUIRED = new Set(['mintegral', 'vungle', 'tiktok', 'pangle']);

interface CheckDef {
  id: string;
  label: string;
  hint?: string;
}

// MolocoV2 macros tracked individually in the validator UI. Listed once here so the
// checklist + the macro-fire UI stay consistent.
const MOLOCO_V2_TRACKED_MACROS: ReadonlyArray<{ key: string; label: string; hint: string }> = [
  {
    key: 'mraid_viewable',
    label: 'mraid_viewable beacon',
    hint: 'Fires after mraid.isViewable() becomes true. Trigger the "Viewable" button in the preview to simulate it.',
  },
  {
    key: 'game_viewable',
    label: 'game_viewable beacon',
    hint: 'Fires after plbx_html.game_ready() — Cocos boot signals the game is ready to display.',
  },
  {
    key: 'click',
    label: 'click beacon',
    hint: 'Fires from plbx_html.download() — tap the CTA in the playable.',
  },
  {
    key: 'engagement',
    label: 'engagement beacon',
    hint: 'Fires after taps_for_engagement taps (default 1). Use "Simulate N taps" or tap the canvas.',
  },
  {
    key: 'redirection',
    label: 'redirection beacon',
    hint: 'Fires after taps_for_redirection taps (default 3). Sustained engagement signal.',
  },
  {
    key: 'complete',
    label: 'complete beacon',
    hint: 'Fires from plbx_html.game_end() — call from game code on level finished or use "End game".',
  },
];

function getNetworkChecks(networkId: string, mraid: boolean): CheckDef[] {
  const checks: CheckDef[] = [
    {
      id: 'file_size',
      label: 'File size',
      hint: 'Reduce asset sizes: compress textures (TinyPNG), use audio compression, remove unused assets. PLBX auto-inlines everything into a single HTML.',
    },
    {
      id: 'game_loads',
      label: 'Game loads',
      hint: 'Check browser console for errors. Ensure all assets are inlined and no external dependencies are missing.',
    },
  ];

  // MolocoV2 launcher-payload format: per-macro lifecycle checks. Skip the generic
  // CTA/external-request rails since the macro suite covers them more precisely.
  if (networkId === 'molocoV2') {
    checks.push({
      id: 'mraid_ready',
      label: 'MRAID ready',
      hint: 'mraid.js mock must initialize. Defer-boot gate waits for mraid.getState() === default.',
    });
    checks.push({
      id: 'viewable_listener',
      label: 'viewableChange listener registered',
      hint: 'Payload must call mraid.addEventListener("viewableChange", fn) so mraid_viewable fires in production.',
    });
    for (const macro of MOLOCO_V2_TRACKED_MACROS) {
      checks.push({
        id: 'macro_' + macro.key,
        label: macro.label,
        hint: macro.hint,
      });
    }
    checks.push({
      id: 'final_url_used',
      label: 'final_url consumed by CTA',
      hint: 'plbx_html.download() must open MOLOCO_MACROS.final_url via mraid.open — not the storeUrl fallback.',
    });
    checks.push({
      id: 'no_errors',
      label: 'No code exceptions',
      hint: 'Fix JavaScript errors in your game code. Common causes: missing assets, API calls to undefined objects, timing issues.',
    });
    return checks;
  }

  // MRAID ready — for MRAID networks (AppLovin, Unity, ironSource, etc.)
  if (mraid) {
    checks.push({
      id: 'mraid_ready',
      label: 'MRAID ready',
      hint: 'MRAID SDK must initialize. PLBX injects mraid.js mock automatically. If not firing, check that your code listens for mraid "ready" event.',
    });
  }

  // Store URL literals — required by networks whose validator greps the raw HTML
  // for them (e.g. Unity Creative Pack). Evaluated statically against the built
  // HTML server-side (see buildStoreUrlPresence / net.hasGooglePlayUrl + hasAppStoreUrl).
  if (getNetwork(networkId)?.requiresStoreUrl) {
    checks.push({
      id: 'google_play_url',
      label: 'Google Play Store URL present',
      hint: 'The build must contain a Google Play Store URL as plaintext — validators grep the raw HTML. Set it in game code via set_google_play_url("https://play.google.com/store/apps/details?id=...") so the packager mirrors it into the build.',
    });
    checks.push({
      id: 'app_store_url',
      label: 'App Store URL present',
      hint: 'The build must contain an App Store URL as plaintext — validators grep the raw HTML. Set it in game code via set_app_store_url("https://apps.apple.com/app/id...") so the packager mirrors it into the build.',
    });
  }

  // Full lifecycle: Mintegral requires gameReady → gameStart → gameEnd → gameClose
  if (FULL_LIFECYCLE.has(networkId)) {
    checks.push({
      id: 'game_ready',
      label: 'gameReady()',
      hint: "Call window.gameReady() when all assets are loaded and the game is ready to play. In Cocos Creator, call it in your main scene's onLoad or start method.",
    });
    checks.push({
      id: 'game_start',
      label: 'gameStart()',
      hint: 'gameStart() is called automatically by the SDK after gameReady(). If not detected, ensure gameReady() is being called first.',
    });
  }

  // Partial lifecycle: TikTok/Pangle require gameReady + gameStart
  if (PARTIAL_LIFECYCLE.has(networkId)) {
    checks.push({
      id: 'game_ready',
      label: 'gameReady()',
      hint: 'Call window.gameReady() when the game is ready. For TikTok/Pangle, also call playableSDK.reportGameReady() if using their SDK.',
    });
    checks.push({
      id: 'game_start',
      label: 'gameStart()',
      hint: 'gameStart() is triggered after gameReady(). Ensure gameReady() fires correctly.',
    });
  }

  // CTA — with network-specific label
  const ctaLabel = CTA_LABELS[networkId] || (mraid ? 'CTA (mraid.open)' : 'CTA Call');
  const ctaHints: Record<string, string> = {
    mintegral: 'Call window.install() when the user taps the CTA button. This redirects to the app store.',
    google: 'Call ExitApi.exit() when the user taps the CTA button.',
    facebook: 'Call FbPlayableAd.onCTAClick() when the user taps the download/CTA button.',
    moloco: 'Call FbPlayableAd.onCTAClick() when the user taps the CTA button.',
    tiktok: 'Call playableSDK.openAppStore() when the user taps the CTA button.',
    pangle: 'Call playableSDK.openAppStore() when the user taps the CTA button.',
    bigo: 'Call BGY_MRAID.open(storeUrl) when the user taps the CTA button.',
    vungle: 'Call parent.postMessage("download", "*") when the user taps the CTA button.',
    mytarget: 'Call MTRG.onCTAClick() when the user taps the CTA button.',
    yandex: 'Call yandexHTML5BannerApi.getClickURLNum(1) when the user taps the CTA button.',
  };
  checks.push({
    id: 'cta',
    label: ctaLabel,
    hint:
      ctaHints[networkId] ||
      (mraid
        ? 'Call mraid.open(storeUrl) when the user taps the CTA button.'
        : 'Trigger a CTA call when the user taps the download button. Use the network-specific API.'),
  });

  // game_end — required for Mintegral (gameEnd), Vungle (complete event)
  if (GAME_END_REQUIRED.has(networkId)) {
    checks.push({
      id: 'game_end',
      label: 'gameEnd()',
      hint: 'Call window.gameEnd() when the gameplay is complete (e.g. level finished, time ran out). This must fire before or alongside the CTA.',
    });
  }

  // game_close — Mintegral only
  if (FULL_LIFECYCLE.has(networkId)) {
    checks.push({
      id: 'game_close',
      label: 'gameClose()',
      hint: 'Call window.gameClose() when the playable ad is being closed. Typically called after CTA or at the end of the experience.',
    });
  }

  checks.push({
    id: 'no_external',
    label: 'No external requests',
    hint: 'All assets must be inlined into the HTML file. PLBX does this automatically during packaging. If external requests appear, check for hardcoded URLs in your code.',
  });
  checks.push({
    id: 'no_errors',
    label: 'No code exceptions',
    hint: 'Fix JavaScript errors in your game code. Check the console below for details. Common causes: missing assets, API calls to undefined objects, timing issues.',
  });

  return checks;
}

function getValidatorHtml(): string {
  // Check for static file first
  const staticPath = join(__dirname, '../../../static/preview/index.html');
  if (existsSync(staticPath)) {
    return readFileSync(staticPath, 'utf-8');
  }

  // Inline fallback
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Playbox Preview Validator</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; height: 100vh; }
.tabs { display: flex; gap: 4px; padding: 8px; background: #16213e; border-bottom: 1px solid #0f3460; }
.tab { padding: 6px 16px; border: 1px solid #0f3460; border-radius: 4px; cursor: pointer; background: #1a1a2e; color: #a0a0c0; font-size: 13px; }
.tab.active { background: #0f3460; color: #fff; }
.tab .size { font-size: 11px; margin-left: 6px; opacity: 0.7; }
.main { display: flex; flex: 1; overflow: hidden; }
.preview-frame { flex: 1; border: none; background: #fff; }
.sidebar { width: 280px; padding: 12px; border-left: 1px solid #0f3460; overflow-y: auto; background: #16213e; }
.sidebar h3 { margin-bottom: 12px; font-size: 14px; color: #7ec8e3; }
.check-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #0f3460; }
.check-icon { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
.check-icon.pending { background: #333; color: #888; }
.check-icon.pass { background: #1b5e20; color: #4caf50; }
.check-icon.fail { background: #b71c1c; color: #ef5350; }
.console { height: 150px; border-top: 1px solid #0f3460; background: #0d1117; padding: 8px; overflow-y: auto; font-family: monospace; font-size: 12px; }
.console-line { padding: 2px 0; color: #8b949e; }
.console-line.error { color: #f85149; }
.console-line.success { color: #3fb950; }
.console-line.info { color: #58a6ff; }
</style>
</head>
<body>
<div class="tabs" id="tabs"></div>
<div class="main">
  <iframe class="preview-frame" id="preview-frame" sandbox="allow-scripts allow-same-origin"></iframe>
  <div class="sidebar">
    <h3 id="sidebar-title">Validation Checklist</h3>
    <div id="checklist"></div>
  </div>
</div>
<div class="console" id="console"></div>
<script>
(function() {
  var checks = {
    file_size: { label: 'File size within limit', status: 'pending' },
    game_loads: { label: 'Game loads', status: 'pending' },
    game_ready: { label: 'Game Ready', status: 'pending' },
    game_start: { label: 'Game Start', status: 'pending' },
    cta: { label: 'CTA triggered', status: 'pending' },
    game_close: { label: 'Game Close', status: 'pending' },
    no_external: { label: 'No external requests', status: 'pending' },
    no_errors: { label: 'No exceptions', status: 'pending' }
  };
  var networks = [];
  var currentNetwork = null;
  var timeoutId = null;

  function renderChecklist() {
    var container = document.getElementById('checklist');
    while (container.firstChild) container.removeChild(container.firstChild);
    var keys = Object.keys(checks);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var check = checks[key];
      var item = document.createElement('div');
      item.className = 'check-item';
      if (check.detail && check.status === 'fail') item.title = check.detail;
      var icon = document.createElement('div');
      icon.className = 'check-icon ' + check.status;
      icon.textContent = check.status === 'pass' ? '\u2713' : check.status === 'fail' ? '\u2717' : '\u2022';
      var label = document.createElement('span');
      label.textContent = check.label;
      item.appendChild(icon);
      item.appendChild(label);
      container.appendChild(item);
    }
  }

  function log(msg, cls) {
    var container = document.getElementById('console');
    var line = document.createElement('div');
    line.className = 'console-line' + (cls ? ' ' + cls : '');
    var time = new Date().toLocaleTimeString();
    line.textContent = '[' + time + '] ' + msg;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }

  function setCheck(name, status) {
    if (checks[name]) {
      checks[name].status = status;
      renderChecklist();
    }
  }

  function loadNetwork(id) {
    currentNetwork = id;
    // Reset checks; drop launcher checks (lc_*) from the previously-selected network.
    var keys = Object.keys(checks);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('lc_') === 0) { delete checks[keys[i]]; continue; }
      checks[keys[i]].status = 'pending';
    }

    // Check file size
    var net = null;
    for (var j = 0; j < networks.length; j++) {
      if (networks[j].id === id) { net = networks[j]; break; }
    }
    if (net) {
      setCheck('file_size', net.size <= net.maxSize ? 'pass' : 'fail');
      log('File size: ' + (net.size / 1024).toFixed(1) + ' KB / ' + (net.maxSize / 1024 / 1024).toFixed(1) + ' MB max', net.size <= net.maxSize ? 'success' : 'error');
    }

    // Static launcher structural checks (launcher-payload networks, e.g. molocoV2):
    // macro values match Moloco spec, ASSET_REVISION format, no relative payload, size.
    // Pre-evaluated server-side — render with their pass/fail status immediately.
    if (net && net.launcherChecks && net.launcherChecks.length) {
      for (var lci = 0; lci < net.launcherChecks.length; lci++) {
        var lc = net.launcherChecks[lci];
        checks['lc_' + lc.id] = {
          label: 'Launcher: ' + lc.label,
          status: lc.ok ? 'pass' : 'fail',
          detail: lc.detail || '',
        };
        if (!lc.ok) log('Launcher check failed: ' + lc.label + (lc.detail ? ' — ' + lc.detail : ''), 'error');
      }
    }

    // Set no_external and no_errors to pass initially
    setCheck('no_external', 'pass');
    setCheck('no_errors', 'pass');

    renderChecklist();
    log('Loading preview for: ' + id, 'info');

    var frame = document.getElementById('preview-frame');
    frame.src = '/preview/' + id;

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(function() {
      var keys2 = Object.keys(checks);
      for (var k = 0; k < keys2.length; k++) {
        if (checks[keys2[k]].status === 'pending') {
          setCheck(keys2[k], 'fail');
          log('Timeout: ' + checks[keys2[k]].label, 'error');
        }
      }
    }, 30000);

    // Update active tab
    var tabs = document.getElementById('tabs').children;
    for (var t = 0; t < tabs.length; t++) {
      if (tabs[t].dataset && tabs[t].dataset.id === id) {
        tabs[t].className = 'tab active';
      } else {
        tabs[t].className = 'tab';
      }
    }
  }

  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'plbx:preview') return;
    var evt = e.data.event;
    var data = e.data.data || {};
    log('Event: ' + evt + (data.method ? ' (' + data.method + ')' : ''), 'info');

    if (evt === 'preview_loaded') {
      setCheck('game_loads', 'pass');
    } else if (evt === 'game_ready') {
      setCheck('game_ready', 'pass');
    } else if (evt === 'game_start') {
      setCheck('game_start', 'pass');
    } else if (evt === 'cta') {
      setCheck('cta', 'pass');
    } else if (evt === 'game_close') {
      setCheck('game_close', 'pass');
    } else if (evt === 'external_request') {
      setCheck('no_external', 'fail');
      log('External request: ' + (data.url || ''), 'error');
    } else if (evt === 'error') {
      setCheck('no_errors', 'fail');
      log('Error: ' + (data.message || ''), 'error');
    }
  });

  // Load networks
  fetch('/api/networks').then(function(r) { return r.json(); }).then(function(data) {
    networks = data;
    var tabsContainer = document.getElementById('tabs');
    for (var i = 0; i < data.length; i++) {
      var tab = document.createElement('div');
      tab.className = 'tab';
      tab.dataset.id = data[i].id;
      var nameSpan = document.createElement('span');
      nameSpan.textContent = data[i].name;
      tab.appendChild(nameSpan);
      var sizeSpan = document.createElement('span');
      sizeSpan.className = 'size';
      sizeSpan.textContent = (data[i].size / 1024).toFixed(0) + ' KB';
      tab.appendChild(sizeSpan);
      tab.addEventListener('click', (function(id) { return function() { loadNetwork(id); }; })(data[i].id));
      tabsContainer.appendChild(tab);
    }
    if (data.length > 0) loadNetwork(data[0].id);
  });

  renderChecklist();
})();
</script>
</body>
</html>`;
}

export async function startPreviewServer(options: {
  outputDir: string;
  networks: string[];
  /** Output-naming template the packager used (default '{networkId}/index.{ext}').
   *  Lets the validator find files written under a custom naming scheme. */
  outputTemplate?: string;
  /** User-defined template variables (e.g. projectName) referenced by the template. */
  templateVariables?: Record<string, string>;
}): Promise<{ port: number; url: string }> {
  // Stop existing server if running
  if (_server) {
    await stopPreviewServer();
  }

  const { outputDir, networks } = options;
  _previewTemplate = options.outputTemplate;
  _previewTemplateVars = options.templateVariables;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = req.url || '/';

      try {
        // GET / — Validator UI
        if (url === '/' || url === '/index.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getValidatorHtml());
          return;
        }

        // GET /api/networks
        if (url === '/api/networks') {
          const VALIDATOR_URLS: Record<string, string> = {
            applovin: 'https://p.applov.in/playablePreview?create=1&qr=1',
            facebook: 'https://developers.facebook.com/tools/playable-preview/',
            google: 'https://h5validator.appspot.com/adwords/asset',
            mintegral: 'https://www.mindworks-creative.com/review/',
            // Official Moloco playable preview — paste launcher-final.html contents
            molocoV2: 'https://hyungseokchoi-moloco.github.io/playable-preview/',
            vungle: 'https://vungle.com/creative-verifier/',
            tiktok: 'https://ads.tiktok.com/help/article/playable-ad-specifications',
            pangle: 'https://ads.tiktok.com/help/article/playable-ad-specifications',
          };

          const result = await Promise.all(
            networks.map(async (id) => {
              const config = getNetwork(id);
              const checks = getNetworkChecks(id, config?.mraid || false);
              const requiresStoreUrl = config?.requiresStoreUrl || false;
              // Static literal checks against the built HTML (Unity Creative Pack).
              const store = requiresStoreUrl
                ? await buildStoreUrlPresence(outputDir, id)
                : { google: false, apple: false };
              // Static launcher structural checks (launcher-payload networks).
              const launcherChecks = buildLauncherChecks(outputDir, id);
              // Static loader-health fingerprint (boot-pipeline safety). Blocking.
              const loaderHealth = await buildLoaderHealth(outputDir, id, config?.mraid || false);
              // Regional/localization params in the store URL — applies to every
              // network (the creative must serve globally). Add the checklist line
              // only when the build actually carries a store URL.
              const regional = await buildStoreUrlRegional(outputDir, id);
              if (regional.present) {
                checks.push({
                  id: 'store_url_regional',
                  label: 'No regional store-URL params',
                  hint: 'Remove regional/localization parameters (gl/hl, Apple /us/ country path, …) from the store URL — the creative must serve globally. Set a clean URL via set_google_play_url / set_app_store_url.',
                });
              }
              // iOS-risky audio (ogg/opus/webm) — advisory warn. Check def exists
              // only when the packager flagged risky files (marker present).
              const riskyAudio = await buildRiskyAudio(outputDir, id);
              if (riskyAudio.length) {
                checks.push({
                  id: 'risky_audio',
                  label: 'No iOS-risky audio (ogg/opus/webm)',
                  hint: 'Safari/iOS WebAudio decodeAudioData can\'t decode ogg/opus/webm on older / in-app WebViews — the playable may not open. Re-encode these to mp3/m4a in Cocos import settings.',
                });
              }
              // WebKit-hostile MP3 (ultra-short VBR/Xing) — advisory warn (heuristic).
              const hostileMp3 = await buildHostileMp3(outputDir, id);
              if (hostileMp3.length) {
                checks.push({
                  id: 'hostile_mp3',
                  label: 'No WebKit-hostile MP3 (ultra-short VBR)',
                  hint: 'Safari/iOS WebAudio decodeAudioData can reject ultra-short VBR/Xing MP3s (written by some LAME encoders) even though Chrome/ffmpeg decode them — one bad clip can hang the playable. Re-encode to plain CBR (e.g. ffmpeg -c:a libmp3lame -write_xing 0).',
                });
              }
              return {
                id,
                name: config?.name || id,
                format: config?.format || 'html',
                mraid: config?.mraid || false,
                maxSize: config ? maxSizeForFormat(config, config.format) : 0,
                size: getBuildSize(outputDir, id),
                requiresStoreUrl,
                hasGooglePlayUrl: store.google,
                hasAppStoreUrl: store.apple,
                regional: regional.warnings,
                riskyAudio,
                hostileMp3,
                checks,
                launcherChecks,
                loaderHealth,
                // Adversarial mraid timing modes the client iterates in the
                // self-driving boot harness (mraid networks only).
                mraidModes: config?.mraid ? ['happy', 'neverViewable', 'lostPulse'] : [],
                // Canonical Axon event spec — the client renders these as the
                // expected set and checks runtime-fired events against them.
                axonEvents: id === 'applovin' ? AXON_EVENTS : null,
                validatorUrl: VALIDATOR_URLS[id] || null,
              };
            }),
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // GET /preview/{networkId}/payload.js — launcher-payload sibling fetch
        // Production launcher.html ships with <script src="#PAYLOAD_URL#">; in
        // preview the server substitutes the placeholder with this route so
        // the launcher can pull its IIFE without inlining the whole thing.
        const payloadMatch = url.match(/^\/preview\/([a-zA-Z0-9_-]+)\/payload\.js$/);
        if (payloadMatch) {
          const networkId = payloadMatch[1];
          const buildFile = findBuildFile(outputDir, networkId);
          if (!buildFile || !buildFile.payloadPath || !existsSync(buildFile.payloadPath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('payload.js not found for network: ' + networkId);
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
          res.end(readFileSync(buildFile.payloadPath));
          return;
        }

        // GET /preview/{networkId}[?mraidMode=...]
        const [urlPath, urlQuery] = url.split('?');
        const previewMatch = urlPath.match(/^\/preview\/([a-zA-Z0-9_-]+)$/);
        if (previewMatch) {
          const networkId = previewMatch[1];
          const config = getNetwork(networkId);
          // Adversarial boot-harness timing (mraid builds). Unknown → happy
          // (sanitized again inside generatePreviewUtil).
          const mraidMode = new URLSearchParams(urlQuery || '').get('mraidMode') || 'happy';
          const buildFile = findBuildFile(outputDir, networkId);

          if (!buildFile) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Build not found for network: ' + networkId);
            return;
          }

          let html: string;
          if (buildFile.isZip) {
            html = await extractHtmlFromZip(buildFile.path);
          } else {
            html = readFileSync(buildFile.path, 'utf-8');
          }

          // launcher-payload format: substitute #PAYLOAD_URL# placeholder so the
          // launcher resolves its IIFE via /preview/{networkId}/payload.js
          if (buildFile.payloadPath) {
            html = html.split('#PAYLOAD_URL#').join(`/preview/${networkId}/payload.js`);
          }

          const utilScript = generatePreviewUtil({
            networkId,
            mraid: config?.mraid || false,
            maxSize: config ? maxSizeForFormat(config, config.format) : 0,
            mraidMode,
          });

          const injectedHtml = injectPreviewUtil(html, utilScript);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(injectedHtml);
          return;
        }

        // GET /mraid.js — empty mock
        if (url === '/mraid.js') {
          res.writeHead(200, { 'Content-Type': 'application/javascript' });
          res.end('/* MRAID mock — handled by preview-util.js */');
          return;
        }

        // GET /static/* — serve static files
        if (url.startsWith('/static/')) {
          const filePath = join(__dirname, '../../../', url);
          if (existsSync(filePath)) {
            const ext = extname(filePath);
            const mimeMap: Record<string, string> = {
              '.html': 'text/html; charset=utf-8',
              '.css': 'text/css; charset=utf-8',
              '.js': 'application/javascript; charset=utf-8',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.svg': 'image/svg+xml',
            };
            res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
            res.end(readFileSync(filePath));
            return;
          }
        }

        // 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error: ' + (err.message || String(err)));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        _port = addr.port;
        _server = server;
        resolve({ port: _port, url: `http://127.0.0.1:${_port}` });
      } else {
        reject(new Error('Failed to get server address'));
      }
    });

    server.on('error', reject);
  });
}

export async function stopPreviewServer(): Promise<void> {
  return new Promise((resolve) => {
    if (_server) {
      _server.close(() => {
        _server = null;
        _port = 0;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

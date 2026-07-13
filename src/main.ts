declare const Editor: any;

import { scanAssets, scanAssetsHybrid as _scanAssetsHybrid, createEditorQueryFn } from './core/build-report/scanner';
import type { QueryDependenciesFn } from './core/build-report/dependency-resolver';
import { compressImage, compressImageToBuffer, getImageMetadata } from './core/compression/image-compressor';
import { compressAudio, compressAudioToBuffer, isFFmpegAvailable } from './core/compression/audio-compressor';
import {
  packageForNetworks,
  extractStoreUrls,
  detectRegionalParams,
  extractAxonUsage,
  validateAxonEvents,
  buildOutputRows,
  OutputFileStat,
  fillLauncherPayloadUrl,
  getAllNetworks,
} from '@playbox-ai/playable-kit';
import { PlayboxApiClient } from './core/deployer/api-client';
import { uploadFile } from './core/deployer/uploader';
import { getProjectSettings, saveProjectSettings, getGlobalToken, saveGlobalToken, getMolocoApiKey, saveMolocoApiKey, getShowPanelOnStart, saveShowPanelOnStart, getLanguage, saveLanguage, sanitizeProjectName, toPackageConfig } from './core/settings';
import { MolocoCdnClient } from './core/deployer/moloco-cdn';
import { startPreviewServer, stopPreviewServer } from './core/preview/server';
import { runFreshnessCheck, decideAction, formatCheckResult } from './core/freshness/freshness-check';
import { runExtensionUpdate, defaultRunner } from './core/updater/update';
import {
  checkSharpAvailable,
  installSharp,
  defaultProber,
  defaultSharpInstallIO,
} from './core/compression/sharp-status';
import { classifyKit, formatKitBanner } from './core/kit/kit-freshness';
import {
  readInstalledKitVersion,
  readDeclaredRange,
  fetchKitVersions,
  installKit,
  defaultKitInstallIO,
} from './core/kit/kit-update';
import { join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

let lastBuildResult: any = null;
let _deployProgress: any = null;

/** Repo root of this extension — symlinked git working tree (dist/ → ..). */
const REPO_ROOT = join(__dirname, '..');

/** Cached freshness result; GitHub unauth API is 60/hr, so we don't re-check on every panel open. */
const FRESHNESS_TTL_MS = 10 * 60 * 1000;
let _freshnessCache: { at: number; verdict: any; action: any; status: string } | null = null;

/**
 * One-click update runs for minutes (npm install + build). A single long IPC
 * round-trip risks an editor-side timeout, so we expose start + poll instead:
 * `startUpdate` kicks the job off and returns immediately; the panel polls
 * `getUpdateState` until `running` is false.
 */
let _updateState: {
  running: boolean;
  step: string | null;
  phase: string | null;
  index: number;
  total: number;
  done: string[];
  result: any | null;
} = { running: false, step: null, phase: null, index: 0, total: 0, done: [], result: null };

function startExtensionUpdate(): { running: boolean } {
  if (_updateState.running) return { running: true };
  // The kit install rewrites node_modules too — the overlay must not land mid-way.
  if (_kitInstallState.running) return { running: false };
  _updateState = { running: true, step: null, phase: null, index: 0, total: 0, done: [], result: null };

  void runExtensionUpdate(REPO_ROOT, (e) => {
    _updateState.step = e.step;
    _updateState.phase = e.phase;
    _updateState.index = e.index;
    _updateState.total = e.total;
    if (e.phase === 'done' && !_updateState.done.includes(e.step)) _updateState.done.push(e.step);
    console.log(`[plbx] update ${e.index}/${e.total} ${e.step}: ${e.phase}`);
  })
    .then((result) => {
      _updateState = { ..._updateState, running: false, result };
      // Refresh the cached freshness verdict so the banner clears after a successful update.
      if (result.ok) _freshnessCache = null;
      console.log('[plbx] update:', result.message);
    })
    .catch((e) => {
      _updateState = {
        ..._updateState,
        running: false,
        result: { ok: false, steps: [], message: 'Update crashed: ' + (e?.message || String(e)) },
      };
    });
  return { running: true };
}

/**
 * Async sharp install, polled by the panel like the updater. `npm install sharp`
 * can take ~30s (native download), too long for a single blocking IPC request,
 * so `installSharp` kicks it off and the panel polls `getSharpInstallState`.
 */
let _sharpInstallState: { running: boolean; result: any | null } = { running: false, result: null };

function startSharpInstall(): { running: boolean } {
  if (_sharpInstallState.running) return { running: true };
  _sharpInstallState = { running: true, result: null };
  void installSharp(REPO_ROOT, defaultSharpInstallIO())
    .then((result) => {
      _sharpInstallState = { running: false, result };
      console.log('[plbx] sharp install:', result.message);
    })
    .catch((e) => {
      _sharpInstallState = {
        running: false,
        result: { ok: false, output: '', message: 'sharp install crashed: ' + (e?.message || String(e)) },
      };
    });
  return { running: true };
}

/**
 * Packaging-kit freshness. The kit (@playbox-ai/playable-kit) is an npm dependency
 * that ships inside the release bundle, so a validator patch can reach users
 * without an extension release — the panel offers a one-click install of any newer
 * kit INSIDE the declared pin. Cached like the extension check: the npm registry
 * has no business being polled on every panel open.
 */
const KIT_TTL_MS = 10 * 60 * 1000;
let _kitCache: { at: number; payload: any } | null = null;
let _kitInstallState: { running: boolean; result: any | null } = { running: false, result: null };

async function getKitFreshness(force = false): Promise<any> {
  if (!force && _kitCache && Date.now() - _kitCache.at < KIT_TTL_MS) return _kitCache.payload;

  const verdict = classifyKit({
    installed: readInstalledKitVersion(REPO_ROOT),
    range: readDeclaredRange(REPO_ROOT),
    published: await fetchKitVersions(),
  });
  // A Developer Import (git checkout) must never be mutated from under the
  // developer — self-update refuses there and so do we; show the command instead.
  const devImport = existsSync(join(REPO_ROOT, '.git'));
  const canInstall = verdict.state === 'update-available' && !devImport;
  let banner = formatKitBanner(verdict);
  if (banner && verdict.state === 'update-available' && devImport) {
    banner += ' Run "npm update @playbox-ai/playable-kit" in the extension folder.';
  }

  const payload = { verdict, banner, canInstall };
  _kitCache = { at: Date.now(), payload };
  return payload;
}

function startKitInstall(): { running: boolean } {
  // Both jobs rewrite node_modules — never let them overlap.
  if (_kitInstallState.running || _updateState.running) return { running: _kitInstallState.running };

  _kitInstallState = { running: true, result: null };
  void getKitFreshness(false)
    .then((p) =>
      p.verdict.state === 'update-available'
        ? installKit(REPO_ROOT, p.verdict.target, defaultKitInstallIO(REPO_ROOT))
        : { ok: false, output: '', message: 'No kit update available.' },
    )
    .then((result) => {
      _kitInstallState = { running: false, result };
      // Drop the cached verdict, else the banner lingers for up to 10 minutes.
      if (result.ok) _kitCache = null;
      console.log('[plbx] kit install:', result.message);
    })
    .catch((e) => {
      _kitInstallState = {
        running: false,
        result: { ok: false, output: '', message: 'Kit install crashed: ' + (e?.message || String(e)) },
      };
    });
  return { running: true };
}

async function getFreshness(force = false): Promise<{ verdict: any; action: any; status: string }> {
  const now = Date.now();
  if (!force && _freshnessCache && now - _freshnessCache.at < FRESHNESS_TTL_MS) {
    return { verdict: _freshnessCache.verdict, action: _freshnessCache.action, status: _freshnessCache.status };
  }
  const verdict = await runFreshnessCheck(REPO_ROOT);
  const action = decideAction(verdict);
  const status = formatCheckResult(verdict);
  _freshnessCache = { at: now, verdict, action, status };
  return { verdict, action, status };
}

export const load = function () {
  console.log('[plbx] Extension loaded');
  // Open the panel on start unless the developer turned it off (global pref, default on).
  void getShowPanelOnStart()
    .then((show) => {
      if (show) Editor.Panel.open('plbx-cocos-extension');
    })
    .catch(() => Editor.Panel.open('plbx-cocos-extension'));
  // Fire-and-forget freshness check — never blocks editor startup.
  void getFreshness()
    .then(({ verdict, action }) => {
      if (action.notify) {
        console.warn('[plbx] update available:', action.message);
      } else if (verdict.state === 'unknown') {
        console.log('[plbx] freshness check skipped:', verdict.reason);
      } else {
        console.log('[plbx] extension version status:', verdict.state, 'v' + verdict.localVersion);
      }
    })
    .catch((e) => console.log('[plbx] freshness check failed:', e?.message || e));
};

export const unload = function () {
  console.log('[plbx] Extension unloaded');
};

function createEditorDependencyQueryFn(editorMessage: any): QueryDependenciesFn {
  return async (uuid: string) => {
    try {
      return await editorMessage.request('asset-db', 'query-asset-dependencies', uuid);
    } catch {
      return [];
    }
  };
}

async function getSceneUuidsFromBuildSettings(
  editorMessage: any,
  buildDir?: string,
): Promise<string[]> {
  if (buildDir) {
    const settingsPath = resolve(buildDir, 'src', 'settings.json');
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
        const launchScene = settings.launch?.launchScene;
        if (launchScene) {
          try {
            const info = await editorMessage.request('asset-db', 'query-asset-info', launchScene);
            if (info?.uuid) return [info.uuid];
          } catch { /* fall through */ }
        }
      } catch { /* fall through */ }
    }
  }

  try {
    const scenes = await editorMessage.request('asset-db', 'query-assets', {
      ccType: 'cc.SceneAsset',
    });
    if (Array.isArray(scenes) && scenes.length > 0) {
      return scenes.map((s: any) => s.uuid);
    }
  } catch { /* fall through */ }

  return [];
}

/** Find the most recent Cocos build directory. Searches <projectRoot>/build/ recursively for src/settings.json. */
function detectBuildDir(lastBuildDest?: string): string | undefined {
  // 1. Use last known build dest if still on disk
  if (lastBuildDest && existsSync(lastBuildDest)) return lastBuildDest;

  const projectRoot = Editor?.Project?.path || '';
  if (!projectRoot) return undefined;
  const buildRoot = resolve(projectRoot, 'build');
  if (!existsSync(buildRoot)) return undefined;

  // 2. Recursively find all directories containing src/settings.json, pick most recently modified
  const { readdirSync, statSync: fstat } = require('fs');
  const candidates: string[] = [];

  function findSettings(dir: string, depth: number) {
    if (depth > 3) return;
    if (existsSync(resolve(dir, 'src', 'settings.json'))) {
      candidates.push(dir);
      return; // don't recurse inside a valid build dir
    }
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) findSettings(resolve(dir, entry.name), depth + 1);
      }
    } catch { /* permission error, skip */ }
  }

  findSettings(buildRoot, 0);

  if (candidates.length === 0) return undefined;

  // Pick most recently modified
  candidates.sort((a, b) => fstat(b).mtimeMs - fstat(a).mtimeMs);
  console.log(`[plbx] Auto-detected build dir: ${candidates[0]}`);
  return candidates[0];
}

export const methods: Record<string, (...args: any[]) => any> = {
  openPanel() {
    Editor.Panel.open('plbx-cocos-extension');
  },

  onBuildFinished(...args: any[]) {
    // Store build result for later use
    if (args[0]) lastBuildResult = args[0];
    Editor.Panel.open('plbx-cocos-extension');
  },

  onAutoPackageDone(result: any) {
    // Forward auto-package results to panel for display
    Editor.Message.send('plbx-cocos-extension', 'on-build-finished', {
      autoPackageResult: result,
    });
  },

  onSceneReady() {},

  // === Build Report ===
  async scanAssets() {
    const queryFn = createEditorQueryFn(Editor.Message);
    const report = await scanAssets(queryFn, Editor.Project.name || 'unknown');
    return report;
  },

  async scanAssetsHybrid() {
    const queryFn = createEditorQueryFn(Editor.Message);
    const queryDeps = createEditorDependencyQueryFn(Editor.Message);

    // Use last build result if available; otherwise scan common build output locations
    const buildDir = detectBuildDir(lastBuildResult?.dest);
    const sceneUuids = await getSceneUuidsFromBuildSettings(Editor.Message, buildDir);

    return _scanAssetsHybrid(
      queryFn, queryDeps, Editor.Project.name || 'unknown',
      buildDir,
      sceneUuids,
    );
  },

  getLastBuildResult() {
    return lastBuildResult;
  },

  // === Compression ===
  async compressImageAsset(inputPath: string, format: string, quality: number) {
    return compressImage(inputPath, { format: format as any, quality });
  },

  async compressImagePreview(inputPath: string, format: string, quality: number) {
    const { buffer, metadata } = await compressImageToBuffer(inputPath, { format: format as any, quality });
    // Return base64 for display in panel
    const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : format === 'avif' ? 'image/avif' : 'image/jpeg';
    return {
      dataUri: `data:${mime};base64,${buffer.toString('base64')}`,
      metadata,
    };
  },

  async getImageMeta(inputPath: string) {
    return getImageMetadata(inputPath);
  },

  async getAssetDataUri(inputPath: string) {
    const { readFileSync, statSync } = require('fs');
    const { extname } = require('path');
    const ext = extname(inputPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
      '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const buf = readFileSync(inputPath);
    const size = statSync(inputPath).size;
    return { dataUri: `data:${mime};base64,${buf.toString('base64')}`, size };
  },

  async checkFfmpeg() {
    return isFFmpegAvailable();
  },

  /** True if sharp loads in the worker context (image compression works). */
  async checkSharp() {
    return checkSharpAvailable(defaultProber(REPO_ROOT));
  },

  /** Kick off `npm install sharp`; returns immediately. Poll getSharpInstallState. */
  installSharp() {
    return startSharpInstall();
  },

  /** Poll target for the sharp-install popup: { running, result }. */
  getSharpInstallState() {
    return _sharpInstallState;
  },

  async compressAudioAsset(inputPath: string, format: string, bitrate: number) {
    return compressAudio(inputPath, { format: format as any, bitrate });
  },

  async compressAudioPreview(inputPath: string, format: string, bitrate: number) {
    const { buffer, metadata } = await compressAudioToBuffer(inputPath, { format: format as any, bitrate });
    const mime = format === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
    return {
      dataUri: `data:${mime};base64,${buffer.toString('base64')}`,
      metadata,
    };
  },

  // === Packaging ===
  async packageNetworks(
    buildDir: string,
    outputDir: string,
    networkIds: string[],
    config: any,
    outputTemplate?: string,
    templateVariables?: Record<string, string>,
  ) {
    const { resolve } = require('path');
    const projectRoot = Editor.Project.path || '';
    const absBuildDir  = resolve(projectRoot, buildDir);
    const absOutputDir = resolve(projectRoot, outputDir);
    // The panel sends store/orientation but NOT loaderMode/legacyLoaderNetworks
    // (not UI-exposed — settings.json only). Backfill them from saved settings
    // so the loader-engine rollback path actually reaches the packager. Explicit
    // config keys (store/orientation, or a caller that does pass loaderMode) win.
    const settings = await getProjectSettings();
    const fullConfig = { ...toPackageConfig(settings), ...config };
    // Moloco launcher metadata from project settings (Deploy tab → Moloco CDN
    // card). Explicit caller-passed templateVariables win over settings.
    const fullTemplateVariables: Record<string, string> = {
      ...(settings.molocoAssetProvider ? { assetProvider: settings.molocoAssetProvider } : {}),
      ...(settings.molocoAssetTitle ? { assetTitle: settings.molocoAssetTitle } : {}),
      ...templateVariables,
    };
    return packageForNetworks({
      buildDir: absBuildDir,
      outputDir: absOutputDir,
      networks: networkIds,
      config: fullConfig,
      outputTemplate,
      templateVariables: fullTemplateVariables,
      onProgress: (_id, _status, _msg) => {
        // TODO: 'package-progress' message has no registered listener in the extension.
        // Panel does not handle this message type, so sending it is a no-op.
        // Implement a listener in the panel before re-enabling this.
        // Editor.Message.send('plbx-cocos-extension', 'package-progress', _id, _status, _msg);
      },
    });
  },

  /**
   * Detect store URLs the game sets via code (set_google_play_url /
   * set_app_store_url) by scanning the build's source for literals. Used by the
   * Package panel to show the detected links in read-only fields. Returns empty
   * strings when none found (e.g. build not produced yet or URLs set dynamically).
   */
  detectStoreUrls(buildDir: string) {
    try {
      const { resolve } = require('path');
      const absBuildDir = resolve(Editor.Project.path || '', buildDir || '');
      const urls = extractStoreUrls(absBuildDir);
      const googlePlayUrl = urls.find((u) => u.includes('play.google.com')) ?? '';
      const appStoreUrl = urls.find((u) => u.includes('apple.com')) ?? '';
      // Regional/localization params (gl/hl, Apple /us/ country path, …) should be
      // absent so the creative serves globally. Surface inline in the panel.
      const regional: string[] = [];
      for (const u of [googlePlayUrl, appStoreUrl]) {
        if (!u) continue;
        const params = detectRegionalParams(u);
        if (params.length) regional.push(`${u} → ${params.join(', ')}`);
      }
      return { googlePlayUrl, appStoreUrl, regional };
    } catch {
      return { googlePlayUrl: '', appStoreUrl: '', regional: [] };
    }
  },

  /** Panel "Fix" button: strip regional/localization tokens from store URLs.
   *  Rewrites BOTH the build output (so the current package is clean) and the
   *  project sources under assets/ (so the fix survives the next Cocos build).
   *  Returns counts so the panel can warn that a re-package is needed. */
  fixStoreUrls(buildDir: string) {
    try {
      const { resolve, join } = require('path');
      const { fixRegionalStoreUrls } = require('./core/packager/store-url-extractor');
      const projectPath = Editor.Project.path || '';
      const absBuildDir = resolve(projectPath, buildDir || '');
      const buildRes = fixRegionalStoreUrls(absBuildDir);
      // Game sources: TypeScript under assets/ (set_app_store_url / set_google_play_url
      // literals live there). .ts is not in the default scannable set — opt in.
      const srcRes = projectPath
        ? fixRegionalStoreUrls(join(projectPath, 'assets'), { extraExtensions: ['.ts'] })
        : { fixed: 0 };
      return { fixed: buildRes.fixed, sourceFixed: srcRes.fixed };
    } catch (e) {
      console.warn('[plbx] fixStoreUrls failed:', e);
      return { fixed: 0, sourceFixed: 0 };
    }
  },

  /**
   * Scan the build source for AppLovin "Axon" playable-analytics events and
   * return spec-conformance warnings (advisory — see axon-events.ts). Used by
   * the Package panel to surface event issues after a build/scan, without
   * waiting for the network's own validator. Returns [] on any error.
   */
  scanAxonEvents(buildDir: string) {
    try {
      const { resolve } = require('path');
      const absBuildDir = resolve(Editor.Project.path || '', buildDir || '');
      const usage = extractAxonUsage(absBuildDir);
      // Use the detail (self-contained problem statement); the label is the
      // desired-state name and reads as a contradiction when prefixed to a
      // failure (e.g. "Axon analytics integrated: No … calls found").
      const warnings = validateAxonEvents(usage)
        .filter((c) => !c.ok)
        .map((c) => c.detail || c.label);
      return { warnings };
    } catch {
      return { warnings: [] as string[] };
    }
  },

  getNetworks() {
    return getAllNetworks();
  },

  // === Moloco CDN upload ===

  /** Panel settings accessors for the Moloco CDN API key (global, secret). */
  async getMolocoApiKey() {
    return getMolocoApiKey();
  },
  async saveMolocoApiKey(key: string) {
    await saveMolocoApiKey(key || '');
    return { ok: true };
  },

  /**
   * Upload the built molocoV2 payload.js to Moloco's CDN (Partner Guide §2.7)
   * and write launcher-final.html with #PAYLOAD_URL# replaced by the returned
   * asset_url. launcher-final.html is the file delivered to Moloco QA.
   */
  async uploadMolocoCdn() {
    const { resolve, join } = require('path');
    const { readFileSync, writeFileSync, existsSync } = require('fs');
    const settings = await getProjectSettings();
    const apiKey = await getMolocoApiKey();
    if (!apiKey) return { ok: false, error: 'no_api_key' };
    if (!settings.molocoAdAccountId) return { ok: false, error: 'no_ad_account_id' };

    const outDir = join(resolve(Editor.Project.path || '', settings.outputDir), 'molocoV2');
    const payloadPath = join(outDir, 'payload.js');
    const launcherPath = join(outDir, 'launcher.html');
    if (!existsSync(payloadPath)) return { ok: false, error: 'no_payload' };

    try {
      const client = new MolocoCdnClient({ apiKey, adAccountId: settings.molocoAdAccountId });
      const { assetUrl } = await client.uploadPayload(readFileSync(payloadPath));
      let launcherFinalPath = '';
      if (existsSync(launcherPath)) {
        const launcher = readFileSync(launcherPath, 'utf-8');
        launcherFinalPath = join(outDir, 'launcher-final.html');
        writeFileSync(launcherFinalPath, fillLauncherPayloadUrl(launcher, assetUrl), 'utf-8');
      }
      return { ok: true, assetUrl, launcherFinalPath };
    } catch (e: any) {
      console.warn('[plbx] uploadMolocoCdn failed:', e);
      return { ok: false, error: 'upload_failed', detail: e?.message || String(e) };
    }
  },

  // === Deploy ===
  getDeployProgress() {
    return _deployProgress;
  },

  async deploy(config: {
    projectId?: string; projectSlug?: string; projectName?: string;
    name: string; buildPath: string;
    orientations?: string[];
  }) {
    _deployProgress = null;
    const { resolve, relative, extname } = require('path');
    const { readdirSync, statSync, readFileSync } = require('fs');
    const token = await getGlobalToken();
    if (!token) throw new Error('PLBX API token not set');

    // Resolve organization context before any API calls
    const authClient = new PlayboxApiClient({
      apiUrl: 'https://app.plbx.ai/api/cli',
      apiKey: token,
    });
    const whoami = await authClient.whoami();
    const orgId = whoami.organizationId || whoami.organizations?.[0]?.id;
    if (!orgId) throw new Error('No organization found for this API key');

    const client = new PlayboxApiClient({
      apiUrl: 'https://app.plbx.ai/api/cli',
      apiKey: token,
      organizationId: orgId,
    });

    let projectId = config.projectId;
    let projectSlug = config.projectSlug;

    // Create new project if needed
    if (!projectId && !projectSlug && config.projectName) {
      const cleanName = sanitizeProjectName(config.projectName);
      if (!cleanName) throw new Error('Invalid project name');
      const project = await client.createProject(cleanName);
      projectId = project.id;
      projectSlug = project.slug;
    }
    if (!projectId && !projectSlug) throw new Error('No project selected');

    // Strip non-ASCII before slug normalization (prevents Cyrillic lookalike issues)
    const safeName = config.name.replace(/[^\x00-\x7F]/g, '');
    // Normalize deployment name to slug (same as CLI)
    const deploymentSlug = safeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!deploymentSlug) throw new Error('Deployment name must contain at least one Latin letter or digit');

    // Check if deployment already exists and auto-replace
    if (projectSlug) {
      const check = await client.checkDeploymentExists(projectSlug, deploymentSlug);
      if (check.exists) {
        await client.deleteDeploymentBySlug(projectSlug, deploymentSlug);
      }
    }

    // Scan build directory for files
    const projectRoot = Editor.Project.path || '';
    const absBuildPath = resolve(projectRoot, config.buildPath);

    const MIME_MAP: Record<string, string> = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
      '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
      '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
    };

    function scanDir(dir: string): Array<{ path: string; absolutePath: string; size: number; mimeType: string }> {
      const result: any[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          result.push(...scanDir(full));
        } else {
          const ext = extname(entry.name).toLowerCase();
          result.push({
            path: relative(absBuildPath, full).replace(/\\/g, '/'),
            absolutePath: full,
            size: statSync(full).size,
            mimeType: MIME_MAP[ext] || 'application/octet-stream',
          });
        }
      }
      return result;
    }

    if (!existsSync(absBuildPath)) throw new Error(`Build path not found: ${absBuildPath}`);
    const files = scanDir(absBuildPath);
    if (!files.length) throw new Error('No files found in build path');

    // Determine orientationLock from selected orientations
    let orientationLock: 'portrait' | 'landscape' | undefined;
    if (config.orientations?.length === 1) {
      orientationLock = config.orientations[0] as any;
    }
    // Both selected or none = no lock (auto)

    const deployment = await client.createDeployment({
      ...(projectId ? { projectId } : {}),
      ...(projectSlug ? { projectSlug } : {}),
      name: config.name,
      visibility: 'public',
      entryFile: 'index.html',
      orientationLock,
      files: files.map(f => ({ path: f.path, size: f.size, mimeType: f.mimeType })),
    });

    // Upload files with progress
    let uploadedBytes = 0;
    let uploadedCount = 0;
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    const totalCount = files.length;

    const sendProgress = (stage: string, detail?: string) => {
      _deployProgress = { stage, uploadedCount, totalCount, uploadedBytes, totalBytes, detail };
    };

    sendProgress('uploading', `0/${totalCount} files`);

    for (const file of files) {
      const uploadInfo = deployment.uploadUrls.find(u => u.path === file.path);
      if (!uploadInfo) continue;
      await uploadFile(file.absolutePath, uploadInfo.uploadUrl, file.mimeType);
      uploadedBytes += file.size;
      uploadedCount++;
      sendProgress('uploading', `${uploadedCount}/${totalCount} files`);
    }

    sendProgress('finalizing');
    const result = await client.completeDeployment(deployment.deploymentId, uploadedBytes);
    sendProgress('done');
    return result;
  },

  async plbxLogin(token: string) {
    await saveGlobalToken(token);
    const client = new PlayboxApiClient({
      apiUrl: 'https://app.plbx.ai/api/cli',
      apiKey: token,
    });
    return client.whoami();
  },

  async plbxListProjects() {
    const token = await getGlobalToken();
    if (!token) throw new Error('Not authenticated');
    const client = new PlayboxApiClient({
      apiUrl: 'https://app.plbx.ai/api/cli',
      apiKey: token,
    });
    // Resolve organization to pass as query param
    const whoami = await client.whoami();
    const orgId = whoami.organizationId || whoami.organizations?.[0]?.id;
    return client.listProjects(orgId ?? undefined);
  },

  async 'plbx-list-deployments'(projectSlug: string) {
    const token = await getGlobalToken();
    if (!token) return [];
    const client = new PlayboxApiClient({
      apiUrl: 'https://app.plbx.ai/api/cli',
      apiKey: token,
    });
    const whoami = await client.whoami();
    const orgId = whoami.organizationId || whoami.organizations?.[0]?.id;
    if (orgId) (client as any).config.organizationId = orgId;
    return client.listDeployments(projectSlug);
  },

  // === Preview ===
  async startPreview(outputDir: string, networkIds: string[]) {
    const { resolve } = require('path');
    const projectRoot = Editor.Project.path || '';
    const absOutputDir = resolve(projectRoot, outputDir);
    // Pass the saved output-naming template so the validator resolves files
    // written under a non-default scheme (otherwise it only finds {networkId}/index.html).
    const settings = await getProjectSettings();
    const result = await startPreviewServer({
      outputDir: absOutputDir,
      networks: networkIds,
      outputTemplate: settings.outputTemplate,
      templateVariables: settings.templateVariables,
    });
    // Open in default browser
    const { shell } = require('electron');
    shell.openExternal(result.url);
    return result;
  },

  async stopPreview() {
    await stopPreviewServer();
    return { stopped: true };
  },

  // === Code Generation ===
  async generateAdapter() {
    const { resolve, dirname } = require('path');
    const { existsSync, mkdirSync, writeFileSync } = require('fs');
    const projectRoot = Editor.Project.path || '';
    const filePath = resolve(projectRoot, 'assets/Scripts/plbx_html/plbx_html_playable.ts');

    if (existsSync(filePath)) {
      return { created: false, path: filePath, message: 'File already exists' };
    }

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, PLBX_ADAPTER_TEMPLATE);
    return { created: true, path: filePath, message: 'Created successfully' };
  },

  /** Generate the AppLovin/Axon playable-analytics helper next to plbx_html. */
  async generateAxonHelper() {
    const { resolve, dirname } = require('path');
    const { existsSync, mkdirSync, writeFileSync } = require('fs');
    const projectRoot = Editor.Project.path || '';
    const filePath = resolve(projectRoot, 'assets/Scripts/plbx_html/applovin_analytics.ts');

    if (existsSync(filePath)) {
      return { created: false, path: filePath, message: 'File already exists' };
    }

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, AXON_ANALYTICS_TEMPLATE);
    return { created: true, path: filePath, message: 'Created successfully' };
  },

  // === Utilities ===
  async checkPathExists(relativePath: string) {
    const { resolve } = require('path');
    const { existsSync } = require('fs');
    const projectRoot = Editor.Project.path || '';
    return existsSync(resolve(projectRoot, relativePath));
  },

  async checkOutputHasBuilds(outputDir: string) {
    const { resolve } = require('path');
    const { existsSync, readdirSync } = require('fs');
    const projectRoot = Editor.Project.path || '';
    const absPath = resolve(projectRoot, outputDir);
    if (!existsSync(absPath)) return false;
    try {
      const entries = readdirSync(absPath);
      // Has at least one entry (network folder or flat file)
      return entries.length > 0;
    } catch {
      return false;
    }
  },

  /**
   * List existing build entry-point files in the output directory so the panel
   * can show them on open (without re-running Package). Returns display rows
   * shaped like fresh PackageResults plus creation date fields. One row per
   * network: a flat `{networkId}.{ext}` file, or the entry point inside a
   * `{networkId}/` folder (index.* preferred, else the first html/zip at the
   * folder root). Nested asset files are ignored.
   */
  async listOutputBuilds(outputDir: string) {
    const { resolve } = require('path');
    const { existsSync, readdirSync, statSync } = require('fs');
    const projectRoot = Editor.Project.path || '';
    const absPath = resolve(projectRoot, outputDir);
    if (!existsSync(absPath)) return [];

    const BUILD_EXTS = ['.html', '.zip'];
    const isBuildFile = (name: string) =>
      BUILD_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

    /** birthtime is unreliable on some filesystems (0) → fall back to mtime. */
    const createdAtOf = (filePath: string): number => {
      try {
        const st = statSync(filePath);
        return st.birthtimeMs && st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs;
      } catch {
        return 0;
      }
    };

    const stats: OutputFileStat[] = [];
    try {
      for (const entry of readdirSync(absPath, { withFileTypes: true })) {
        if (entry.isFile() && isBuildFile(entry.name)) {
          // Flat build: {networkId}.{ext}
          const full = resolve(absPath, entry.name);
          stats.push({ path: entry.name, size: statSync(full).size, createdAt: createdAtOf(full) });
        } else if (entry.isDirectory()) {
          // Per-network folder: pick the entry point (index.* preferred).
          let names: string[];
          try {
            names = readdirSync(resolve(absPath, entry.name), { withFileTypes: true })
              .filter((e: any) => e.isFile() && isBuildFile(e.name))
              .map((e: any) => e.name);
          } catch {
            continue;
          }
          const pick =
            names.find((n) => /^index\.(html|zip)$/i.test(n)) ??
            names.find((n) => isBuildFile(n));
          if (!pick) continue;
          const full = resolve(absPath, entry.name, pick);
          stats.push({
            path: `${entry.name}/${pick}`,
            size: statSync(full).size,
            createdAt: createdAtOf(full),
          });
        }
      }
    } catch {
      return [];
    }

    return buildOutputRows(stats);
  },

  async openFolder(folderPath: string) {
    const { resolve } = require('path');
    const { existsSync } = require('fs');
    const projectRoot = Editor.Project.path || '';
    const absPath = resolve(projectRoot, folderPath);
    if (!existsSync(absPath)) {
      throw new Error(`Folder not found: ${absPath}`);
    }
    const { shell } = require('electron');
    shell.openPath(absPath);
  },

  // === Settings ===
  async getSettings() {
    return getProjectSettings();
  },

  async saveSettings(settings: any) {
    return saveProjectSettings(settings);
  },

  /** Byte cost the PLBX splash adds to each HTML build (uncompressed). */
  getSplashInfo() {
    const { splashByteCost } = require('./core/packager/splash');
    return { bytes: splashByteCost() };
  },

  /** Open a file dialog to pick a custom splash logo. Returns the chosen path. */
  async pickSplashLogo() {
    try {
      const res = await Editor.Dialog.select({
        title: 'Select splash logo',
        type: 'file',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      });
      const path = res?.filePaths?.[0];
      return { canceled: !path, path: path || '' };
    } catch (e: any) {
      return { canceled: true, path: '', error: String(e?.message || e) };
    }
  },

  /** Preview + build-cost for a custom splash logo. `bytes` already counts the
   *  base64 (+~33%) form, since the logo is embedded as a data: URL. */
  getSplashLogoInfo(path: string) {
    const { resolveSplashLogoDataUrl } = require('./core/packager/packager');
    const { splashByteCost } = require('./core/packager/splash');
    const dataUrl = resolveSplashLogoDataUrl(path);
    if (!dataUrl) return { ok: false, error: 'unreadable' };
    return { ok: true, dataUrl, bytes: splashByteCost({ customLogo: { dataUrl } }) };
  },

  async getToken() {
    return getGlobalToken();
  },

  async saveToken(token: string) {
    return saveGlobalToken(token);
  },

  getVersion() {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
      return pkg.version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  },

  /**
   * Report whether this dev-imported checkout is behind the public GitHub repo.
   * Returns { verdict, action } — both plain JSON. `force` bypasses the cache
   * (e.g. a manual "check now" button).
   */
  async checkFreshness(force?: boolean) {
    try {
      return await getFreshness(force === true);
    } catch (e: any) {
      return {
        verdict: { state: 'unknown', localVersion: '', latestVersion: '', reason: e?.message || String(e) },
        action: { notify: false, severity: 'info', message: '' },
      };
    }
  },

  /** Kick off the one-click update (download prebuilt release → verify → overlay). Returns immediately. */
  startUpdate() {
    return startExtensionUpdate();
  },

  /** Poll target for the panel: { running, result } of the in-flight/last update. */
  getUpdateState() {
    return _updateState;
  },

  /**
   * Is a newer packaging kit published inside our declared pin?
   * Returns { verdict, banner, canInstall } — plain JSON. Cached 10 min; `force` re-checks.
   */
  async checkKitVersion(force?: boolean) {
    try {
      return await getKitFreshness(force === true);
    } catch (e: any) {
      return {
        verdict: {
          state: 'unknown',
          installed: '',
          range: '',
          target: '',
          latest: '',
          reason: e?.message || String(e),
        },
        banner: '',
        canInstall: false,
      };
    }
  },

  /** Kick off the kit install (scratch resolve → nested move). Poll getKitUpdateState. */
  startKitUpdate() {
    return startKitInstall();
  },

  getKitUpdateState() {
    return _kitInstallState;
  },

  /**
   * After a successful update, prompt the developer to restart so the editor
   * reloads the rebuilt dist/main.js (Cocos caches the loaded module — there is
   * no programmatic "reload extension"; only a full quit + reopen, or the
   * Developer → Reload menu, picks up new main-process code).
   * Returns { quit: true } if the user chose to quit now.
   */
  async promptRestart() {
    try {
      const r = await Editor.Dialog.info('Playbox extension updated.', {
        title: 'Playbox',
        detail:
          'Restart Cocos Editor to load the new version.\n' +
          'Quit now and reopen, or use the Developer → Reload menu.',
        buttons: ['Quit editor now', 'Later'],
        default: 1,
        cancel: 1,
      });
      if (r && r.response === 0) {
        Editor.App.quit();
        return { quit: true };
      }
    } catch (e: any) {
      console.log('[plbx] promptRestart failed:', e?.message || e);
    }
    return { quit: false };
  },

  /** Global pref: auto-open the panel on editor start (default true). */
  async getShowPanelOnStart() {
    return getShowPanelOnStart();
  },

  async saveShowPanelOnStart(show: boolean) {
    await saveShowPanelOnStart(show === true);
    return { ok: true };
  },

  /** Global pref: panel UI language ('en' | 'ru' | 'zh', default 'en'). */
  async getLanguage() {
    return getLanguage();
  },

  async saveLanguage(lang: string) {
    await saveLanguage(lang);
    return { ok: true };
  },
};

const PLBX_ADAPTER_TEMPLATE = `/**
 * plbx_html playable adapter
 * Generated by Playbox extension.
 *
 * One adapter wires every ad network the extension supports — MRAID
 * (AppLovin/Unity/IronSource), Facebook/Moloco (FbPlayableAd), Mintegral
 * (window.install), Google (ExitApi), TikTok/Pangle (playableSDK), and
 * Moloco V2.0 (Launcher API) with MOLOCO_MACROS beacons.
 *
 * Usage:
 *   import plbx from './plbx_html/plbx_html_playable';
 *   plbx.download();       // redirect to store
 *   plbx.game_end();       // notify ad network that gameplay ended
 *   plbx.is_audio();       // check if audio is allowed
 *   plbx.expose(name, fn); // register a command external callers can trigger
 *
 * --- Wire these calls into your Cocos game lifecycle ---
 *
 *   1. onLoad / scene init:        plbx.game_ready();
 *   2. every user tap:             plbx.tap();
 *   3. CTA button onClick:         plbx.download();
 *   4. level finished:             plbx.game_end();
 *   5. before audio init:          if (plbx.is_muted()) ctx.suspend();
 *
 * Without these calls, network validators (Moloco V2, Mintegral PlayTurbo,
 * etc.) will not detect lifecycle beacons and may flag the creative.
 *
 * --- Optional: external commands (preview "Game commands" toolbar) ---
 *
 * Register handlers external callers (ad container, test harness, or the
 * Playbox panel preview) can invoke. The preview renders one button per
 * registered command, so you can drive these states without playing through:
 *
 *   onLoad() {
 *       plbx.expose('show_endcard', () => this.showEndcard(), 'Show endcard');
 *       plbx.expose('restart',      () => this.restart(),      'Restart');
 *   }
 *
 * Register AFTER the scene can handle the action. External callers then trigger
 * it via window.plbx_html.show_endcard(). The optional 3rd arg is the preview
 * button label (defaults to the command name).
 */
export class plbx_html_playable {

    /**
     * Call when the user taps the CTA / DOWNLOAD button.
     * Fires the network click beacon and opens the store URL.
     */
    download() {
        console.log("[plbx] download");
        //@ts-ignore
        if (window.plbx_html) { plbx_html.download(); }
        //@ts-ignore
        else if (window.super_html) { super_html.download(); }
    }

    /**
     * Call ONCE when the scene is loaded and the game is ready to display.
     * Fires the game_viewable beacon (Moloco V2) and gameReady signal
     * (Mintegral / TikTok / Pangle validators).
     */
    game_ready() {
        console.log("[plbx] game_ready");
        //@ts-ignore
        if (window.plbx_html && plbx_html.game_ready) { plbx_html.game_ready(); }
        //@ts-ignore
        else if (window.super_html && super_html.game_ready) { super_html.game_ready(); }
    }

    /**
     * Call when the playable level / gameplay session finishes (success or fail).
     * Fires the complete beacon and gameEnd signal.
     */
    game_end() {
        console.log("[plbx] game_end");
        //@ts-ignore
        if (window.plbx_html) { plbx_html.game_end(); }
        //@ts-ignore
        else if (window.super_html) { super_html.game_end(); }
    }

    /**
     * Call on every meaningful user tap / interaction.
     * Used by Moloco V2 to count taps against taps_for_engagement /
     * taps_for_redirection thresholds. Safe no-op on non-Moloco networks.
     */
    tap() {
        //@ts-ignore
        if (window.plbx_html && plbx_html.tap) { plbx_html.tap(); }
        //@ts-ignore
        else if (window.super_html && super_html.tap) { super_html.tap(); }
    }

    /**
     * Fire a custom MOLOCO_MACROS beacon by key. Use for ad-hoc tracking
     * outside the standard lifecycle (e.g. "tutorial_completed").
     * No-op on non-Moloco networks.
     */
    report(eventKey: string) {
        //@ts-ignore
        if (window.plbx_html && plbx_html.report) { plbx_html.report(eventKey); }
        //@ts-ignore
        else if (window.super_html && super_html.report) { super_html.report(eventKey); }
    }

    is_audio(): boolean {
        //@ts-ignore
        if (window.plbx_html && plbx_html.is_audio) {
            //@ts-ignore
            return plbx_html.is_audio();
        }
        //@ts-ignore
        if (window.super_html && super_html.is_audio) {
            //@ts-ignore
            return super_html.is_audio();
        }
        return true;
    }

    /**
     * Returns the current muted state of the ad container. Seeded from the
     * start-time signal (Moloco V2 MOLOCO_MACROS.start_muted, etc.) and kept
     * live via MRAID audioVolumeChange. Call before initializing AudioContext
     * or unmuting any media element. For continuous reaction use on_mute_change.
     */
    is_muted(): boolean {
        //@ts-ignore
        if (window.plbx_html && plbx_html.is_muted) {
            //@ts-ignore
            return plbx_html.is_muted();
        }
        //@ts-ignore
        if (window.super_html && super_html.is_muted) {
            //@ts-ignore
            return super_html.is_muted();
        }
        return false;
    }

    /**
     * Subscribe to live mute changes. The callback fires immediately with the
     * current state, then again whenever the ad container's volume crosses
     * mute/unmute (MRAID audioVolumeChange). Use this to start/stop music in
     * response to the user toggling sound on the ad wrapper mid-playback.
     * No-op on networks without a live volume signal (callback still gets the
     * initial state once).
     */
    on_mute_change(cb: (muted: boolean) => void): void {
        //@ts-ignore
        if (window.plbx_html && plbx_html.on_mute_change) {
            //@ts-ignore
            plbx_html.on_mute_change(cb);
            return;
        }
        //@ts-ignore
        if (window.super_html && super_html.on_mute_change) {
            //@ts-ignore
            super_html.on_mute_change(cb);
            return;
        }
        // Fallback: deliver the one-shot current state so callers can rely on
        // at least one invocation.
        try { cb(this.is_muted()); } catch (e) { /* ignore */ }
    }

    is_hide_download(): boolean {
        //@ts-ignore
        if (window.plbx_html && plbx_html.is_hide_download) {
            //@ts-ignore
            return plbx_html.is_hide_download();
        }
        return false;
    }

    set_google_play_url(url: string) {
        //@ts-ignore
        if (window.plbx_html) { plbx_html.google_play_url = url; }
        //@ts-ignore
        if (window.super_html) { super_html.google_play_url = url; }
    }

    set_app_store_url(url: string) {
        //@ts-ignore
        if (window.plbx_html) { plbx_html.appstore_url = url; }
        //@ts-ignore
        if (window.super_html) { super_html.appstore_url = url; }
    }

    /**
     * Register a named command that external callers can invoke — the ad
     * container, a test harness, or the Playbox panel preview (which renders a
     * trigger button per command in its "Game commands" toolbar).
     *
     *   plbx.expose('show_endcard', () => this.showEndcard(), 'Show endcard');
     *
     * The game implements 'fn'; external callers trigger it via
     * window.plbx_html.<name>(). 'label' is the preview button text (defaults to
     * name). Register after your scene is ready to handle the action.
     */
    expose(name: string, fn: () => void, label?: string) {
        //@ts-ignore
        if (window.plbx_html && plbx_html.expose) { plbx_html.expose(name, fn, label); }
        //@ts-ignore
        else if (window.super_html && super_html.expose) { super_html.expose(name, fn, label); }
        else { console.log("[plbx] expose unavailable (update the Playbox extension): " + name); }
    }
}
export default new plbx_html_playable();
`;

const AXON_ANALYTICS_TEMPLATE = `/**
 * AppLovin analytics helper for playable ads.
 *
 * Sends events through window.ALPlayableAnalytics.trackEvent() when available.
 * Each event is deduplicated and sent at most once.
 *
 * Reference:
 * https://support.axon.ai/en/growth/promoting-your-apps/creatives/playable-analytics-integration
 */

export enum AppLovinEvent {
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  DISPLAYED = 'DISPLAYED',
  CHALLENGE_STARTED = 'CHALLENGE_STARTED',
  CHALLENGE_PASS_25 = 'CHALLENGE_PASS_25',
  CHALLENGE_PASS_50 = 'CHALLENGE_PASS_50',
  CHALLENGE_PASS_75 = 'CHALLENGE_PASS_75',
  CHALLENGE_FAILED = 'CHALLENGE_FAILED',
  CHALLENGE_RETRY = 'CHALLENGE_RETRY',
  CHALLENGE_SOLVED = 'CHALLENGE_SOLVED',
  ENDCARD_SHOWN = 'ENDCARD_SHOWN',
  CTA_CLICKED = 'CTA_CLICKED',
}

class AppLovinAnalyticsManager {
  private readonly sentEvents: Set<string> = new Set();
  private readonly queuedEvents: Set<string> = new Set();
  private readonly eventQueue: AppLovinEvent[] = [];
  private isDrainingQueue: boolean = false;
  private lastSentAtMs: number = 0;
  private readonly minEventSpacingMs: number = 75;

  public send(eventName: AppLovinEvent): void {
    if (this.sentEvents.has(eventName) || this.queuedEvents.has(eventName)) {
      return;
    }

    this.queuedEvents.add(eventName);
    this.eventQueue.push(eventName);
    this.drainQueue();
  }

  private drainQueue(): void {
    if (this.isDrainingQueue || this.eventQueue.length === 0) {
      return;
    }

    this.isDrainingQueue = true;
    const elapsedMs = Date.now() - this.lastSentAtMs;
    const delayMs = this.lastSentAtMs === 0
      ? 0
      : Math.max(0, this.minEventSpacingMs - elapsedMs);

    setTimeout(() => {
      const eventName = this.eventQueue.shift();
      if (eventName) {
        this.sendNow(eventName);
      }

      this.isDrainingQueue = false;
      this.drainQueue();
    }, delayMs);
  }

  private sendNow(eventName: AppLovinEvent): void {
    this.queuedEvents.delete(eventName);
    this.sentEvents.add(eventName);
    this.lastSentAtMs = Date.now();

    try {
      // @ts-ignore AppLovin injects this object in production.
      if (typeof window !== 'undefined' && typeof window.ALPlayableAnalytics !== 'undefined') {
        // @ts-ignore AppLovin SDK runtime API.
        window.ALPlayableAnalytics.trackEvent(eventName);
      }
    } catch {
      // Ignore analytics errors during local testing or on other networks.
    }

    console.log(\`[AppLovin] Event sent: \${eventName}\`);
  }

  public isSent(eventName: AppLovinEvent): boolean {
    return this.sentEvents.has(eventName) || this.queuedEvents.has(eventName);
  }

  public reset(): void {
    this.sentEvents.clear();
    this.queuedEvents.clear();
    this.eventQueue.length = 0;
    this.isDrainingQueue = false;
    this.lastSentAtMs = 0;
  }
}

export const applovinAnalytics = new AppLovinAnalyticsManager();
`;

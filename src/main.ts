declare const Editor: any;

import { scanAssets, scanAssetsHybrid as _scanAssetsHybrid, createEditorQueryFn } from './core/build-report/scanner';
import type { QueryDependenciesFn } from './core/build-report/dependency-resolver';
import { compressImage, compressImageToBuffer, getImageMetadata } from './core/compression/image-compressor';
import { compressAudio, compressAudioToBuffer, isFFmpegAvailable } from './core/compression/audio-compressor';
import { packageForNetworks } from './core/packager/packager';
import { PlayboxApiClient } from './core/deployer/api-client';
import { uploadFile } from './core/deployer/uploader';
import { getProjectSettings, saveProjectSettings, getGlobalToken, saveGlobalToken } from './core/settings';
import { startPreviewServer, stopPreviewServer } from './core/preview/server';
import { getAllNetworks } from './shared/networks';
import { join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

let lastBuildResult: any = null;
let _deployProgress: any = null;

export const load = function () {
  console.log('[plbx] Extension loaded');
  Editor.Panel.open('plbx-cocos-extension');
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
    return packageForNetworks({
      buildDir: absBuildDir,
      outputDir: absOutputDir,
      networks: networkIds,
      config,
      outputTemplate,
      templateVariables,
      onProgress: (_id, _status, _msg) => {
        // TODO: 'package-progress' message has no registered listener in the extension.
        // Panel does not handle this message type, so sending it is a no-op.
        // Implement a listener in the panel before re-enabling this.
        // Editor.Message.send('plbx-cocos-extension', 'package-progress', _id, _status, _msg);
      },
    });
  },

  getNetworks() {
    return getAllNetworks();
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
      const project = await client.createProject(config.projectName);
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
    const result = await startPreviewServer({ outputDir: absOutputDir, networks: networkIds });
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
};

const PLBX_ADAPTER_TEMPLATE = `/**
 * plbx_html playable adapter
 * Generated by Playbox extension.
 *
 * Usage:
 *   import plbx from './plbx_html/plbx_html_playable';
 *   plbx.download();       // redirect to store
 *   plbx.game_end();       // notify ad network that gameplay ended
 *   plbx.is_audio();       // check if audio is allowed
 */
export class plbx_html_playable {

    download() {
        console.log("[plbx] download");
        //@ts-ignore
        if (window.plbx_html) { plbx_html.download(); }
        //@ts-ignore
        else if (window.super_html) { super_html.download(); }
    }

    game_end() {
        console.log("[plbx] game_end");
        //@ts-ignore
        if (window.plbx_html) { plbx_html.game_end(); }
        //@ts-ignore
        else if (window.super_html) { super_html.game_end(); }
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
}
export default new plbx_html_playable();
`;

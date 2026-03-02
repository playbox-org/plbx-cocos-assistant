declare const Editor: any;

import { scanAssets, createEditorQueryFn } from './core/build-report/scanner';
import { compressImage, compressImageToBuffer, getImageMetadata } from './core/compression/image-compressor';
import { compressAudio, compressAudioToBuffer, isFFmpegAvailable } from './core/compression/audio-compressor';
import { packageForNetworks } from './core/packager/packager';
import { PlayboxApiClient } from './core/deployer/api-client';
import { uploadFile } from './core/deployer/uploader';
import { getProjectSettings, saveProjectSettings, getGlobalToken, saveGlobalToken } from './core/settings';
import { getAllNetworks } from './shared/networks';
import { join } from 'path';
import { existsSync } from 'fs';

let lastBuildResult: any = null;
let _deployProgress: any = null;

export const load = function () {
  console.log('[plbx] Extension loaded');
  Editor.Panel.open('plbx-cocos-extension');
};

export const unload = function () {
  console.log('[plbx] Extension unloaded');
};

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
  async packageNetworks(buildDir: string, outputDir: string, networkIds: string[], config: any) {
    const { resolve } = require('path');
    const projectRoot = Editor.Project.path || '';
    const absBuildDir  = resolve(projectRoot, buildDir);
    const absOutputDir = resolve(projectRoot, outputDir);
    return packageForNetworks({
      buildDir: absBuildDir,
      outputDir: absOutputDir,
      networks: networkIds,
      config,
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
    projectId?: string; projectName?: string;
    name: string; buildPath: string;
    orientations?: string[];
  }) {
    _deployProgress = null;
    const { resolve, relative, extname } = require('path');
    const { readdirSync, statSync, readFileSync } = require('fs');
    const token = await getGlobalToken();
    if (!token) throw new Error('PLBX API token not set');

    const client = new PlayboxApiClient({
      apiUrl: 'https://app.plbx.ai/api/cli',
      apiKey: token,
    });

    let projectId = config.projectId;

    // Create new project if needed
    if (!projectId && config.projectName) {
      const project = await client.createProject(config.projectName);
      projectId = project.id;
    }
    if (!projectId) throw new Error('No project selected');

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
      projectId,
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
    return client.listProjects();
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

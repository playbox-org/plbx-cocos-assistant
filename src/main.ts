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

export const load = function () {
  console.log('[plbx] Extension loaded');
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
  async deploy(config: { projectId: string; name: string; entryPoint: string; files: any[]; buildPath: string }) {
    const token = await getGlobalToken();
    if (!token) throw new Error('PLBX API token not set');

    const client = new PlayboxApiClient({
      apiUrl: 'https://app.plbx.ai/api/cli',
      apiKey: token,
    });

    // TODO: config.files is always passed as [] from the panel (see default.ts deploy call).
    // The API expects a list of DeploymentFile descriptors to generate uploadUrls.
    // With an empty list the API likely returns no uploadUrls and no files are uploaded.
    // Fix: scan buildPath for files and populate this list before calling createDeployment.
    const deployment = await client.createDeployment({
      projectId: config.projectId,
      name: config.name,
      entryPoint: config.entryPoint,
      files: config.files,
    });

    // Upload files
    for (const [filePath, url] of Object.entries(deployment.uploadUrls)) {
      const fullPath = join(config.buildPath, filePath);
      if (existsSync(fullPath)) {
        await uploadFile(fullPath, url as string, 'application/octet-stream');
      }
    }

    const result = await client.completeDeployment(deployment.deploymentId);
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

import { readFileSync, mkdirSync, existsSync, writeFileSync, cpSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { HtmlBuilder } from './html-builder';
import { getAdapter } from './network-adapters';
import { buildZip } from './zip-builder';
import { getNetwork, NETWORKS } from '../../shared/networks';
import { PackageResult } from '../../shared/types';
import { PackagerOptions, PackagerResult } from './types';
import { fileToDataUri } from './asset-inliner';

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
      const networkOutDir = join(options.outputDir, networkId);
      mkdirSync(networkOutDir, { recursive: true });

      // Clone HTML and apply network adapter
      const builder = new HtmlBuilder(baseHtml);
      adapter.transform(builder, options.config);

      let outputPath: string;
      let outputSize: number;

      // Determine formats to build
      // Some networks support dual format (both html and zip)
      const formats: Array<'html' | 'zip'> = [network.format];
      if (network.dualFormat) {
        formats.push(network.format === 'html' ? 'zip' : 'html');
      }

      // Build primary format
      if (network.format === 'html' || network.inlineAssets) {
        // Single HTML — inline all assets
        // For now: just write the transformed HTML
        // In full implementation: inline all external CSS/JS/images as data URIs
        const finalHtml = builder.toHtml();
        outputPath = join(networkOutDir, 'index.html');
        writeFileSync(outputPath, finalHtml);
        outputSize = Buffer.byteLength(finalHtml, 'utf-8');
      } else {
        // ZIP — copy build dir + transformed HTML + extras
        const tempDir = join(networkOutDir, '_temp');
        mkdirSync(tempDir, { recursive: true });

        // Copy build assets to temp dir
        cpSync(options.buildDir, tempDir, { recursive: true });

        // Overwrite index.html with transformed version
        writeFileSync(join(tempDir, 'index.html'), builder.toHtml());

        // Build ZIP
        const zipPath = join(networkOutDir, `${networkId}.zip`);
        const extraFiles: Array<{ zipPath: string; content: string }> = [];

        // Add config.json if adapter provides it
        const zipConfig = adapter.getZipConfig(options.config);
        if (zipConfig) {
          extraFiles.push({
            zipPath: 'config.json',
            content: JSON.stringify(zipConfig),
          });
        }

        const zipResult = await buildZip({
          sourceDir: tempDir,
          outputPath: zipPath,
          prefix: network.zipStructure || '',
          jsBundleName: adapter.getJsBundleName() || undefined,
          extraFiles,
        });

        outputPath = zipResult.outputPath;
        outputSize = zipResult.size;

        // Clean up temp dir
        rmSync(tempDir, { recursive: true, force: true });
      }

      options.onProgress?.(networkId, 'done');

      results.push({
        networkId,
        networkName: network.name,
        outputPath,
        outputSize,
        maxSize: network.maxSize,
        withinLimit: outputSize <= network.maxSize,
        format: network.format,
      });

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

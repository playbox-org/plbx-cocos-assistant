import { readFileSync, mkdirSync, existsSync, writeFileSync, cpSync, rmSync, readdirSync, statSync } from 'fs';
import { join, basename, relative, extname } from 'path';
import { HtmlBuilder } from './html-builder';
import { getAdapter } from './network-adapters';
import { buildZip } from './zip-builder';
import { getNetwork, NETWORKS } from '../../shared/networks';
import { PackageResult, OutputFormat } from '../../shared/types';
import { PackagerOptions, PackagerResult } from './types';
import { packDirectoryToZip } from './asset-inliner';
import { generateFullHtml } from './runtime-loader';

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

      // Determine all formats to build
      const formats: OutputFormat[] = [network.format];
      if (network.dualFormat) {
        formats.push(network.format === 'html' ? 'zip' : 'html');
      }

      for (const format of formats) {
        const formatSuffix = formats.length > 1 ? `-${format}` : '';
        let outputPath: string;
        let outputSize: number;

        if (format === 'html') {
          // Single HTML — pack all assets into ZIP, embed with runtime loader
          options.onProgress?.(networkId, 'processing', `Building ${format.toUpperCase()}...`);

          const zipBuffer = await packDirectoryToZip(options.buildDir);
          const zipBase64 = zipBuffer.toString('base64');

          // Extract JS files for pre-population (faster loading)
          const jsModules = extractJsModules(options.buildDir);

          const finalHtml = generateFullHtml({
            originalHtml: builder.toHtml(),
            zipBase64,
            jsModules,
          });

          outputPath = join(networkOutDir, `index${formatSuffix}.html`);
          writeFileSync(outputPath, finalHtml);
          outputSize = Buffer.byteLength(finalHtml, 'utf-8');
        } else {
          // ZIP — copy build dir + transformed HTML + extras
          options.onProgress?.(networkId, 'processing', `Building ZIP...`);

          const tempDir = join(networkOutDir, '_temp');
          mkdirSync(tempDir, { recursive: true });

          cpSync(options.buildDir, tempDir, { recursive: true });
          writeFileSync(join(tempDir, 'index.html'), builder.toHtml());

          const zipPath = join(networkOutDir, `${networkId}${formatSuffix}.zip`);
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
            outputPath: zipPath,
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
 * Extract JS module contents from a build directory for pre-populating window.__res.
 * This allows the runtime loader to execute JS modules without waiting for ZIP unpack.
 */
function extractJsModules(buildDir: string): Record<string, string> {
  const modules: Record<string, string> = {};

  function scanDir(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (extname(entry.name) === '.js') {
        const relPath = relative(buildDir, fullPath);
        modules[relPath] = readFileSync(fullPath, 'utf-8');
      }
    }
  }

  scanDir(buildDir);
  return modules;
}

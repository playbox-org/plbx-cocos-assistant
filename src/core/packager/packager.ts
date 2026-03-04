import { readFileSync, mkdirSync, existsSync, writeFileSync, cpSync, rmSync, readdirSync, statSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { HtmlBuilder } from './html-builder';
import { getAdapter } from './network-adapters';
import { buildZip } from './zip-builder';
import { getNetwork, NETWORKS } from '../../shared/networks';
import { PackageResult, OutputFormat } from '../../shared/types';
import { PackagerOptions, PackagerResult } from './types';
import { packDirectoryToZip } from './asset-inliner';
import { generateFullHtml } from './runtime-loader';
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

        if (format === 'html') {
          // Single HTML — pack ALL assets into ZIP (like super-html), embed with runtime loader
          // JS compressed inside ZIP is much more efficient than storing as raw JSON strings
          options.onProgress?.(networkId, 'processing', `Building ${format.toUpperCase()}...`);

          // Pack everything except index.html (already in the HTML wrapper) and CSS (inlined)
          const zipBuffer = await packDirectoryToZip(
            options.buildDir, undefined,
            { excludeExtensions: ['.css', '.html'] },
          );
          const zipBase64 = zipBuffer.toString('base64');

          // Extract and minify CSS for inline injection
          const cssContent = extractAndMinifyCss(options.buildDir);

          const finalHtml = generateFullHtml({
            originalHtml: builder.toHtml(),
            zipBase64,
            cssContent,
            buildDir: options.buildDir,
          });

          writeFileSync(outputPath, finalHtml);
          outputSize = statSync(outputPath).size;
        } else {
          // ZIP — copy build dir + transformed HTML + extras
          options.onProgress?.(networkId, 'processing', `Building ZIP...`);

          const tempDir = join(dirname(outputPath), `_temp_${networkId}`);
          mkdirSync(tempDir, { recursive: true });

          cpSync(options.buildDir, tempDir, { recursive: true });
          writeFileSync(join(tempDir, 'index.html'), builder.toHtml());

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

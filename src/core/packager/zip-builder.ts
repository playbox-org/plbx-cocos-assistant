import JSZip from 'jszip';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, extname } from 'path';

export interface ZipOptions {
  /** Base directory to pack */
  sourceDir: string;
  /** Output ZIP file path */
  outputPath: string;
  /** Optional prefix path inside ZIP (e.g. 'mintegral/' for Mintegral) */
  prefix?: string;
  /** Custom JS bundle name (rename first .js file found) */
  jsBundleName?: string;
  /** Extra files to add (e.g. config.json) */
  extraFiles?: Array<{ zipPath: string; content: string | Buffer }>;
  /** Whether to inline assets into the HTML (false for ZIP networks) */
  inlineAssets?: boolean;
}

export async function buildZip(options: ZipOptions): Promise<{ outputPath: string; size: number }> {
  const zip = new JSZip();
  const prefix = options.prefix || '';

  // Recursively add files from sourceDir
  function addDir(currentPath: string) {
    const entries = readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        addDir(fullPath);
      } else {
        let relativePath = relative(options.sourceDir, fullPath);
        // Rename JS bundle if specified
        if (options.jsBundleName && relativePath.endsWith('.js') && !relativePath.includes('/')) {
          // Only rename top-level JS files that look like the main bundle
          if (relativePath === 'main.js' || relativePath === 'index.js' || relativePath.includes('application')) {
            relativePath = options.jsBundleName;
          }
        }
        zip.file(prefix + relativePath, readFileSync(fullPath));
      }
    }
  }

  addDir(options.sourceDir);

  // Add extra files (e.g. config.json for TikTok)
  if (options.extraFiles) {
    for (const file of options.extraFiles) {
      const content = typeof file.content === 'string' ? file.content : file.content;
      zip.file(prefix + file.zipPath, content);
    }
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  writeFileSync(options.outputPath, buffer);
  return { outputPath: options.outputPath, size: buffer.length };
}

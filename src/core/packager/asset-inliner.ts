import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import JSZip from 'jszip';

// Simple MIME type map (no external dependency)
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.html': 'text/html',
};

function getMimeType(filePath: string): string {
  return MIME_MAP[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** Convert a file to a base64 data URI string */
export function fileToDataUri(filePath: string): string {
  const content = readFileSync(filePath);
  const mime = getMimeType(filePath);
  return `data:${mime};base64,${content.toString('base64')}`;
}

/** Convert a buffer to a base64 data URI string */
export function bufferToDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Pack a directory into a ZIP buffer.
 * Recursively adds all files.
 */
export async function packDirectoryToZip(dirPath: string, basePath?: string): Promise<Buffer> {
  const zip = new JSZip();
  const base = basePath || dirPath;

  function addDir(currentPath: string) {
    const entries = readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        addDir(fullPath);
      } else {
        const relativePath = relative(base, fullPath);
        zip.file(relativePath, readFileSync(fullPath));
      }
    }
  }

  addDir(dirPath);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

/**
 * Create a `window.__zip = "<base64>"` injection string from a directory.
 * This is the super-html pattern for embedding all game assets.
 */
export async function createZipInjection(dirPath: string): Promise<string> {
  const zipBuffer = await packDirectoryToZip(dirPath);
  const base64 = zipBuffer.toString('base64');
  return `window.__zip = "${base64}";`;
}

/**
 * Pack specific files into a ZIP with optional custom structure.
 * Returns the ZIP buffer.
 */
export async function packFilesToZip(
  files: Array<{ path: string; zipPath: string }>,
): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.zipPath, readFileSync(file.path));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

/**
 * Get the total size of a directory in bytes.
 */
export function getDirectorySize(dirPath: string): number {
  let total = 0;
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySize(fullPath);
    } else {
      total += statSync(fullPath).size;
    }
  }
  return total;
}

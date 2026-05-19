import { join } from 'path';
import { spawn } from 'child_process';
import { CompressionOptions, CompressionResult, ImageMetadata } from './types';

// sharp is loaded in a separate Node.js child process to avoid native ABI mismatch
// between Cocos Creator's Electron and the sharp binary compiled for plain Node.js.
const WORKER = join(__dirname, '..', '..', '..', 'sharp-worker.js');

function runWorker<T>(command: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [WORKER], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('error', (e: Error) => reject(new Error('sharp worker spawn failed: ' + e.message)));
    child.on('close', (code: number | null) => {
      if (code === 0) {
        try { resolve(JSON.parse(out)); } catch { reject(new Error('sharp worker invalid JSON: ' + out)); }
      } else {
        reject(new Error('sharp worker error: ' + err));
      }
    });
    child.stdin.write(JSON.stringify(command));
    child.stdin.end();
  });
}

export async function compressImage(
  inputPath: string,
  options: CompressionOptions,
  outputDir?: string,
): Promise<CompressionResult> {
  return runWorker({ type: 'compress', inputPath, options, outputDir });
}

export async function getImageMetadata(inputPath: string): Promise<ImageMetadata> {
  return runWorker({ type: 'metadata', inputPath });
}

export async function compressImageToBuffer(
  inputPath: string,
  options: CompressionOptions,
): Promise<{ buffer: Buffer; metadata: CompressionResult }> {
  const result = await runWorker<{ bufferBase64: string; metadata: CompressionResult }>(
    { type: 'compressToBuffer', inputPath, options },
  );
  return { buffer: Buffer.from(result.bufferBase64, 'base64'), metadata: result.metadata };
}

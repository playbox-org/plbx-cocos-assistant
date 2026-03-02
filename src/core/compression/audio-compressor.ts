import { execFile } from 'child_process';
import { promisify } from 'util';
import { statSync, existsSync } from 'fs';
import { join, basename, extname, dirname } from 'path';

const execFileAsync = promisify(execFile);

export interface AudioCompressionOptions {
  format: 'mp3' | 'ogg';
  bitrate?: number;  // kbps, default 128
  sampleRate?: number; // Hz, default 44100
}

export interface AudioCompressionResult {
  inputPath: string;
  outputPath: string;
  inputSize: number;
  outputSize: number;
  format: string;
  bitrate: number;
  savings: number;
}

export async function isFFmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

export async function compressAudio(
  inputPath: string,
  options: AudioCompressionOptions,
  outputDir?: string,
): Promise<AudioCompressionResult> {
  const bitrate = options.bitrate || 128;
  const sampleRate = options.sampleRate || 44100;
  const ext = options.format === 'mp3' ? '.mp3' : '.ogg';
  const name = basename(inputPath, extname(inputPath));
  const outDir = outputDir || join(inputPath, '..');
  const outputPath = join(outDir, `${name}${ext}`);
  const inputSize = statSync(inputPath).size;

  const args = [
    '-i', inputPath,
    '-b:a', `${bitrate}k`,
    '-ar', String(sampleRate),
    '-y', // overwrite
    outputPath,
  ];

  // For OGG, use libvorbis codec
  if (options.format === 'ogg') {
    args.splice(2, 0, '-c:a', 'libvorbis');
  } else {
    args.splice(2, 0, '-c:a', 'libmp3lame');
  }

  await execFileAsync('ffmpeg', args);

  const outputSize = statSync(outputPath).size;
  const savings = inputSize > 0 ? ((inputSize - outputSize) / inputSize) * 100 : 0;

  return {
    inputPath,
    outputPath,
    inputSize,
    outputSize,
    format: options.format,
    bitrate,
    savings: Math.max(0, savings),
  };
}

export async function compressAudioToBuffer(
  inputPath: string,
  options: AudioCompressionOptions,
): Promise<{ buffer: Buffer; metadata: AudioCompressionResult }> {
  const os = require('os');
  const { readFileSync, unlinkSync } = require('fs');
  const tmpDir = os.tmpdir();
  const metadata = await compressAudio(inputPath, options, tmpDir);
  const buffer = readFileSync(metadata.outputPath);
  try { unlinkSync(metadata.outputPath); } catch { /* cleanup */ }
  return { buffer, metadata };
}

export async function getAudioDuration(inputPath: string): Promise<number> {
  // Use ffprobe to get duration in seconds
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);
  return parseFloat(stdout.trim());
}

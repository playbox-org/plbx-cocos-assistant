import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compressAudio, isFFmpegAvailable, getAudioDuration } from '../../../src/core/compression/audio-compressor';
import { join } from 'path';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';

const FIXTURES = join(__dirname, '../../fixtures');
const OUTPUT = join(__dirname, '../../fixtures/audio-output');
const TEST_WAV = join(FIXTURES, 'test-audio.wav');

let ffmpegAvailable = false;

beforeAll(async () => {
  ffmpegAvailable = await isFFmpegAvailable();
  if (!ffmpegAvailable) {
    console.warn('ffmpeg not available, skipping audio compression tests');
    return;
  }
  if (!existsSync(FIXTURES)) mkdirSync(FIXTURES, { recursive: true });
  if (!existsSync(OUTPUT)) mkdirSync(OUTPUT, { recursive: true });

  // Generate a short WAV file using ffmpeg (1 second sine wave)
  if (!existsSync(TEST_WAV)) {
    execFileSync('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=1',
      '-ar', '44100',
      '-ac', '1',
      '-y',
      TEST_WAV,
    ]);
  }
});

afterAll(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true, force: true });
});

describe('isFFmpegAvailable', () => {
  it('should detect ffmpeg presence', async () => {
    const result = await isFFmpegAvailable();
    expect(typeof result).toBe('boolean');
  });
});

describe('compressAudio', () => {
  it.skipIf(!ffmpegAvailable)('should compress WAV to MP3', async () => {
    const result = await compressAudio(TEST_WAV, { format: 'mp3', bitrate: 128 }, OUTPUT);
    expect(result.format).toBe('mp3');
    expect(result.outputSize).toBeGreaterThan(0);
    expect(result.outputSize).toBeLessThan(result.inputSize);
    expect(result.savings).toBeGreaterThan(0);
    expect(result.outputPath).toContain('.mp3');
  });

  it.skipIf(!ffmpegAvailable)('should compress WAV to OGG', async () => {
    const result = await compressAudio(TEST_WAV, { format: 'ogg', bitrate: 96 }, OUTPUT);
    expect(result.format).toBe('ogg');
    expect(result.outputSize).toBeGreaterThan(0);
    expect(result.outputPath).toContain('.ogg');
  });

  it.skipIf(!ffmpegAvailable)('should use default bitrate when not specified', async () => {
    const result = await compressAudio(TEST_WAV, { format: 'mp3' }, OUTPUT);
    expect(result.bitrate).toBe(128);
  });
});

describe('getAudioDuration', () => {
  it.skipIf(!ffmpegAvailable)('should return duration in seconds', async () => {
    const duration = await getAudioDuration(TEST_WAV);
    expect(duration).toBeCloseTo(1, 0); // ~1 second
  });
});

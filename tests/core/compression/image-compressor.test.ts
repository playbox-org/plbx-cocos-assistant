import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compressImage, getImageMetadata, compressImageToBuffer } from '../../../src/core/compression/image-compressor';
import sharp from 'sharp';
import { join } from 'path';
import { mkdirSync, existsSync, unlinkSync, rmSync } from 'fs';

const FIXTURES = join(__dirname, '../../fixtures');
const OUTPUT = join(__dirname, '../../fixtures/output');
const TEST_PNG = join(FIXTURES, 'test-image.png');

beforeAll(async () => {
  if (!existsSync(FIXTURES)) mkdirSync(FIXTURES, { recursive: true });
  if (!existsSync(OUTPUT)) mkdirSync(OUTPUT, { recursive: true });
  // Create a 200x200 test PNG with gradient-like pattern (non-trivial, compressible)
  await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 4,
      background: { r: 255, g: 128, b: 0, alpha: 1 },
    },
  })
    .png({ compressionLevel: 0 }) // uncompressed for reliable size comparison
    .toFile(TEST_PNG);
});

afterAll(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true, force: true });
});

describe('compressImage', () => {
  it('should compress PNG to WebP with smaller size', async () => {
    const result = await compressImage(TEST_PNG, { format: 'webp', quality: 80 }, OUTPUT);
    expect(result.outputSize).toBeLessThan(result.inputSize);
    expect(result.format).toBe('webp');
    expect(result.savings).toBeGreaterThan(0);
    expect(result.outputPath).toContain('.webp');
  });

  it('should compress PNG to AVIF', async () => {
    const result = await compressImage(TEST_PNG, { format: 'avif', quality: 50 }, OUTPUT);
    expect(result.outputSize).toBeLessThan(result.inputSize);
    expect(result.format).toBe('avif');
  });

  it('should compress PNG to JPEG', async () => {
    const result = await compressImage(TEST_PNG, { format: 'jpeg', quality: 70 }, OUTPUT);
    expect(result.format).toBe('jpeg');
    expect(result.outputPath).toContain('.jpeg');
  });

  it('should optimize PNG', async () => {
    const result = await compressImage(TEST_PNG, { format: 'png', quality: 80 }, OUTPUT);
    expect(result.format).toBe('png');
  });

  it('should handle resize option', async () => {
    const result = await compressImage(
      TEST_PNG,
      { format: 'webp', quality: 80, resize: { width: 100, height: 100 } },
      OUTPUT,
    );
    const meta = await getImageMetadata(result.outputPath);
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it('should calculate savings correctly', async () => {
    const result = await compressImage(TEST_PNG, { format: 'webp', quality: 50 }, OUTPUT);
    const expectedSavings = ((result.inputSize - result.outputSize) / result.inputSize) * 100;
    expect(result.savings).toBeCloseTo(expectedSavings, 1);
  });
});

describe('getImageMetadata', () => {
  it('should return width, height, format, size', async () => {
    const meta = await getImageMetadata(TEST_PNG);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
    expect(meta.format).toBe('png');
    expect(meta.size).toBeGreaterThan(0);
    expect(meta.channels).toBe(4);
  });
});

describe('compressImageToBuffer', () => {
  it('should return buffer and metadata without writing file', async () => {
    const { buffer, metadata } = await compressImageToBuffer(TEST_PNG, {
      format: 'webp',
      quality: 75,
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(metadata.format).toBe('webp');
    expect(metadata.outputSize).toBe(buffer.length);
  });
});

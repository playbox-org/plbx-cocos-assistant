import { describe, it, expect } from 'vitest';
import { estimateBuildSize, estimateCompressedSize } from '../../../src/core/build-report/size-estimator';

describe('estimateBuildSize', () => {
  it('should estimate PNG texture size', () => {
    const result = estimateBuildSize({
      type: 'cc.Texture2D',
      sourceSize: 50000,
      extension: '.png',
    });
    expect(result).toBeGreaterThan(0);
    expect(typeof result).toBe('number');
  });

  it('should estimate JPEG texture as roughly same size', () => {
    const result = estimateBuildSize({
      type: 'cc.Texture2D',
      sourceSize: 50000,
      extension: '.jpg',
    });
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(50000 * 1.2); // at most 20% larger
  });

  it('should estimate audio file size (MP3 passed through)', () => {
    const result = estimateBuildSize({
      type: 'cc.AudioClip',
      sourceSize: 200000,
      extension: '.mp3',
    });
    expect(result).toBeGreaterThan(0);
    // MP3 is typically passed through or slightly re-encoded
    expect(result).toBeLessThanOrEqual(200000 * 1.1);
  });

  it('should estimate WAV audio as smaller (gets compressed in build)', () => {
    const result = estimateBuildSize({
      type: 'cc.AudioClip',
      sourceSize: 1000000,
      extension: '.wav',
    });
    // WAV -> compressed audio should be much smaller
    expect(result).toBeLessThan(1000000);
  });

  it('should estimate script as smaller (bundled/minified)', () => {
    const result = estimateBuildSize({
      type: 'cc.Script',
      sourceSize: 5000,
      extension: '.ts',
    });
    expect(result).toBeLessThanOrEqual(5000);
    expect(result).toBeGreaterThan(0);
  });

  it('should estimate JSON as roughly same size', () => {
    const result = estimateBuildSize({
      type: 'cc.JsonAsset',
      sourceSize: 10000,
      extension: '.json',
    });
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(10000 * 1.1);
  });

  it('should handle unknown types with 1:1 ratio', () => {
    const result = estimateBuildSize({
      type: 'cc.Unknown',
      sourceSize: 30000,
      extension: '.bin',
    });
    expect(result).toBe(30000);
  });
});

describe('estimateCompressedSize', () => {
  it('should estimate gzip as 30-70% of original for text-like content', () => {
    const result = estimateCompressedSize(100000, 'text');
    expect(result).toBeLessThan(100000);
    expect(result).toBeGreaterThan(10000);
  });

  it('should estimate binary content as less compressible', () => {
    const textResult = estimateCompressedSize(100000, 'text');
    const binaryResult = estimateCompressedSize(100000, 'binary');
    expect(binaryResult).toBeGreaterThan(textResult);
  });

  it('should handle zero size', () => {
    expect(estimateCompressedSize(0)).toBe(0);
  });
});

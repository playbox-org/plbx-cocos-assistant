import { describe, it, expect } from 'vitest';
import { extractUuidFromPath, decompressUuid } from '../../../src/core/build-report/uuid-utils';

describe('extractUuidFromPath', () => {
  it('should extract UUID from native file path', () => {
    const result = extractUuidFromPath('native/0d/0db0b555-969b-44fd-8b15-52f98db892ac.png');
    expect(result).toEqual({
      uuid: '0db0b555-969b-44fd-8b15-52f98db892ac',
      fragment: undefined,
    });
  });

  it('should extract UUID and fragment from sub-asset path', () => {
    const result = extractUuidFromPath('native/59/590beb63-46ba-4749-b258-454caa4dbe46@80c75.bin');
    expect(result).toEqual({
      uuid: '590beb63-46ba-4749-b258-454caa4dbe46',
      fragment: '80c75',
    });
  });

  it('should extract UUID from directory-based asset (fonts)', () => {
    const result = extractUuidFromPath('native/c5/c559e99c-fba0-41a0-b733-6d5f5bb3878c/firasans-black-webfont.ttf');
    expect(result).toEqual({
      uuid: 'c559e99c-fba0-41a0-b733-6d5f5bb3878c',
      fragment: undefined,
    });
  });

  it('should extract UUID from import binary path', () => {
    const result = extractUuidFromPath('import/59/590beb63-46ba-4749-b258-454caa4dbe46@73b7f.bin');
    expect(result).toEqual({
      uuid: '590beb63-46ba-4749-b258-454caa4dbe46',
      fragment: '73b7f',
    });
  });

  it('should return null for pack file paths (no standard UUID)', () => {
    const result = extractUuidFromPath('import/0d/0d50e9a82.json');
    expect(result).toBeNull();
  });

  it('should return null for non-UUID paths', () => {
    const result = extractUuidFromPath('index.js');
    expect(result).toBeNull();
  });
});

describe('decompressUuid', () => {
  it('should decompress a 22-char base64 UUID to standard hex format', () => {
    // Verified from fixture: config.json uuids contains "0dsLVVlptE/YsVUvmNuJKs"
    // native/ has file 0db0b555-969b-44fd-8b15-52f98db892ac.png
    const result = decompressUuid('0dsLVVlptE/YsVUvmNuJKs');
    expect(result).toBe('0db0b555-969b-44fd-8b15-52f98db892ac');
  });

  it('should handle base UUID (fragment already stripped)', () => {
    // "04I1sqyNpNqrTCWdP0pcBc" is base part of "04I1sqyNpNqrTCWdP0pcBc@6c48a"
    // Expected hex: 04235b2a-c8da-4daa-b4c2-59d3f4a5c05c (from fixture native files)
    const result = decompressUuid('04I1sqyNpNqrTCWdP0pcBc');
    expect(result).toBe('04235b2a-c8da-4daa-b4c2-59d3f4a5c05c');
  });

  it('should return null for pack file pseudo-UUIDs (short hex)', () => {
    const result = decompressUuid('0d50e9a82');
    expect(result).toBeNull();
  });

  it('should return null for very short entries', () => {
    const result = decompressUuid('19');
    expect(result).toBeNull();
  });

  it('should return null for full hex UUIDs (36 chars, not compressed)', () => {
    const result = decompressUuid('0db0b555-969b-44fd-8b15-52f98db892ac');
    expect(result).toBeNull();
  });

  it('should correctly handle / and + characters in compressed UUID', () => {
    // "7ctF9/5qxMb7AUFpC+ucVR" is the first entry in fixture config.json
    // Contains / at index 5 and + at index 16 — exercises both non-alphanumeric base64 chars
    const result = decompressUuid('7ctF9/5qxMb7AUFpC+ucVR');
    expect(result).toBe('7cb45f7f-e6ac-4c6f-b014-1690beb9c551');
  });

  it('should return null for input containing padding char =', () => {
    // = is not a valid character in a Cocos compressed UUID
    const padded = 'ABCDEFGHIJKLMNOPQRSTuv=';
    expect(decompressUuid(padded)).toBeNull();
  });
});

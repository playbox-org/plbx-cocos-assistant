import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  fileToDataUri,
  bufferToDataUri,
  packDirectoryToZip,
  createZipInjection,
  packFilesToZip,
  getDirectorySize,
} from '../../../src/core/packager/asset-inliner';
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import JSZip from 'jszip';

const FIXTURES = join(__dirname, '../../fixtures');
const INLINER_DIR = join(FIXTURES, 'inliner-test');
const TEST_PNG = join(INLINER_DIR, 'image.png');
const TEST_JS = join(INLINER_DIR, 'main.js');
const TEST_CSS = join(INLINER_DIR, 'style.css');
const SUBDIR = join(INLINER_DIR, 'assets');
const TEST_NESTED = join(SUBDIR, 'nested.json');

beforeAll(() => {
  mkdirSync(SUBDIR, { recursive: true });
  // Create small test files
  writeFileSync(TEST_PNG, Buffer.from('iVBORw0KGgo=', 'base64')); // tiny PNG header
  writeFileSync(TEST_JS, 'console.log("hello");');
  writeFileSync(TEST_CSS, 'body { margin: 0; }');
  writeFileSync(TEST_NESTED, '{"key": "value"}');
});

afterAll(() => {
  if (existsSync(INLINER_DIR)) rmSync(INLINER_DIR, { recursive: true, force: true });
});

describe('fileToDataUri', () => {
  it('should convert PNG to data URI', () => {
    const uri = fileToDataUri(TEST_PNG);
    expect(uri).toMatch(/^data:image\/png;base64,/);
  });

  it('should convert JS to data URI', () => {
    const uri = fileToDataUri(TEST_JS);
    expect(uri).toMatch(/^data:application\/javascript;base64,/);
  });

  it('should convert CSS to data URI', () => {
    const uri = fileToDataUri(TEST_CSS);
    expect(uri).toMatch(/^data:text\/css;base64,/);
  });
});

describe('bufferToDataUri', () => {
  it('should convert buffer with mime type', () => {
    const buffer = Buffer.from('hello');
    const uri = bufferToDataUri(buffer, 'text/plain');
    expect(uri).toMatch(/^data:text\/plain;base64,/);
    // Decode and verify
    const base64 = uri.split(',')[1];
    expect(Buffer.from(base64, 'base64').toString()).toBe('hello');
  });
});

describe('packDirectoryToZip', () => {
  it('should pack directory into ZIP buffer', async () => {
    const buffer = await packDirectoryToZip(INLINER_DIR);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);

    // Verify ZIP contents
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files);
    expect(files).toContain('image.png');
    expect(files).toContain('main.js');
    expect(files).toContain('style.css');
    // Nested file should have relative path
    expect(files.some(f => f.includes('nested.json'))).toBe(true);
  });
});

describe('createZipInjection', () => {
  it('should create window.__zip injection string', async () => {
    const injection = await createZipInjection(INLINER_DIR);
    expect(injection).toMatch(/^window\.__zip = ".*";$/);
    // Extract base64 and verify it's valid ZIP
    const base64 = injection.match(/"(.*)"/)?.[1];
    expect(base64).toBeDefined();
    const buffer = Buffer.from(base64!, 'base64');
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files).length).toBeGreaterThan(0);
  });
});

describe('packFilesToZip', () => {
  it('should pack specific files with custom paths', async () => {
    const buffer = await packFilesToZip([
      { path: TEST_PNG, zipPath: 'custom/image.png' },
      { path: TEST_JS, zipPath: 'creative.js' },
    ]);
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files)).toContain('custom/image.png');
    expect(Object.keys(zip.files)).toContain('creative.js');
  });
});

describe('getDirectorySize', () => {
  it('should calculate total directory size', () => {
    const size = getDirectorySize(INLINER_DIR);
    expect(size).toBeGreaterThan(0);
  });
});

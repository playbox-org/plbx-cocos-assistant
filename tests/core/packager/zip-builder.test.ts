import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildZip } from '../../../src/core/packager/zip-builder';
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import JSZip from 'jszip';

const FIXTURES = join(__dirname, '../../fixtures');
const ZIP_SOURCE = join(FIXTURES, 'zip-source');
const ZIP_OUTPUT = join(FIXTURES, 'zip-output');

beforeAll(() => {
  mkdirSync(ZIP_SOURCE, { recursive: true });
  mkdirSync(join(ZIP_SOURCE, 'assets'), { recursive: true });
  mkdirSync(ZIP_OUTPUT, { recursive: true });
  writeFileSync(join(ZIP_SOURCE, 'index.html'), '<html><body>game</body></html>');
  writeFileSync(join(ZIP_SOURCE, 'main.js'), 'var game = {};');
  writeFileSync(join(ZIP_SOURCE, 'assets', 'sprite.png'), Buffer.alloc(100));
});

afterAll(() => {
  if (existsSync(ZIP_SOURCE)) rmSync(ZIP_SOURCE, { recursive: true, force: true });
  if (existsSync(ZIP_OUTPUT)) rmSync(ZIP_OUTPUT, { recursive: true, force: true });
});

describe('buildZip', () => {
  it('should create ZIP file with all source files', async () => {
    const result = await buildZip({
      sourceDir: ZIP_SOURCE,
      outputPath: join(ZIP_OUTPUT, 'test.zip'),
    });
    expect(result.size).toBeGreaterThan(0);
    expect(existsSync(result.outputPath)).toBe(true);

    const zip = await JSZip.loadAsync(readFileSync(result.outputPath));
    expect(Object.keys(zip.files)).toContain('index.html');
    expect(Object.keys(zip.files)).toContain('main.js');
  });

  it('should add prefix to paths', async () => {
    const result = await buildZip({
      sourceDir: ZIP_SOURCE,
      outputPath: join(ZIP_OUTPUT, 'prefixed.zip'),
      prefix: 'mintegral/',
    });
    const zip = await JSZip.loadAsync(readFileSync(result.outputPath));
    expect(Object.keys(zip.files).some(f => f.startsWith('mintegral/'))).toBe(true);
  });

  it('should rename JS bundle', async () => {
    const result = await buildZip({
      sourceDir: ZIP_SOURCE,
      outputPath: join(ZIP_OUTPUT, 'renamed.zip'),
      jsBundleName: 'creative.js',
    });
    const zip = await JSZip.loadAsync(readFileSync(result.outputPath));
    expect(Object.keys(zip.files)).toContain('creative.js');
  });

  it('should add extra files like config.json', async () => {
    const result = await buildZip({
      sourceDir: ZIP_SOURCE,
      outputPath: join(ZIP_OUTPUT, 'with-config.zip'),
      extraFiles: [{ zipPath: 'config.json', content: '{"playable_orientation": 0}' }],
    });
    const zip = await JSZip.loadAsync(readFileSync(result.outputPath));
    expect(Object.keys(zip.files)).toContain('config.json');
    const content = await zip.files['config.json'].async('string');
    expect(JSON.parse(content)).toEqual({ playable_orientation: 0 });
  });
});

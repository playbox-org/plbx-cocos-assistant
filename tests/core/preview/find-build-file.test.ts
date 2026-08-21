import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { findBuildFile } from '../../../src/core/preview/server';

// The preview/validator used to hardcode the output path as
// `{outputDir}/{networkId}/index.html` (+ any .html in that dir). A custom
// Output Naming template that moves the file out of the `{networkId}/` folder
// (e.g. `{networkId}.{ext}` → `applovin.html` at the root) made the validator
// report "not found". The fix resolves the real path with the same template.
describe('findBuildFile honors the output-naming template', () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'plbx-preview-'));
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds the standard {networkId}/index.html layout (no template)', () => {
    const dir = join(root, 'std');
    mkdirSync(join(dir, 'applovin'), { recursive: true });
    writeFileSync(join(dir, 'applovin', 'index.html'), '<html></html>');
    const f = findBuildFile(dir, 'applovin');
    expect(f?.path).toBe(join(dir, 'applovin', 'index.html'));
  });

  it('returns null for a flat {networkId}.{ext} layout when given NO template (the bug)', () => {
    const dir = join(root, 'flat-notmpl');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'applovin.html'), '<html></html>');
    expect(findBuildFile(dir, 'applovin')).toBeNull();
  });

  it('finds the flat {networkId}.{ext} file when given the template', () => {
    const dir = join(root, 'flat-tmpl');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'applovin.html'), '<html></html>');
    const f = findBuildFile(dir, 'applovin', { template: '{networkId}.{ext}' });
    expect(f?.path).toBe(join(dir, 'applovin.html'));
    expect(f?.isZip).toBe(false);
  });

  it('resolves a user template variable ({projectName})', () => {
    const dir = join(root, 'projname');
    mkdirSync(join(dir, 'applovin'), { recursive: true });
    writeFileSync(join(dir, 'applovin', 'zombie-miner.html'), '<html></html>');
    const f = findBuildFile(dir, 'applovin', {
      template: '{networkId}/{projectName}.{ext}',
      templateVariables: { projectName: 'zombie-miner' },
    });
    expect(f?.path).toBe(join(dir, 'applovin', 'zombie-miner.html'));
  });

  // Mintegral's 2026 rule (htmlMatchesZipName) makes the packager rename the
  // OUTER zip to match the sanitized inner HTML name — spaces/dashes in the
  // literal project name baked into the template become `_`. A literal
  // template substitution then misses the file that's actually on disk
  // (previously: 404 + File Size 0/5 mb).
  it('finds a htmlMatchesZipName network build whose filename the packager sanitized', () => {
    const dir = join(root, 'mintegral-sanitized');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Playturbo_B4C2_Bubble_Shooter_mintegral_EN.zip'), 'PK');
    const f = findBuildFile(dir, 'mintegral', {
      template: 'Playturbo_B4C2-Bubble Shooter_mintegral_EN.{ext}',
    });
    expect(f?.path).toBe(join(dir, 'Playturbo_B4C2_Bubble_Shooter_mintegral_EN.zip'));
    expect(f?.isZip).toBe(true);
  });

  it('still returns null for a htmlMatchesZipName network when neither literal nor sanitized name exists', () => {
    const dir = join(root, 'mintegral-missing');
    mkdirSync(dir, { recursive: true });
    const f = findBuildFile(dir, 'mintegral', {
      template: 'Playturbo_B4C2-Bubble Shooter_mintegral_EN.{ext}',
    });
    expect(f).toBeNull();
  });
});

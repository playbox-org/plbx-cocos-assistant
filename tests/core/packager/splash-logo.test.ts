import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { resolveSplashLogoDataUrl } from '../../../src/core/packager/packager';

const FIXTURES = join(__dirname, '../../fixtures');

describe('resolveSplashLogoDataUrl', () => {
  it('reads a PNG into a base64 data URL', () => {
    const url = resolveSplashLogoDataUrl(join(FIXTURES, 'fake-texture.png'));
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it('returns undefined for an unsupported extension', () => {
    expect(resolveSplashLogoDataUrl(join(FIXTURES, 'fake-script.ts'))).toBeUndefined();
  });

  it('returns undefined for a missing file', () => {
    expect(resolveSplashLogoDataUrl(join(FIXTURES, 'does-not-exist.png'))).toBeUndefined();
  });

  it('returns undefined for an empty/absent path', () => {
    expect(resolveSplashLogoDataUrl('')).toBeUndefined();
    expect(resolveSplashLogoDataUrl(undefined)).toBeUndefined();
  });
});

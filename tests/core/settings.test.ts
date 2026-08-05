import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, toPackageConfig } from '../../src/core/settings';

describe('loader mode settings', () => {
  it('defaults loaderMode to self-contained', () => {
    expect(DEFAULT_SETTINGS.loaderMode).toBe('self-contained');
  });
  it('defaults legacyLoaderNetworks to empty array', () => {
    expect(DEFAULT_SETTINGS.legacyLoaderNetworks).toEqual([]);
  });
});

describe('toPackageConfig', () => {
  it('carries loaderMode + legacyLoaderNetworks into PackageConfig (rollback path)', () => {
    // Regression: the panel/auto-package config builders dropped these fields, so
    // a settings.json `legacyLoaderNetworks` rollback never reached the packager.
    const config = toPackageConfig({
      ...DEFAULT_SETTINGS,
      loaderMode: 'systemjs',
      legacyLoaderNetworks: ['facebook', 'molocoV2'],
      orientation: 'landscape',
    });
    expect(config.loaderMode).toBe('systemjs');
    expect(config.legacyLoaderNetworks).toEqual(['facebook', 'molocoV2']);
    expect(config.orientation).toBe('landscape');
  });

  it('defaults splashMode to none', () => {
    expect(DEFAULT_SETTINGS.splashMode).toBe('none');
  });

  it('derives showSplash + customSplashLogo from splashMode', () => {
    // none → no splash
    expect(toPackageConfig({ ...DEFAULT_SETTINGS, splashMode: 'none' }).showSplash).toBe(false);
    // playbox → splash on, custom logo path NOT forwarded even if stored
    const stored = { ...DEFAULT_SETTINGS, customSplashLogo: '/x/logo.png' };
    const pb = toPackageConfig({ ...stored, splashMode: 'playbox' });
    expect(pb.showSplash).toBe(true);
    expect(pb.customSplashLogo).toBe('');
    // custom → splash on, path forwarded
    const cu = toPackageConfig({ ...stored, splashMode: 'custom' });
    expect(cu.showSplash).toBe(true);
    expect(cu.customSplashLogo).toBe('/x/logo.png');
  });
});

describe('custom splash logo scale', () => {
  it('defaults to 26 — the vmin equivalent of the old fixed 96px cap', () => {
    expect(DEFAULT_SETTINGS.splashLogoScale).toBe(26);
  });

  it('forwards the scale to PackageConfig in custom mode', () => {
    const config = toPackageConfig({
      ...DEFAULT_SETTINGS,
      splashMode: 'custom',
      customSplashLogo: '/x/logo.png',
      splashLogoScale: 64,
    });
    expect(config.splashLogoScale).toBe(64);
  });

  it('omits the scale outside custom mode', () => {
    // A stored scale must not leak onto the branded splash, which keeps its
    // own fixed size. Mirrors how customSplashLogo is already gated.
    for (const splashMode of ['none', 'playbox'] as const) {
      const config = toPackageConfig({
        ...DEFAULT_SETTINGS,
        splashMode,
        splashLogoScale: 64,
      });
      expect(config.splashLogoScale, splashMode).toBeUndefined();
    }
  });
});

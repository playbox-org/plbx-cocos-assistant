import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, toPackageConfig, resolveSplashMode } from '../../src/core/settings';

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

describe('legacy splash migration', () => {
  // v0.5.6 made the loading splash default OFF. The migration that maps the old
  // boolean showSplash onto splashMode fired for ANY saved profile missing
  // splashMode — including profiles written after v0.5.6 that simply never
  // stored the key — and its else-branch is 'playbox', so those projects came
  // up with the splash ON against the shipped default.
  it('does not migrate a profile that carries no legacy splash keys', () => {
    expect(resolveSplashMode({ selectedNetworks: ['luna'] })).toBeUndefined();
    expect(resolveSplashMode({})).toBeUndefined();
  });

  it('preserves an explicit legacy choice', () => {
    expect(resolveSplashMode({ showSplash: false })).toBe('none');
    expect(resolveSplashMode({ showSplash: true })).toBe('playbox');
    expect(resolveSplashMode({ customSplashLogo: '/tmp/logo.png' })).toBe('custom');
    // an explicit opt-out wins over a leftover logo path
    expect(resolveSplashMode({ showSplash: false, customSplashLogo: '/tmp/logo.png' })).toBe('none');
  });

  it('leaves an already-migrated profile alone', () => {
    expect(resolveSplashMode({ splashMode: 'none', showSplash: true })).toBeUndefined();
    expect(resolveSplashMode(undefined)).toBeUndefined();
  });
});

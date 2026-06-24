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

  it('defaults splashMode to playbox', () => {
    expect(DEFAULT_SETTINGS.splashMode).toBe('playbox');
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

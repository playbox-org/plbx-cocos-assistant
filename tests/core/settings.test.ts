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
      storeUrlIos: 'ios://x',
      storeUrlAndroid: 'and://y',
      orientation: 'landscape',
    });
    expect(config.loaderMode).toBe('systemjs');
    expect(config.legacyLoaderNetworks).toEqual(['facebook', 'molocoV2']);
    expect(config.storeUrlIos).toBe('ios://x');
    expect(config.storeUrlAndroid).toBe('and://y');
    expect(config.orientation).toBe('landscape');
  });
});

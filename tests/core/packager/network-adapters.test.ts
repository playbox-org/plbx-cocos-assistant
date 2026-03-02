import { describe, it, expect } from 'vitest';
import { getAdapter } from '../../../src/core/packager/network-adapters';
import { HtmlBuilder } from '../../../src/core/packager/html-builder';
import { NETWORKS } from '../../../src/shared/networks';
import { PackageConfig } from '../../../src/shared/types';

const sampleHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Game</title></head>
<body><script src="assets/main.js"></script></body></html>`;

const defaultConfig: PackageConfig = {
  storeUrlIos: 'https://apps.apple.com/app/123',
  storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.test',
  orientation: 'portrait',
};

describe('Network Adapters', () => {
  describe('getAdapter', () => {
    it('should return adapter for every registered network', () => {
      Object.keys(NETWORKS).forEach(id => {
        expect(() => getAdapter(id)).not.toThrow();
      });
    });

    it('should throw for unknown network', () => {
      expect(() => getAdapter('nonexistent')).toThrow('Unknown network');
    });
  });

  describe('MRAID networks', () => {
    const mraidIds = ['applovin', 'unity', 'ironsource', 'adcolony', 'appreciate', 'chartboost', 'liftoff'];

    mraidIds.forEach(id => {
      it(`${id} should inject mraid.js`, () => {
        const adapter = getAdapter(id);
        const builder = new HtmlBuilder(sampleHtml);
        adapter.transform(builder, defaultConfig);
        expect(builder.toHtml()).toContain('mraid.js');
      });
    });
  });

  describe('Google adapter', () => {
    it('should inject ExitAPI script', () => {
      const adapter = getAdapter('google');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('exitapi.js');
    });

    it('should inject ad-size meta for portrait', () => {
      const adapter = getAdapter('google');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, { ...defaultConfig, orientation: 'portrait' });
      const html = builder.toHtml();
      expect(html).toContain('ad-size');
      expect(html).toContain('320x480');
    });

    it('should inject ad-size meta for landscape', () => {
      const adapter = getAdapter('google');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, { ...defaultConfig, orientation: 'landscape' });
      const html = builder.toHtml();
      expect(html).toContain('480x320');
    });
  });

  describe('Facebook adapter', () => {
    it('should inject FbPlayableAd script', () => {
      const adapter = getAdapter('facebook');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      expect(builder.toHtml()).toContain('FbPlayableAd');
    });
  });

  describe('Moloco adapter', () => {
    it('should inject FbPlayableAd (same as Facebook)', () => {
      const adapter = getAdapter('moloco');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      expect(builder.toHtml()).toContain('FbPlayableAd');
    });
  });

  describe('Mintegral adapter', () => {
    it('should have jsBundle = creative.js', () => {
      const adapter = getAdapter('mintegral');
      expect(adapter.getJsBundleName()).toBe('creative.js');
    });

    it('should inject Mintegral lifecycle JS', () => {
      const adapter = getAdapter('mintegral');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('mintGameStart');
      expect(html).toContain('mintGameClose');
    });
  });

  describe('TikTok adapter', () => {
    it('should inject TikTok SDK', () => {
      const adapter = getAdapter('tiktok');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      expect(builder.toHtml()).toContain('ttfe/union/playable');
    });

    it('should return zipConfig with orientation for portrait', () => {
      const adapter = getAdapter('tiktok');
      const config = adapter.getZipConfig({ ...defaultConfig, orientation: 'portrait' });
      expect(config).toHaveProperty('playable_orientation');
    });
  });

  describe('Snapchat adapter', () => {
    it('should return zipConfig with orientation', () => {
      const adapter = getAdapter('snapchat');
      const config = adapter.getZipConfig({ ...defaultConfig, orientation: 'portrait' });
      expect(config).toHaveProperty('orientation');
    });
  });

  describe('Non-MRAID networks without SDK', () => {
    ['tapjoy', 'smadex', 'rubeex'].forEach(id => {
      it(`${id} should not inject mraid.js`, () => {
        const adapter = getAdapter(id);
        const builder = new HtmlBuilder(sampleHtml);
        adapter.transform(builder, defaultConfig);
        expect(builder.toHtml()).not.toContain('mraid.js');
      });
    });
  });
});

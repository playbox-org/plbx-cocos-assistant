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
      Object.keys(NETWORKS).forEach((id) => {
        expect(() => getAdapter(id)).not.toThrow();
      });
    });

    it('should throw for unknown network', () => {
      expect(() => getAdapter('nonexistent')).toThrow('Unknown network');
    });
  });

  describe('MRAID networks', () => {
    const mraidIds = ['applovin', 'unity', 'ironsource', 'adcolony', 'appreciate', 'chartboost', 'liftoff'];

    mraidIds.forEach((id) => {
      it(`${id} should inject mraid.js`, () => {
        const adapter = getAdapter(id);
        const builder = new HtmlBuilder(sampleHtml);
        adapter.transform(builder, defaultConfig);
        expect(builder.toHtml()).toContain('mraid.js');
      });
    });
  });

  describe('AppLovin adapter', () => {
    it('should inject mraid.js', () => {
      const adapter = getAdapter('applovin');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      expect(builder.toHtml()).toContain('mraid.js');
    });

    it('should inject viewport meta tag', () => {
      const adapter = getAdapter('applovin');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('user-scalable=no');
    });

    it('should use mraid.open() for CTA bridge', () => {
      const adapter = getAdapter('applovin');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('mraid.open');
    });

    it('should inject store URLs', () => {
      const adapter = getAdapter('applovin');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('apps.apple.com/app/123');
      expect(html).toContain('play.google.com/store/apps');
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

    it('should inject clickTag variable with Google macro default', () => {
      const adapter = getAdapter('google');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('var clickTag');
      expect(html).toContain('%%CLICK_URL_UNESC%%');
    });
  });

  describe('Facebook adapter', () => {
    it('should reference FbPlayableAd.onCTAClick() in the CTA bridge', () => {
      const adapter = getAdapter('facebook');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      // Bridge must CALL FbPlayableAd.onCTAClick(), not assign to it
      expect(html).toContain('FbPlayableAd.onCTAClick()');
      expect(html).toContain('if (window.FbPlayableAd)');
    });

    it('MUST NOT overwrite FbPlayableAd.onCTAClick (validator provides it)', () => {
      // Regression guard for a bug where the adapter injected
      //   var FbPlayableAd = FbPlayableAd || {};
      //   FbPlayableAd.onCTAClick = function() {};
      // which replaced the validator's real CTA handler with a no-op and
      // silently killed click tracking on Meta / Moloco.
      const adapter = getAdapter('facebook');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).not.toMatch(/FbPlayableAd\.onCTAClick\s*=/);
      expect(html).not.toMatch(/var\s+FbPlayableAd\s*=/);
    });
  });

  describe('Moloco adapter', () => {
    it('should reference FbPlayableAd.onCTAClick() in the CTA bridge (same as Facebook)', () => {
      const adapter = getAdapter('moloco');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('FbPlayableAd.onCTAClick()');
      expect(html).toContain('if (window.FbPlayableAd)');
    });

    it('MUST NOT overwrite FbPlayableAd.onCTAClick (validator provides it)', () => {
      const adapter = getAdapter('moloco');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).not.toMatch(/FbPlayableAd\.onCTAClick\s*=/);
      expect(html).not.toMatch(/var\s+FbPlayableAd\s*=/);
    });
  });

  describe('Mintegral adapter', () => {
    it('should inject Mintegral viewport meta', () => {
      const adapter = getAdapter('mintegral');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('user-scalable=no');
    });

    it('should use install()-based CTA bridge (not mraid)', () => {
      const adapter = getAdapter('mintegral');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('window.install');
      expect(html).not.toContain('mraid.open');
    });

    it('should bridge game_end to window.gameEnd', () => {
      const adapter = getAdapter('mintegral');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('gameEnd');
      expect(html).toContain('gameClose');
    });

    it('should declare preview-util.js as forbidden string', () => {
      const adapter = getAdapter('mintegral');
      const forbidden = adapter.getForbiddenStrings();
      expect(forbidden).toContain('preview-util.js');
    });

    it('transformed HTML must not contain any forbidden string', () => {
      const adapter = getAdapter('mintegral');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      for (const needle of adapter.getForbiddenStrings()) {
        expect(html, `adapter-transformed HTML leaked "${needle}"`).not.toContain(needle);
      }
    });
  });

  describe('Forbidden strings API (base)', () => {
    it('non-Mintegral adapters should return empty forbidden list by default', () => {
      // Only Mintegral PlayTurbo rejects on "preview-util.js" — other networks
      // don't have this validator rule, so declaring forbidden strings for
      // them would false-positive on unrelated customInjectBody content.
      for (const id of ['applovin', 'unity', 'facebook', 'moloco', 'google', 'tiktok', 'pangle']) {
        expect(getAdapter(id).getForbiddenStrings()).toEqual([]);
      }
    });
  });

  describe('TikTok adapter', () => {
    it('should inject TikTok SDK', () => {
      const adapter = getAdapter('tiktok');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      expect(builder.toHtml()).toContain('playable/sdk/playable-sdk.js');
    });

    it('should use playableSDK.openAppStore() for CTA bridge', () => {
      const adapter = getAdapter('tiktok');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('playableSDK.openAppStore()');
    });

    it('should bridge game_ready to playableSDK.reportGameReady()', () => {
      const adapter = getAdapter('tiktok');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('playableSDK.reportGameReady');
    });

    it('should bridge game_end to playableSDK.reportGameClose()', () => {
      const adapter = getAdapter('tiktok');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('playableSDK.reportGameClose');
    });

    it('should inject viewport meta tag', () => {
      const adapter = getAdapter('tiktok');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('user-scalable=no');
    });

    it('should return zipConfig with orientation for portrait', () => {
      const adapter = getAdapter('tiktok');
      const config = adapter.getZipConfig({ ...defaultConfig, orientation: 'portrait' });
      expect(config).toEqual({ playable_orientation: 1 });
    });

    it('should return zipConfig with orientation for landscape', () => {
      const adapter = getAdapter('tiktok');
      const config = adapter.getZipConfig({ ...defaultConfig, orientation: 'landscape' });
      expect(config).toEqual({ playable_orientation: 2 });
    });

    it('should return zipConfig with orientation for auto', () => {
      const adapter = getAdapter('tiktok');
      const config = adapter.getZipConfig({ ...defaultConfig, orientation: 'auto' });
      expect(config).toEqual({ playable_orientation: 0 });
    });

    it('should NOT use mraid bridge', () => {
      const adapter = getAdapter('tiktok');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).not.toContain('mraid.open');
      expect(html).not.toContain('mraid.js');
    });

    it('should NOT use generic window.open as primary CTA', () => {
      const adapter = getAdapter('tiktok');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      // The bridge should check playableSDK first, window.open only as fallback
      expect(html).toContain('if (window.playableSDK)');
    });
  });

  describe('Pangle adapter', () => {
    it('should inject Pangle SDK', () => {
      const adapter = getAdapter('pangle');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      expect(builder.toHtml()).toContain('playable-sdk.js');
    });

    it('should use playableSDK.openAppStore() for CTA bridge', () => {
      const adapter = getAdapter('pangle');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('playableSDK.openAppStore()');
    });

    it('should bridge game_ready to playableSDK.reportGameReady()', () => {
      const adapter = getAdapter('pangle');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('playableSDK.reportGameReady');
    });

    it('should bridge game_end to playableSDK.reportGameClose()', () => {
      const adapter = getAdapter('pangle');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('playableSDK.reportGameClose');
    });

    it('should inject viewport meta tag', () => {
      const adapter = getAdapter('pangle');
      const builder = new HtmlBuilder(sampleHtml);
      adapter.transform(builder, defaultConfig);
      const html = builder.toHtml();
      expect(html).toContain('user-scalable=no');
    });

    it('should return zipConfig with orientation', () => {
      const adapter = getAdapter('pangle');
      const config = adapter.getZipConfig({ ...defaultConfig, orientation: 'portrait' });
      expect(config).toEqual({ playable_orientation: 1 });
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
    ['tapjoy', 'smadex', 'rubeex'].forEach((id) => {
      it(`${id} should not inject mraid.js`, () => {
        const adapter = getAdapter(id);
        const builder = new HtmlBuilder(sampleHtml);
        adapter.transform(builder, defaultConfig);
        expect(builder.toHtml()).not.toContain('mraid.js');
      });
    });
  });
});

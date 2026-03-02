import { describe, it, expect } from 'vitest';
import { generatePreviewUtil } from '../../../src/core/preview/sdk-mocks';

describe('generatePreviewUtil', () => {
  it('should return a string with report function', () => {
    const code = generatePreviewUtil({ networkId: 'applovin', mraid: true, maxSize: 5 * 1024 * 1024 });
    expect(code).toContain('function report(');
    expect(code).toContain("parent.postMessage");
    expect(code).toContain("plbx:preview");
  });

  it('should include error tracking (onerror + unhandledrejection)', () => {
    const code = generatePreviewUtil({ networkId: 'applovin', mraid: true, maxSize: 5242880 });
    expect(code).toContain('window.onerror');
    expect(code).toContain('unhandledrejection');
  });

  it('should wrap fetch and XMLHttpRequest for network tracking', () => {
    const code = generatePreviewUtil({ networkId: 'applovin', mraid: true, maxSize: 5242880 });
    expect(code).toContain('XMLHttpRequest');
    expect(code).toContain('fetch');
  });

  it('should mock MRAID for mraid networks', () => {
    const code = generatePreviewUtil({ networkId: 'applovin', mraid: true, maxSize: 5242880 });
    expect(code).toContain('window.mraid');
    expect(code).toContain("report('cta'");
  });

  it('should mock window.install for mintegral', () => {
    const code = generatePreviewUtil({ networkId: 'mintegral', mraid: false, maxSize: 5242880 });
    expect(code).toContain('window.install');
    expect(code).not.toContain('window.mraid');
  });

  it('should mock ExitApi for google', () => {
    const code = generatePreviewUtil({ networkId: 'google', mraid: false, maxSize: 5242880 });
    expect(code).toContain('ExitApi');
  });

  it('should mock FbPlayableAd for facebook', () => {
    const code = generatePreviewUtil({ networkId: 'facebook', mraid: false, maxSize: 5242880 });
    expect(code).toContain('FbPlayableAd');
  });

  it('should define lifecycle trackers (gameReady, gameStart, gameClose)', () => {
    const code = generatePreviewUtil({ networkId: 'applovin', mraid: true, maxSize: 5242880 });
    expect(code).toContain('gameReady');
    expect(code).toContain('gameStart');
    expect(code).toContain('gameClose');
    expect(code).toContain("report('game_ready'");
    expect(code).toContain("report('game_start'");
  });

  it('should mock dapi SDK for MRAID networks (ironSource)', () => {
    const code = generatePreviewUtil({ networkId: 'ironsource', mraid: true, maxSize: 5242880 });
    expect(code).toContain('window.dapi');
    expect(code).toContain('getAudioVolume');
    expect(code).toContain('openStoreUrl');
    expect(code).toContain('isViewable');
    expect(code).toContain('isDemoDapi');
    expect(code).toContain('audioVolumeChange');
    expect(code).toContain("playable-audio-mute");
  });

  it('should not include dapi for non-MRAID networks', () => {
    const code = generatePreviewUtil({ networkId: 'mintegral', mraid: false, maxSize: 5242880 });
    expect(code).not.toContain('window.dapi');
    expect(code).not.toContain('getAudioVolume');
  });

  it('should wrap window.open as generic CTA fallback', () => {
    const code = generatePreviewUtil({ networkId: 'gdt', mraid: false, maxSize: 5242880 });
    expect(code).toContain('window.open');
    expect(code).toContain("report('cta'");
  });
});

import { describe, it, expect } from 'vitest';
import { generatePreviewUtil } from '../../../src/core/preview/sdk-mocks';

/**
 * The TikTok/Pangle preview mock WRAPS the real playable SDK instead of
 * replacing it (so the validator tests the honest build). These tests lift the
 * wrap IIFE out of the generated util and run it against a fake window +
 * report collector + controllable setInterval — no DOM/deps needed.
 */
function loadWrap(networkId: 'tiktok' | 'pangle') {
  const code = generatePreviewUtil({ networkId, mraid: false, maxSize: 5_000_000 });
  const iife = code.match(/\(function\(\) \{\s*var BEACON[\s\S]*?\}\)\(\);/);
  if (!iife) throw new Error('wrap IIFE not found in generated util');

  const win: any = {};
  const reports: Array<{ event: string; data: any }> = [];
  const report = (event: string, data: any) => reports.push({ event, data });
  let poll: (() => void) | null = null;
  const setInterval = (fn: () => void) => { poll = fn; return 1; };
  const clearInterval = () => {};

  // eslint-disable-next-line no-new-func
  new Function('window', 'report', 'setInterval', 'clearInterval', iife[0])(
    win, report, setInterval, clearInterval,
  );
  return { win, reports, tick: () => poll && poll() };
}

describe('TikTok/Pangle SDK wrap', () => {
  it('decorates the real openAppStore: reports cta AND delegates to the real method', () => {
    const { win, reports } = loadWrap('tiktok');
    let realCalled = 0;
    // real SDK loads and assigns a fully-built object (triggers the accessor trap)
    win.playableSDK = { openAppStore: () => { realCalled++; }, isViewable: () => true };

    win.playableSDK.openAppStore();
    expect(reports.map((r) => r.event)).toContain('cta');
    expect(realCalled).toBe(1); // delegated to the real SDK
  });

  it('leaves the other real methods untouched', () => {
    const { win } = loadWrap('tiktok');
    win.playableSDK = { openAppStore: () => {}, isViewable: () => true, getBarHeight: () => 42 };
    expect(win.playableSDK.isViewable()).toBe(true);
    expect(win.playableSDK.getBarHeight()).toBe(42);
  });

  it('re-decorates methods attached after assignment (poll)', () => {
    const { win, reports, tick } = loadWrap('tiktok');
    const sdk: any = {};
    win.playableSDK = sdk;            // empty at assign time
    sdk.reportGameReady = () => {};   // real SDK attaches later
    tick();                           // bounded poll re-wraps
    win.playableSDK.reportGameReady();
    expect(reports.map((r) => r.event)).toContain('game_ready');
  });

  it('falls back to a mock when no real SDK ever loads (offline)', () => {
    const { win, reports, tick } = loadWrap('tiktok');
    for (let i = 0; i < 30; i++) tick(); // exhaust the poll window
    expect(typeof win.playableSDK).toBe('object');
    expect(win.playableSDK.isViewable()).toBe(true); // no-op query survives offline
    win.playableSDK.openAppStore();
    expect(reports.map((r) => r.event)).toContain('cta');
  });

  it('does not double-wrap on repeated decoration', () => {
    const { win, reports } = loadWrap('tiktok');
    let realCalled = 0;
    win.playableSDK = { openAppStore: () => { realCalled++; } };
    win.playableSDK = win.playableSDK; // reassign same object → setter re-runs decorate
    win.playableSDK.openAppStore();
    expect(realCalled).toBe(1);                        // delegated once, not twice
    expect(reports.filter((r) => r.event === 'cta')).toHaveLength(1); // reported once
  });
});

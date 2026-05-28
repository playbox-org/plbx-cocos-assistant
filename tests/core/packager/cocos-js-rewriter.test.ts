import { describe, it, expect } from 'vitest';
import {
  rewriteCocosJs,
  shouldRewriteCocosJs,
} from '../../../src/core/packager/cocos-js-rewriter';

describe('shouldRewriteCocosJs', () => {
  it('matches cocos-js/*.js', () => {
    expect(shouldRewriteCocosJs('cocos-js/cc.js')).toBe(true);
    expect(shouldRewriteCocosJs('cocos-js/spine.asm-ByQcr60x.js')).toBe(true);
    expect(shouldRewriteCocosJs('cocos-js/spine.js-DGaEcPzV.js')).toBe(true);
  });

  it('normalizes backslashes', () => {
    expect(shouldRewriteCocosJs('cocos-js\\cc.js')).toBe(true);
  });

  it('rejects non-cocos-js paths', () => {
    expect(shouldRewriteCocosJs('src/index.js')).toBe(false);
    expect(shouldRewriteCocosJs('assets/main/index.js')).toBe(false);
    expect(shouldRewriteCocosJs('index.js')).toBe(false);
  });

  it('rejects non-js inside cocos-js', () => {
    expect(shouldRewriteCocosJs('cocos-js/assets/spine.js.mem-DkFYcHIO.bin')).toBe(false);
  });
});

describe('rewriteCocosJs', () => {
  it('replaces new URL with hookable wrapper', () => {
    const src = 's = new URL(s, e.meta.url).href';
    const out = rewriteCocosJs(src);
    expect(out).toBe('s = new (window._PLBX_URL||URL)(s, e.meta.url).href');
  });

  it('replaces document.currentScript reads', () => {
    const src =
      '"undefined"!=typeof document&&document.currentScript?document.currentScript.src:void 0';
    const out = rewriteCocosJs(src);
    expect(out).toContain('(window._PLBX_currentScript||document.currentScript).src');
    expect(out).not.toMatch(/(?<!_PLBX_currentScript\|\|)document\.currentScript\.src/);
  });

  it('does not touch unrelated identifiers', () => {
    const src = 'var newUrlMethod = 1; var notDocument_currentScript = 2;';
    expect(rewriteCocosJs(src)).toBe(src);
  });

  it('handles multiple occurrences', () => {
    const src = 'new URL(a,b); new URL(c,d);';
    const out = rewriteCocosJs(src);
    const matches = out.match(/new \(window\._PLBX_URL\|\|URL\)/g);
    expect(matches?.length).toBe(2);
  });
});

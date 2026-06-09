import { describe, it, expect } from 'vitest';
import { buildSplash, splashByteCost, FIRST_FRAME_HOOK_JS } from '../../../src/core/packager/splash';

describe('buildSplash', () => {
  it('returns PLBX pinwheel + SVG wordmark + progress bar markup', () => {
    const s = buildSplash({ withProgressBar: true });
    expect(s.bodyHtml).toContain('id="s"');
    expect(s.bodyHtml).toContain('<svg id="lg"');
    expect(s.bodyHtml).toContain('class="wm"'); // brand wordmark SVG
    expect(s.bodyHtml).toContain('class=b'); // indeterminate bar
    expect(s.styleCss).toContain('#s{');
    expect(s.styleCss).toContain('@keyframes');
    // E2: petals pulse staggered toward center, outer silhouette static
    expect(s.styleCss).toContain('.pt path');
    expect(s.styleCss).toContain('animation-delay');
  });

  it('omits progress bar when withProgressBar=false', () => {
    const s = buildSplash({ withProgressBar: false });
    expect(s.bodyHtml).not.toContain('class=b');
  });

  it('compact mode (Moloco launcher) uses CSS-text wordmark, fits 3KB budget', () => {
    const s = buildSplash({ withProgressBar: false, svgWordmark: false });
    expect(s.bodyHtml).not.toContain('class="wm"');
    expect(s.bodyHtml).toContain('Playbox');
    const bytes = Buffer.byteLength(s.styleCss + s.bodyHtml + s.hideJs, 'utf8');
    expect(bytes).toBeLessThan(2700); // leave headroom for launcher meta/macros
  });

  it('hideJs defines idempotent window.__plbx_splash_hide', () => {
    const s = buildSplash({});
    expect(s.hideJs).toContain('window.__plbx_splash_hide=function()');
    expect(s.hideJs).toContain('getElementById("s")');
    expect(s.hideJs).toContain('if(!s)return'); // null-safe / idempotent
  });
});

describe('splashByteCost', () => {
  it('returns positive stable byte count', () => {
    const a = splashByteCost();
    const b = splashByteCost();
    expect(a).toBeGreaterThan(0);
    expect(a).toBe(b);
  });
});

describe('FIRST_FRAME_HOOK_JS', () => {
  it('hides on first Cocos frame with rAF + absolute timeout fallbacks', () => {
    expect(FIRST_FRAME_HOOK_JS).toContain('EVENT_END_FRAME');
    expect(FIRST_FRAME_HOOK_JS).toContain('requestAnimationFrame');
    expect(FIRST_FRAME_HOOK_JS).toMatch(/setTimeout\([^)]*8000\)/);
    expect(FIRST_FRAME_HOOK_JS).toContain('__plbx_splash_hide');
  });
});

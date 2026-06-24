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

describe('buildSplash custom logo', () => {
  const dataUrl = 'data:image/png;base64,' + Buffer.from('x'.repeat(900)).toString('base64');

  it('renders <img> with the data URL instead of the PLBX pinwheel + wordmark', () => {
    const s = buildSplash({ customLogo: { dataUrl } });
    expect(s.bodyHtml).toContain('<img id="lg"');
    expect(s.bodyHtml).toContain(dataUrl);
    expect(s.bodyHtml).not.toContain('<svg id="lg"'); // not the PLBX pinwheel
    expect(s.bodyHtml).not.toContain('class="wm"');   // no PLBX wordmark
    expect(s.styleCss).toContain('object-fit:contain'); // fit any aspect
    expect(s.styleCss).toContain('@keyframes pq');      // whole-image pulse
  });

  it('uses a plain black backdrop with no gradients or progress bar', () => {
    const s = buildSplash({ customLogo: { dataUrl }, withProgressBar: true });
    expect(s.bodyHtml).not.toContain('class=b');         // no progress bar
    expect(s.styleCss).toContain('background:#000');      // plain black
    expect(s.styleCss).not.toContain('radial-gradient');  // gradients dropped
  });
});

describe('splashByteCost with custom logo', () => {
  const url = (rawBytes: number) =>
    'data:image/png;base64,' + Buffer.from('x'.repeat(rawBytes)).toString('base64');

  it('scales with the base64 image size, with the +33% inflation counted', () => {
    const small = splashByteCost({ customLogo: { dataUrl: url(300) } });
    const big = splashByteCost({ customLogo: { dataUrl: url(30000) } });
    const rawDelta = 30000 - 300;
    // base64 grows the byte cost by ceil(n/3)*4 per image → delta is exact.
    const base64Delta = Math.ceil(30000 / 3) * 4 - Math.ceil(300 / 3) * 4;
    expect(big - small).toBe(base64Delta);      // cost tracks the image (not ignored)
    expect(base64Delta).toBeGreaterThan(rawDelta); // base64 +33% over raw
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

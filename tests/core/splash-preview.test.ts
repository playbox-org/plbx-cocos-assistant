import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  buildSplashPreview,
  playboxSplashBytes,
} from '../../src/core/splash/splash-preview';
import { formatLogoDimensions } from '../../src/core/splash/logo-dimensions';

const FIXTURES = join(__dirname, '../fixtures');
const LOGO = join(FIXTURES, 'fake-texture.png');

describe('buildSplashPreview', () => {
  it('returns a srcdoc carrying the kit splash style + overlay markup', () => {
    const res = buildSplashPreview({ logoPath: LOGO, scale: 26 });
    expect(res.ok).toBe(true);
    expect(res.srcdoc).toContain('<style>');
    expect(res.srcdoc).toContain('id="s"'); // the splash overlay
    expect(res.srcdoc).toContain('<img id="lg"');
    expect(res.srcdoc).toContain('data:image/png;base64,');
  });

  it('renders the requested scale, so the preview tracks the slider', () => {
    expect(buildSplashPreview({ logoPath: LOGO, scale: 71 }).srcdoc).toContain(
      'width:71vmin',
    );
  });

  it('leaves the clamping to the kit rather than duplicating the rule', () => {
    expect(buildSplashPreview({ logoPath: LOGO, scale: 999 }).srcdoc).toContain(
      'width:100vmin',
    );
    expect(buildSplashPreview({ logoPath: LOGO, scale: 0 }).srcdoc).toContain(
      'width:5vmin',
    );
  });

  it('does not embed the hide hook — the preview must not self-destruct', () => {
    const res = buildSplashPreview({ logoPath: LOGO, scale: 26 });
    expect(res.srcdoc).not.toContain('__plbx_splash_hide');
    expect(res.srcdoc).not.toContain('<script');
  });

  it('reports the build byte cost of the same splash', () => {
    const res = buildSplashPreview({ logoPath: LOGO, scale: 26 });
    expect(res.bytes).toBeGreaterThan(0);
  });

  it('exposes the logo data URL for the panel thumbnail', () => {
    // The thumbnail next to the Browse button needs the bare image, so callers
    // do not have to scrape it back out of the srcdoc.
    const res = buildSplashPreview({ logoPath: LOGO, scale: 26 });
    expect(res.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('fails cleanly on an unreadable logo instead of previewing nothing', () => {
    const res = buildSplashPreview({
      logoPath: join(FIXTURES, 'does-not-exist.png'),
      scale: 26,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.srcdoc).toBe('');
  });

  it('stays JSON-serializable — it crosses the editor IPC boundary', () => {
    const res = buildSplashPreview({ logoPath: LOGO, scale: 40 });
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
  });
});

describe('formatLogoDimensions', () => {
  // The scale now ENLARGES a small logo instead of leaving it alone, so the
  // operator needs the asset's own pixel size to judge how far past it they are.
  it('renders the asset size', () => {
    expect(formatLogoDimensions(200, 80, 'en')).toContain('200');
    expect(formatLogoDimensions(200, 80, 'en')).toContain('80');
  });

  it('is localized', () => {
    expect(formatLogoDimensions(200, 80, 'ru')).not.toBe(
      formatLogoDimensions(200, 80, 'en'),
    );
  });

  it('returns empty for dimensions a browser has not measured yet', () => {
    // <img>.naturalWidth is 0 until the image decodes; "0×0 px" is noise.
    expect(formatLogoDimensions(0, 0, 'en')).toBe('');
    expect(formatLogoDimensions(NaN, 80, 'en')).toBe('');
  });
});

describe('playboxSplashBytes', () => {
  it('reports a stable positive cost for the branded splash', () => {
    // Regression: this used to require the deleted src/core/packager/splash and
    // threw, leaving the panel's cost hint permanently blank.
    const a = playboxSplashBytes();
    expect(a).toBeGreaterThan(0);
    expect(playboxSplashBytes()).toBe(a);
  });
});

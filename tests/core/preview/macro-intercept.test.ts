import { describe, it, expect, beforeEach } from 'vitest';
import { generatePreviewUtil } from '../../../src/core/preview/sdk-mocks';

/**
 * The preview-util script is generated as a string and injected verbatim into
 * the iframe. These tests verify:
 *  1. structural pieces (reverse-lookup helper, fire reporter) are present
 *  2. when executed in a JSDOM-ish window, the Image.src setter correctly
 *     reverse-looks-up MOLOCO_MACROS values and posts macro_fire messages
 *
 * We can't load the entire preview-util into real JSDOM easily because it
 * references HTMLImageElement.prototype etc. — vitest's environment provides
 * it via happy-dom, but the patches are global and would pollute other tests.
 * Instead we run a stripped-down version of the macro detection logic inline
 * to verify the algorithm itself.
 */

describe('MolocoV2 macro intercept (structural)', () => {
  it('emits the reverse-lookup helper for any network', () => {
    const code = generatePreviewUtil({ networkId: 'applovin', mraid: true, maxSize: 5242880 });
    expect(code).toContain('_buildMacroLookup');
    expect(code).toContain('_macroKeyForUrl');
    expect(code).toContain('_logMacroFire');
  });

  it("posts 'macro_fire' events through report()", () => {
    const code = generatePreviewUtil({ networkId: 'molocoV2', mraid: true, maxSize: 5242880 });
    expect(code).toContain("report('macro_fire'");
    expect(code).toContain('macroKey: key');
  });

  it('instruments XHR open + fetch + Image.src for macro detection', () => {
    const code = generatePreviewUtil({ networkId: 'molocoV2', mraid: true, maxSize: 5242880 });
    expect(code).toMatch(/_logMacroFire\(u,\s*'xhr'\)/);
    expect(code).toMatch(/_logMacroFire\(u,\s*'fetch'\)/);
    expect(code).toMatch(/_logMacroFire\(v,\s*'image'\)/);
  });

  it('guards against double-patching Image.prototype across preview reloads', () => {
    const code = generatePreviewUtil({ networkId: 'molocoV2', mraid: true, maxSize: 5242880 });
    expect(code).toContain('window.__plbx_image_patched');
  });

  it("defines molocoV2 trigger message handlers", () => {
    const code = generatePreviewUtil({ networkId: 'molocoV2', mraid: true, maxSize: 5242880 });
    expect(code).toContain("plbx:molocov2");
    expect(code).toContain("case 'viewable':");
    expect(code).toContain("case 'pause':");
    expect(code).toContain("case 'resume':");
    expect(code).toContain("case 'game-end':");
    expect(code).toContain("case 'simulate-taps':");
  });

  it('exposes manual viewable/state trigger helpers on the mraid mock', () => {
    const code = generatePreviewUtil({ networkId: 'molocoV2', mraid: true, maxSize: 5242880 });
    expect(code).toContain('_fireViewableChange');
    expect(code).toContain('_setState');
  });

  it('starts the molocoV2 mraid mock with viewable=false', () => {
    const code = generatePreviewUtil({ networkId: 'molocoV2', mraid: true, maxSize: 5242880 });
    // _viewable initial assignment depends on networkId branch
    expect(code).toMatch(/var _viewable = false;/);
    expect(code).not.toMatch(/_fire\('viewableChange', true\)/);
  });

  it('keeps viewable=true (auto-fire) for non-molocoV2 mraid networks', () => {
    const code = generatePreviewUtil({ networkId: 'applovin', mraid: true, maxSize: 5242880 });
    expect(code).toMatch(/var _viewable = true;/);
    expect(code).toContain("_fire('viewableChange', true)");
  });

  it('reports start_muted snapshot for molocoV2', () => {
    const code = generatePreviewUtil({ networkId: 'molocoV2', mraid: true, maxSize: 5242880 });
    expect(code).toContain('molocov2_start_muted');
  });

  it('wraps mraid.open to verify final_url match for molocoV2', () => {
    const code = generatePreviewUtil({ networkId: 'molocoV2', mraid: true, maxSize: 5242880 });
    expect(code).toContain('molocov2_cta');
    expect(code).toContain('MOLOCO_MACROS.final_url');
  });

  it('reports listener registrations so viewableChange listener can be verified', () => {
    const code = generatePreviewUtil({ networkId: 'molocoV2', mraid: true, maxSize: 5242880 });
    expect(code).toContain("report('mraid_listener_added'");
  });
});

/**
 * Algorithmic test: rebuild the reverse-lookup logic inline and verify it
 * tags macros correctly across encoded/decoded variants. This avoids loading
 * the full preview-util into JSDOM but exercises the same data flow.
 */
describe('MolocoV2 macro reverse-lookup algorithm', () => {
  type LookupMap = Record<string, string>;

  function buildLookup(macros: Record<string, string>): LookupMap {
    const L: LookupMap = {};
    for (const k of Object.keys(macros)) {
      const raw = macros[k];
      if (!raw) continue;
      L[raw] = k;
      try {
        L[decodeURIComponent(raw)] = k;
      } catch {
        /* ignore */
      }
    }
    return L;
  }

  function keyForUrl(lookup: LookupMap, url: string): string | null {
    if (!url) return null;
    if (lookup[url]) return lookup[url];
    try {
      const d = decodeURIComponent(url);
      if (lookup[d]) return lookup[d];
    } catch {
      /* ignore */
    }
    return null;
  }

  let lookup: LookupMap;
  beforeEach(() => {
    lookup = buildLookup({
      mraid_viewable: 'https%3A%2F%2Fdsp.moloco%2Fbeacon%2Fmv',
      game_viewable: 'https://dsp.moloco/beacon/gv',
      click: 'https%3A%2F%2Fdsp.moloco%2Fbeacon%2Fc',
      final_url: 'https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.app',
      engagement: '',
    });
  });

  it('matches encoded URL to its macro key', () => {
    expect(keyForUrl(lookup, 'https%3A%2F%2Fdsp.moloco%2Fbeacon%2Fmv')).toBe('mraid_viewable');
  });

  it('matches decoded URL form to the same macro key', () => {
    expect(keyForUrl(lookup, 'https://dsp.moloco/beacon/mv')).toBe('mraid_viewable');
  });

  it('returns null for unknown URLs', () => {
    expect(keyForUrl(lookup, 'https://other.cdn/whatever')).toBeNull();
  });

  it('ignores empty macro values when building the lookup', () => {
    expect(Object.values(lookup)).not.toContain('engagement');
  });

  it('multi-fire of the same beacon is just multiple positive lookups', () => {
    const u = 'https://dsp.moloco/beacon/c';
    const fires = [keyForUrl(lookup, u), keyForUrl(lookup, u), keyForUrl(lookup, u)];
    expect(fires).toEqual(['click', 'click', 'click']);
  });
});

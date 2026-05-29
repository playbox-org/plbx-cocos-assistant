import { describe, it, expect } from 'vitest';
import { emitModuleHooks } from '../../../src/core/packager/loader/modules';

describe('emitModuleHooks structure', () => {
  const js = emitModuleHooks({});

  it('resolve feeds _origResolve a controlled base, not document.baseURI', () => {
    expect(js).toContain('proto.resolve = function');
    expect(js).toContain('_origResolve');
    const resolveBlock = js.slice(js.indexOf('proto.resolve'), js.indexOf('proto.instantiate'));
    // Origin-independent: never reads document.baseURI / location; uses _fakeBase.
    expect(resolveBlock).not.toContain('document.baseURI');
    expect(resolveBlock).not.toContain('location');
    expect(resolveBlock).toContain('_fakeBase');
  });

  it('normalizes about: targets onto the fake base (cures bug #1)', () => {
    expect(js).toContain('function _deAbout');
    expect(js).toContain("u.indexOf('about:')");
  });

  it('instantiate evals from cache and returns getRegister, falls through on miss', () => {
    expect(js).toContain('proto.instantiate = function');
    expect(js).toContain('this.getRegister()');
    expect(js).toContain('(0, eval)');
    expect(js).toContain('_origInstantiate.call');
  });

  it('installs a _PLBX_URL shim that neutralizes degenerate bases', () => {
    expect(js).toContain('window._PLBX_URL');
    expect(js).toContain("b.indexOf('about:')");
    expect(js).toContain("b.indexOf('file:')");
  });

  it('System.fetch only falls through to network for external URLs', () => {
    expect(js).toContain('proto.fetch = function');
    expect(js).toContain('_isExternalUrl(url)');
  });
});

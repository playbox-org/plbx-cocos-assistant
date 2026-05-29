import { describe, it, expect } from 'vitest';
import { emitSharedHelpers } from '../../../src/core/packager/loader/shared';

describe('emitSharedHelpers', () => {
  it('emits suffix-match + mime + buffer + js + external helpers', () => {
    const js = emitSharedHelpers();
    expect(js).toContain('function _suffixMatch');
    expect(js).toContain('function _findAsset');
    expect(js).toContain('function _findInJs');
    expect(js).toContain('function _getMime');
    expect(js).toContain('function _toDataUri');
    expect(js).toContain('function _base64ToArrayBuffer');
    expect(js).toContain('function _isExternalUrl');
  });

  it('references the renamed __plbx_res / __plbx_bin caches', () => {
    const js = emitSharedHelpers();
    expect(js).toContain('window.__plbx_res');
    expect(js).toContain('window.__plbx_bin');
    expect(js).not.toContain('window.__res');
  });
});

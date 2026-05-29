import { describe, it, expect } from 'vitest';
import { emitUnpack } from '../../../src/core/packager/loader/unpack';
import { emitLifecycle } from '../../../src/core/packager/loader/lifecycle';

describe('unpack + lifecycle', () => {
  it('unpack populates __plbx_res and calls plbx_boot', () => {
    const js = emitUnpack({});
    expect(js).toContain('window.__plbx_res');
    expect(js).toContain('window.__plbx_js');
    expect(js).toContain('plbx_boot(');
    expect(js).toContain('loadAsync');
    expect(js).toContain('delete window.__plbx_zip');
  });

  it('per-file extraction has its own catch so one bad entry cannot strand boot (#5)', () => {
    // Regression: without a per-file .catch, a single rejected z.file().async()
    // leaves `pending` > 0 forever → plbx_boot() never fires → blank screen.
    const js = emitUnpack({});
    // Shared decrement+boot helper used on BOTH success and failure.
    expect(js).toContain('function _done()');
    // A per-file failure handler exists (not just the outer loadAsync catch).
    expect(js.match(/\.catch\(function/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('lifecycle defines plbx_boot + plbx_boot_engine + gameReady + defer-boot gate', () => {
    const js = emitLifecycle({});
    expect(js).toContain('function plbx_boot(');
    expect(js).toContain('function plbx_boot_engine(');
    expect(js).toContain('window.gameReady');
    expect(js).toContain('__plbx_pre_boot');
    expect(js).toContain('window.__plbx_pre_boot(doBoot)');
  });
});

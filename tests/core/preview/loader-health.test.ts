import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { scanLoaderHealth, MIN_SAFE_LOADER_VERSION } from '../../../src/core/preview/loader-health';

const FIXTURES = join(__dirname, '../../fixtures/loader-health');
const OLD = readFileSync(join(FIXTURES, 'v0.2.11-applovin.html'), 'utf-8'); // fragile gate + buggy virtual-scheme + v0.2.11
const NEW = readFileSync(join(FIXTURES, 'v0.2.21-applovin.html'), 'utf-8'); // robust gate + guarded virtual-scheme + v0.2.21

function byId(checks: ReturnType<typeof scanLoaderHealth>, id: string) {
  return checks.find((c) => c.id === id);
}

describe('scanLoaderHealth', () => {
  it('fails all three boot-safety checks on a stale v0.2.11 mraid build', () => {
    const checks = scanLoaderHealth(OLD, { mraid: true });
    expect(byId(checks, 'gate_robust')?.pass).toBe(false);
    expect(byId(checks, 'virtual_scheme_guarded')?.pass).toBe(false);
    expect(byId(checks, 'loader_version')?.pass).toBe(false);
  });

  it('passes all three on a current v0.2.21 mraid build', () => {
    const checks = scanLoaderHealth(NEW, { mraid: true });
    expect(byId(checks, 'gate_robust')?.pass).toBe(true);
    expect(byId(checks, 'virtual_scheme_guarded')?.pass).toBe(true);
    expect(byId(checks, 'loader_version')?.pass).toBe(true);
  });

  it('marks every check severity as fail (blocking)', () => {
    for (const c of scanLoaderHealth(OLD, { mraid: true })) {
      expect(c.severity).toBe('fail');
    }
  });

  it('skips the gate_robust check for non-mraid networks', () => {
    const checks = scanLoaderHealth(NEW, { mraid: false });
    expect(byId(checks, 'gate_robust')).toBeUndefined();
    // the version + virtual-scheme checks still apply
    expect(byId(checks, 'virtual_scheme_guarded')).toBeDefined();
    expect(byId(checks, 'loader_version')).toBeDefined();
  });

  it('isolates checks: a robust gate with a buggy virtual-scheme guard fails only virtual_scheme', () => {
    const robustGate =
      'window.__plbx_pre_boot = function(boot){ var w=window.innerWidth; document.visibilityState; (function poll(n){ setTimeout(function(){poll(n-1)},200); })(50); };';
    const buggyVs = 'function _isVirtualScheme(url){ return /^(chunks|virtual|blob|data|about):/.test(url); }';
    const html = `<script>${robustGate}</script><script>${buggyVs}</script><script>console.log("v0.2.21")</script>`;
    const checks = scanLoaderHealth(html, { mraid: true });
    expect(byId(checks, 'gate_robust')?.pass).toBe(true);
    expect(byId(checks, 'virtual_scheme_guarded')?.pass).toBe(false);
  });

  it('fails loader_version when no banner is present', () => {
    const checks = scanLoaderHealth('<script>/* no banner */</script>', { mraid: false });
    expect(byId(checks, 'loader_version')?.pass).toBe(false);
  });

  it('treats a version at the floor as passing, below the floor as failing', () => {
    expect(MIN_SAFE_LOADER_VERSION).toBe('0.2.18');
    const atFloor = `<script>console.log("v0.2.18")</script>`;
    const below = `<script>console.log("v0.2.17")</script>`;
    expect(byId(scanLoaderHealth(atFloor, { mraid: false }), 'loader_version')?.pass).toBe(true);
    expect(byId(scanLoaderHealth(below, { mraid: false }), 'loader_version')?.pass).toBe(false);
  });
});

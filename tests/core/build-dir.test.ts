import { describe, it, expect } from 'vitest';
import { resolveBuildDir } from '../../src/core/build-dir';

const ROOT = 'D:/PBGame/HighCore-C2';

describe('resolveBuildDir', () => {
  it('adopts the real build output when the field is still the default', () => {
    // The reported bug: Cocos wrote build/web-mobile-001, the panel packaged the
    // untouched default build/web-mobile — a stale leftover — and said nothing.
    const r = resolveBuildDir({
      configured: 'build/web-mobile',
      lastDest: `${ROOT}/build/web-mobile-001`,
      projectRoot: ROOT,
    });
    expect(r.action).toBe('adopt');
    expect(r.effective).toBe('build/web-mobile-001');
  });

  it('keeps a hand-edited path but reports the mismatch', () => {
    const r = resolveBuildDir({
      configured: 'build/custom-out',
      lastDest: `${ROOT}/build/web-mobile-001`,
      projectRoot: ROOT,
    });
    expect(r.action).toBe('mismatch');
    expect(r.effective).toBe('build/custom-out');
    expect(r.lastDestRelative).toBe('build/web-mobile-001');
  });

  it('is satisfied when the field already points at the last build', () => {
    const r = resolveBuildDir({
      configured: 'build/web-mobile-001',
      lastDest: `${ROOT}/build/web-mobile-001`,
      projectRoot: ROOT,
    });
    expect(r.action).toBe('ok');
  });

  it('treats separators and case as equal on Windows paths', () => {
    const r = resolveBuildDir({
      configured: 'build\\Web-Mobile-001',
      lastDest: `${ROOT}\\build\\web-mobile-001`,
      projectRoot: ROOT,
    });
    expect(r.action).toBe('ok');
  });

  it('leaves the field alone when no build has been observed', () => {
    const r = resolveBuildDir({
      configured: 'build/web-mobile',
      lastDest: '',
      projectRoot: ROOT,
    });
    expect(r.action).toBe('ok');
    expect(r.effective).toBe('build/web-mobile');
  });

  it('keeps the destination relative to the project so settings stay portable', () => {
    // An absolute path would break for every other machine sharing the project.
    const r = resolveBuildDir({
      configured: 'build/web-mobile',
      lastDest: `${ROOT}/build/web-mobile-001`,
      projectRoot: ROOT,
    });
    expect(r.effective.startsWith('D:')).toBe(false);
  });

  it('falls back to the absolute destination when it is outside the project', () => {
    const r = resolveBuildDir({
      configured: 'build/web-mobile',
      lastDest: 'E:/elsewhere/web-mobile',
      projectRoot: ROOT,
    });
    expect(r.action).toBe('adopt');
    expect(r.effective).toBe('E:/elsewhere/web-mobile');
  });
});

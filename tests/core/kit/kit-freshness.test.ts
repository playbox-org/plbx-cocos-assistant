import { describe, it, expect } from 'vitest';
import {
  parseRange,
  satisfies,
  pickBestInRange,
  classifyKit,
  formatKitBanner,
} from '../../../src/core/kit/kit-freshness';

describe('parseRange', () => {
  it('understands ~ and exact', () => {
    expect(parseRange('~0.3.1')).toEqual({ major: 0, minor: 3, patch: 1, kind: 'tilde' });
    expect(parseRange('0.3.1')).toEqual({ major: 0, minor: 3, patch: 1, kind: 'exact' });
  });

  // Fail closed: npm's caret has a 0.x special case (^0.3.1 means <0.4.0, not
  // <1.0.0). A naive reading would offer 0.9.x as compatible and crash the editor.
  it('rejects every other dialect', () => {
    for (const r of ['^0.3.1', '>=0.3.1', '*', '0.3.x', '', 'latest']) {
      expect(parseRange(r), r).toBeNull();
    }
  });
});

describe('satisfies / pickBestInRange', () => {
  it('~0.3.1 accepts the patch line from 0.3.1 up', () => {
    expect(satisfies('0.3.1', '~0.3.1')).toBe(true);
    expect(satisfies('0.3.9', '~0.3.1')).toBe(true);
    expect(satisfies('0.3.0', '~0.3.1')).toBe(false);
    expect(satisfies('0.4.0', '~0.3.1')).toBe(false);
  });

  it('picks the highest in range and never a prerelease', () => {
    expect(pickBestInRange(['0.3.1', '0.3.2', '0.3.9-beta', '0.4.0'], '~0.3.1')).toBe('0.3.2');
  });

  it('returns null when nothing is in range', () => {
    expect(pickBestInRange(['0.4.0', '0.5.0'], '~0.3.1')).toBeNull();
  });
});

describe('classifyKit', () => {
  const range = '~0.3.1';

  it('fresh when installed is the newest in range', () => {
    const v = classifyKit({ installed: '0.3.2', range, published: ['0.3.1', '0.3.2'] });
    expect(v.state).toBe('fresh');
    expect(v.target).toBe('');
  });

  it('update-available when a newer patch exists in range', () => {
    const v = classifyKit({ installed: '0.3.2', range, published: ['0.3.2', '0.3.3'] });
    expect(v.state).toBe('update-available');
    expect(v.target).toBe('0.3.3');
  });

  it('extension-update-required when the only newer version is out of range', () => {
    const v = classifyKit({ installed: '0.3.2', range, published: ['0.3.2', '0.4.0'] });
    expect(v.state).toBe('extension-update-required');
    expect(v.target).toBe('');
    expect(v.latest).toBe('0.4.0');
  });

  it('ahead — never proposes a downgrade', () => {
    const v = classifyKit({ installed: '0.3.5', range, published: ['0.3.1', '0.3.3'] });
    expect(v.state).toBe('ahead');
    expect(v.target).toBe('');
  });

  it('ahead when installed sits outside the range entirely', () => {
    const v = classifyKit({ installed: '0.4.0', range, published: ['0.3.3', '0.4.0'] });
    expect(v.state).toBe('ahead');
    expect(v.target).toBe('');
  });

  it('empty in-range set does not crash and offers nothing', () => {
    const v = classifyKit({ installed: '0.3.2', range, published: ['0.4.0'] });
    expect(v.state).toBe('extension-update-required');
    expect(v.target).toBe('');
  });

  it('prerelease-only publications are ignored', () => {
    const v = classifyKit({ installed: '0.3.2', range, published: ['0.3.2', '0.3.3-rc.1'] });
    expect(v.state).toBe('fresh');
  });

  it('unknown on unreadable installed / unsupported range / no registry', () => {
    expect(classifyKit({ installed: '', range, published: ['0.3.3'] }).state).toBe('unknown');
    expect(classifyKit({ installed: '0.3.2', range: '^0.3.1', published: ['0.3.3'] }).state).toBe(
      'unknown',
    );
    expect(classifyKit({ installed: '0.3.2', range, published: null }).state).toBe('unknown');
  });
});

describe('formatKitBanner', () => {
  it('speaks only when there is something to act on', () => {
    const upd = classifyKit({ installed: '0.3.2', range: '~0.3.1', published: ['0.3.3'] });
    expect(formatKitBanner(upd)).toContain('0.3.3');

    const fresh = classifyKit({ installed: '0.3.2', range: '~0.3.1', published: ['0.3.2'] });
    expect(formatKitBanner(fresh)).toBe('');

    const ahead = classifyKit({ installed: '0.3.5', range: '~0.3.1', published: ['0.3.3'] });
    expect(formatKitBanner(ahead)).toBe('');
  });
});

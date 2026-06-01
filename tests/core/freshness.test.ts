import { describe, it, expect } from 'vitest';
import {
  classify,
  decideAction,
  checkFreshness,
  formatCheckResult,
  parseSlug,
  stripRemoteRef,
} from '../../src/core/freshness/freshness-check';

const verdict = (over: Partial<import('../../src/core/freshness/freshness-check').FreshnessVerdict> = {}) => ({
  state: 'fresh' as const,
  behindBy: 0,
  aheadBy: 0,
  local: 'abc1234',
  branch: 'master',
  dirty: false,
  ...over,
});

describe('parseSlug', () => {
  it('parses SSH remote url', () => {
    expect(parseSlug('git@github.com:playbox-org/plbx-cocos-assistant.git')).toBe(
      'playbox-org/plbx-cocos-assistant',
    );
  });
  it('parses HTTPS remote url', () => {
    expect(parseSlug('https://github.com/playbox-org/plbx-cocos-assistant.git')).toBe(
      'playbox-org/plbx-cocos-assistant',
    );
  });
  it('returns null for non-github url', () => {
    expect(parseSlug('git@gitlab.com:foo/bar.git')).toBeNull();
  });
});

describe('stripRemoteRef', () => {
  it('drops only the remote segment, keeps slashed branch name', () => {
    expect(stripRemoteRef('refs/remotes/origin/design/panel-ui-mockups')).toBe(
      'design/panel-ui-mockups',
    );
  });
  it('handles simple branch', () => {
    expect(stripRemoteRef('refs/remotes/origin/master')).toBe('master');
  });
  it('returns null for unexpected ref shape', () => {
    expect(stripRemoteRef('refs/heads/master')).toBeNull();
  });
});

describe('classify', () => {
  const base = {
    dirty: false,
    branch: 'master',
    local: 'abc1234',
    compare: null as any,
  };

  it('unknown when local HEAD missing', () => {
    expect(classify({ ...base, local: null }).state).toBe('unknown');
  });
  it('unknown when no upstream branch', () => {
    expect(classify({ ...base, branch: null }).state).toBe('unknown');
  });
  it('unknown when compare unavailable (network/404)', () => {
    expect(classify({ ...base, compare: null }).state).toBe('unknown');
  });
  it('maps identical → fresh', () => {
    expect(
      classify({ ...base, compare: { status: 'identical', ahead_by: 0, behind_by: 0 } }).state,
    ).toBe('fresh');
  });
  it('maps behind → behind, surfaces behindBy', () => {
    const v = classify({ ...base, compare: { status: 'behind', ahead_by: 0, behind_by: 3 } });
    expect(v.state).toBe('behind');
    expect(v.behindBy).toBe(3);
  });
  it('maps diverged → diverged', () => {
    expect(
      classify({ ...base, compare: { status: 'diverged', ahead_by: 2, behind_by: 5 } }).state,
    ).toBe('diverged');
  });
  it('passes the dirty flag through to the verdict', () => {
    const v = classify({
      ...base,
      dirty: true,
      compare: { status: 'behind', ahead_by: 0, behind_by: 1 },
    });
    expect(v.dirty).toBe(true);
  });
});

describe('decideAction', () => {
  it('notifies when behind, mentioning the count', () => {
    const a = decideAction({
      state: 'behind',
      behindBy: 3,
      aheadBy: 0,
      local: 'abc',
      branch: 'master',
      dirty: false,
    });
    expect(a.notify).toBe(true);
    expect(a.message).toContain('3');
  });
  it('stays silent when fresh', () => {
    const a = decideAction({
      state: 'fresh',
      behindBy: 0,
      aheadBy: 0,
      local: 'abc',
      branch: 'master',
      dirty: false,
    });
    expect(a.notify).toBe(false);
  });
  it('stays silent when working tree is dirty (no nagging mid-edit)', () => {
    const a = decideAction({
      state: 'behind',
      behindBy: 3,
      aheadBy: 0,
      local: 'abc',
      branch: 'master',
      dirty: true,
    });
    expect(a.notify).toBe(false);
  });
});

describe('formatCheckResult (human status for the Settings "Check" button)', () => {
  it('fresh → up to date, names the branch', () => {
    const s = formatCheckResult(verdict({ state: 'fresh', branch: 'master' }));
    expect(s).toMatch(/up to date/i);
    expect(s).toContain('master');
  });
  it('behind → count + branch, plural', () => {
    const s = formatCheckResult(verdict({ state: 'behind', behindBy: 3, branch: 'master' }));
    expect(s).toContain('3');
    expect(s).toMatch(/behind/i);
    expect(s).toContain('master');
    expect(s).toContain('commits');
  });
  it('behind by 1 → singular commit', () => {
    const s = formatCheckResult(verdict({ state: 'behind', behindBy: 1 }));
    expect(s).toContain('1 commit ');
  });
  it('ahead → mentions ahead/unpushed', () => {
    const s = formatCheckResult(verdict({ state: 'ahead', aheadBy: 2 }));
    expect(s).toMatch(/ahead/i);
    expect(s).toContain('2');
  });
  it('diverged → both counts', () => {
    const s = formatCheckResult(verdict({ state: 'diverged', behindBy: 5, aheadBy: 2 }));
    expect(s).toMatch(/diverged/i);
    expect(s).toContain('5');
    expect(s).toContain('2');
  });
  it('unknown → not a "behind" claim, surfaces it could not check', () => {
    const s = formatCheckResult(verdict({ state: 'unknown', reason: 'offline' }));
    expect(s).not.toMatch(/behind/i);
    expect(s).toMatch(/could ?n.?t|unknown|unavailable/i);
  });
});

describe('checkFreshness (orchestration with injected deps)', () => {
  const gitFake =
    (overrides: Record<string, string> = {}) =>
    async (args: string[]): Promise<string> => {
      const key = args.join(' ');
      if (key === 'rev-parse HEAD') return overrides.head ?? 'abc1234deadbeef';
      if (key === 'rev-parse --symbolic-full-name @{u}')
        return overrides.upstream ?? 'refs/remotes/origin/master';
      if (key === 'status --porcelain') return overrides.status ?? '';
      if (key === 'remote get-url origin')
        return overrides.remote ?? 'git@github.com:playbox-org/plbx-cocos-assistant.git';
      return '';
    };

  it('reports behind from git + compare', async () => {
    const v = await checkFreshness({
      repoRoot: '/repo',
      runGit: gitFake(),
      fetchCompare: async () => ({ status: 'behind', ahead_by: 0, behind_by: 2 }),
    });
    expect(v.state).toBe('behind');
    expect(v.behindBy).toBe(2);
    expect(v.dirty).toBe(false);
  });

  it('marks dirty when status --porcelain is non-empty', async () => {
    const v = await checkFreshness({
      repoRoot: '/repo',
      runGit: gitFake({ status: ' M src/main.ts\n' }),
      fetchCompare: async () => ({ status: 'behind', ahead_by: 0, behind_by: 2 }),
    });
    expect(v.dirty).toBe(true);
  });

  it('reports unknown when compare fetch fails (returns null)', async () => {
    const v = await checkFreshness({
      repoRoot: '/repo',
      runGit: gitFake(),
      fetchCompare: async () => null,
    });
    expect(v.state).toBe('unknown');
  });

  it('reports unknown when there is no upstream (rev-parse @{u} throws)', async () => {
    const v = await checkFreshness({
      repoRoot: '/repo',
      runGit: async (args: string[]) => {
        const key = args.join(' ');
        if (key === 'rev-parse --symbolic-full-name @{u}') throw new Error('no upstream');
        if (key === 'rev-parse HEAD') return 'abc1234';
        return '';
      },
      fetchCompare: async () => ({ status: 'behind', ahead_by: 0, behind_by: 2 }),
    });
    expect(v.state).toBe('unknown');
  });

  it('passes base=remote-branch, head=local-sha to the compare API (our-perspective mapping)', async () => {
    const calls: any[] = [];
    await checkFreshness({
      repoRoot: '/repo',
      runGit: gitFake({ head: 'localsha', upstream: 'refs/remotes/origin/feature/x' }),
      fetchCompare: async (slug: string, base: string, head: string) => {
        calls.push({ slug, base, head });
        return { status: 'identical', ahead_by: 0, behind_by: 0 };
      },
    });
    expect(calls[0]).toEqual({
      slug: 'playbox-org/plbx-cocos-assistant',
      base: 'feature/x',
      head: 'localsha',
    });
  });
});

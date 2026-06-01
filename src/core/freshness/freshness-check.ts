/**
 * Self-update freshness check.
 *
 * The extension is installed via Cocos "Development Import" — a symlink straight
 * into this git working tree. So at runtime it can ask git about its own state
 * and compare against the public GitHub repo to tell the developer when their
 * checkout is behind.
 *
 * Design:
 *  - `classify()`  — pure mapping of git/remote facts → a freshness state.
 *  - `decideAction()` — pure UX policy: given a verdict, do we nag, and how.
 *  - `checkFreshness()` — IO orchestrator; git + GitHub deps are injected so the
 *    logic above is unit-testable without spawning git or hitting the network.
 *
 * Remote side uses the GitHub *compare* REST API over plain HTTPS (the repo is
 * public, so no token / SSH key needed). We call it as `compare/{branch}...{local}`
 * — base = remote branch tip, head = local HEAD — so the returned `status`
 * reads from *our* perspective: `behind` means our checkout lacks commits.
 */

export type FreshnessState = 'fresh' | 'behind' | 'ahead' | 'diverged' | 'unknown';

export interface FreshnessVerdict {
  state: FreshnessState;
  /** Commits the remote branch has that our checkout lacks. */
  behindBy: number;
  /** Local commits not on the remote branch (unpushed). */
  aheadBy: number;
  /** Short local HEAD sha, or '' if unavailable. */
  local: string;
  /** Remote branch we compared against, or '' if none. */
  branch: string;
  /** Working tree had uncommitted changes at check time. */
  dirty: boolean;
  /** Why the state is `unknown`, for logging. */
  reason?: string;
}

export interface FreshnessAction {
  notify: boolean;
  severity: 'info' | 'warn';
  message: string;
}

/** Shape of the GitHub `compare` API fields we consume. */
export interface CompareResult {
  status: string; // 'identical' | 'ahead' | 'behind' | 'diverged'
  ahead_by: number;
  behind_by: number;
}

export interface ClassifyInput {
  dirty: boolean;
  /** Remote branch name (e.g. 'master', 'design/panel-ui-mockups'), or null if no upstream. */
  branch: string | null;
  /** Local HEAD sha, or null if git failed. */
  local: string | null;
  /** GitHub compare result, or null if it could not be fetched (network / 404). */
  compare: CompareResult | null;
}

/** Parse `owner/repo` out of a GitHub SSH or HTTPS remote url. Returns null if not GitHub. */
export function parseSlug(remoteUrl: string): string | null {
  const m = remoteUrl
    .trim()
    .match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

/**
 * `refs/remotes/<remote>/<branch...>` → `<branch...>`, dropping only the remote
 * segment so slashed branch names survive. Returns null for any other ref shape.
 */
export function stripRemoteRef(fullRef: string): string | null {
  const m = fullRef.trim().match(/^refs\/remotes\/[^/]+\/(.+)$/);
  return m ? m[1] : null;
}

/** Pure: map git/remote facts to a freshness verdict. */
export function classify(input: ClassifyInput): FreshnessVerdict {
  const local = input.local ?? '';
  const branch = input.branch ?? '';
  const dirty = input.dirty;

  const unknown = (reason: string): FreshnessVerdict => ({
    state: 'unknown',
    behindBy: 0,
    aheadBy: 0,
    local,
    branch,
    dirty,
    reason,
  });

  if (!input.local) return unknown('no local HEAD (not a git checkout?)');
  if (!input.branch) return unknown('no upstream branch (detached / not tracking)');
  if (!input.compare) return unknown('compare unavailable (offline / unpushed local / rate-limited)');

  const c = input.compare;
  const stateMap: Record<string, FreshnessState> = {
    identical: 'fresh',
    behind: 'behind',
    ahead: 'ahead',
    diverged: 'diverged',
  };
  const state = stateMap[c.status] ?? 'unknown';

  return {
    state,
    behindBy: c.behind_by ?? 0,
    aheadBy: c.ahead_by ?? 0,
    local,
    branch,
    dirty,
    reason: state === 'unknown' ? `unrecognized compare status: ${c.status}` : undefined,
  };
}

/**
 * Pure UX policy: given a verdict, decide whether to nag the developer and how.
 *
 * Policy choices (tune freely — this is the single knob that shapes the UX):
 *  - Only `behind` and `diverged` are worth surfacing; both mean "you're missing
 *    upstream work". `ahead` (local unpushed) and `unknown` stay quiet.
 *  - A dirty working tree suppresses the nag entirely — the dev is mid-edit and
 *    a "you're behind" banner would just be noise (and updating would conflict).
 */
export function decideAction(v: FreshnessVerdict): FreshnessAction {
  const silent: FreshnessAction = { notify: false, severity: 'info', message: '' };

  if (v.dirty) return silent;

  if (v.state === 'behind') {
    return {
      notify: true,
      severity: 'warn',
      message: `Extension is ${v.behindBy} commit${v.behindBy === 1 ? '' : 's'} behind ${v.branch}. Pull + rebuild to update.`,
    };
  }
  if (v.state === 'diverged') {
    return {
      notify: true,
      severity: 'warn',
      message: `Extension diverged from ${v.branch} (behind ${v.behindBy}, ahead ${v.aheadBy}). Reconcile before updating.`,
    };
  }
  return silent;
}

import { execFile } from 'child_process';
import { get as httpsGet } from 'https';

export interface CheckDeps {
  /** Absolute path to the git working tree (the extension repo root). */
  repoRoot: string;
  /** Run `git <args>` in repoRoot, resolve trimmed stdout, reject on failure. */
  runGit: (args: string[]) => Promise<string>;
  /** Fetch GitHub compare/{base}...{head}; resolve null on any failure. */
  fetchCompare: (slug: string, base: string, head: string) => Promise<CompareResult | null>;
}

/** IO orchestrator: gather git facts + remote compare, then classify. */
export async function checkFreshness(deps: CheckDeps): Promise<FreshnessVerdict> {
  const { runGit, fetchCompare } = deps;
  const tryGit = (args: string[]) => runGit(args).then((s) => s.trim()).catch(() => null);

  const local = await tryGit(['rev-parse', 'HEAD']);
  const upstreamRef = await tryGit(['rev-parse', '--symbolic-full-name', '@{u}']);
  const statusOut = (await tryGit(['status', '--porcelain'])) ?? '';
  const remoteUrl = await tryGit(['remote', 'get-url', 'origin']);

  const dirty = statusOut.length > 0;
  const branch = upstreamRef ? stripRemoteRef(upstreamRef) : null;
  const slug = remoteUrl ? parseSlug(remoteUrl) : null;

  let compare: CompareResult | null = null;
  if (local && branch && slug) {
    compare = await fetchCompare(slug, branch, local).catch(() => null);
  }

  return classify({ dirty, branch, local, compare });
}

// ── Real (non-injected) dependency implementations ──────────────────────────
// Not unit-tested: these are the concrete git/https sides that `checkFreshness`
// receives via DI. The tested logic lives in classify/decideAction/checkFreshness.

/** `git <args>` in repoRoot via child_process, with a short timeout. */
export function defaultRunGit(repoRoot: string): (args: string[]) => Promise<string> {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile('git', args, { cwd: repoRoot, timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.toString());
      });
    });
}

/**
 * GitHub compare over HTTPS. Public repo → no auth. Branch names keep their
 * slashes (the compare route accepts them literally); resolves null on any
 * non-200, parse error, timeout, or network failure so the check degrades to
 * `unknown` rather than throwing.
 */
export function defaultFetchCompare(
  slug: string,
  base: string,
  head: string,
): Promise<CompareResult | null> {
  return new Promise((resolve) => {
    const path = `/repos/${slug}/compare/${base}...${head}`;
    const req = httpsGet(
      {
        host: 'api.github.com',
        path,
        headers: {
          'User-Agent': 'plbx-cocos-extension',
          Accept: 'application/vnd.github+json',
        },
        timeout: 6000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            resolve({ status: j.status, ahead_by: j.ahead_by, behind_by: j.behind_by });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/** Convenience: run the freshness check against a real checkout at `repoRoot`. */
export async function runFreshnessCheck(repoRoot: string): Promise<FreshnessVerdict> {
  return checkFreshness({
    repoRoot,
    runGit: defaultRunGit(repoRoot),
    fetchCompare: defaultFetchCompare,
  });
}

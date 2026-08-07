/**
 * Reconcile the Package tab's "Build Directory" field with the directory Cocos
 * actually built into.
 *
 * These were two independent sources of truth. Auto-package (hooks.ts) packages
 * `result.dest` — the real output path — while the panel's Pack All packages
 * whatever the field says. A Cocos build task named anything other than
 * `web-mobile` (the default field value) writes to e.g. `build/web-mobile-001`,
 * so the panel silently packaged a STALE leftover build: same file count,
 * different textures, different scripts, ~800 KB apart, and no warning anywhere.
 *
 * The rule below distinguishes the two cases that matter:
 *   - the field is still the default → the operator never chose it, so adopting
 *     the real output is what they meant. No prompt for a non-decision.
 *   - the field was edited → they may be packaging an older build on purpose, so
 *     it stands, and the disagreement is surfaced instead of resolved.
 */

import { DEFAULT_SETTINGS } from './settings';

export interface BuildDirInput {
  /** The Build Directory field, usually project-relative. */
  configured: string;
  /** `result.dest` from the last observed build. Empty when none seen yet. */
  lastDest: string;
  /** Absolute project root, for making dest relative and comparable. */
  projectRoot: string;
  /** Overridable for tests; defaults to the shipped field default. */
  defaultDir?: string;
}

export interface BuildDirState {
  /** 'adopt' — take the build's own path; 'mismatch' — surface, don't touch. */
  action: 'ok' | 'adopt' | 'mismatch';
  /** The path the panel should use / keep showing. */
  effective: string;
  /** Last build output, project-relative when it lives inside the project. */
  lastDestRelative: string;
}

/** Compare paths the way the filesystem does on Windows: separators and case. */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/** Strip the project root so stored settings stay portable across machines. */
function toRelative(absolute: string, projectRoot: string): string {
  const a = absolute.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  const root = projectRoot.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  if (a.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    return a.slice(root.length + 1);
  }
  return a;
}

export function resolveBuildDir(input: BuildDirInput): BuildDirState {
  const { configured, lastDest, projectRoot } = input;
  const defaultDir = input.defaultDir ?? DEFAULT_SETTINGS.buildDir;

  if (!lastDest) {
    return { action: 'ok', effective: configured, lastDestRelative: '' };
  }

  const lastDestRelative = toRelative(lastDest, projectRoot);

  // Compare fully resolved, so 'build/web-mobile-001' and an absolute dest match.
  const configuredAbs = samePath(configured, lastDestRelative)
    ? lastDestRelative
    : configured;
  if (samePath(configuredAbs, lastDestRelative)) {
    return { action: 'ok', effective: configured, lastDestRelative };
  }

  if (samePath(configured, defaultDir)) {
    return { action: 'adopt', effective: lastDestRelative, lastDestRelative };
  }

  return { action: 'mismatch', effective: configured, lastDestRelative };
}

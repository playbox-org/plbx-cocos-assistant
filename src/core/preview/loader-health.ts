/**
 * Static loader-health fingerprint for packaged playable HTML.
 *
 * Scans the built HTML for capability signatures of the boot-safe runtime
 * loader, catching stale / known-bad builds that would grey-screen in a live
 * ad container while still passing the happy-path preview + on-device
 * validators. See docs/superpowers/specs/2026-06-17-loader-health-validation-design.md.
 *
 * Pure + synchronous: the caller extracts the HTML (zip-aware) and passes the
 * string. All checks are blocking (severity 'fail').
 */

/** Boot-safety version floor — where the last boot-pipeline fix landed
 *  (defer-boot gate v0.2.12, virtual-scheme guard v0.2.18). NOT the latest
 *  release: later versions (base122 etc.) are perf, not boot-safety, so they do
 *  not raise the floor and a correct v0.2.18–v0.2.20 build still passes. */
export const MIN_SAFE_LOADER_VERSION = '0.2.18';

export type LoaderCheck = {
  id: 'gate_robust' | 'virtual_scheme_guarded' | 'loader_version';
  pass: boolean;
  severity: 'fail';
  detail: string;
};

/** Brace-matched body of the first `{...}` block following `marker`, or null. */
function blockAfter(html: string, marker: string): string | null {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const open = html.indexOf('{', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return html.slice(open, i + 1);
  }
  return html.slice(open); // unbalanced — return the tail
}

/** Parse the packager version (vX.Y.Z) from the console banner. */
function parseLoaderVersion(html: string): string | null {
  const m = html.match(/v(\d+)\.(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/** a >= b for dotted numeric versions. */
function versionGte(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

export function scanLoaderHealth(html: string, opts: { mraid: boolean }): LoaderCheck[] {
  const checks: LoaderCheck[] = [];

  // gate_robust — mraid builds only (non-mraid networks have no defer-boot gate).
  if (opts.mraid) {
    const gate = blockAfter(html, '__plbx_pre_boot');
    const hasPoll = !!gate && /\bpoll\s*\(/.test(gate);
    const hasRenderFallback = !!gate && gate.includes('innerWidth') && gate.includes('visibilityState');
    const pass = hasPoll && hasRenderFallback;
    checks.push({
      id: 'gate_robust',
      pass,
      severity: 'fail',
      detail: !gate
        ? 'No __plbx_pre_boot defer-boot gate found — repackage with the current extension.'
        : pass
          ? 'Defer-boot gate has the bounded poll + render-surface fallback.'
          : `Fragile defer-boot gate (missing ${[!hasPoll && 'poll', !hasRenderFallback && 'render-surface fallback'].filter(Boolean).join(' + ')}). Lost viewableChange pulse → grey screen in live. Repackage with the current extension.`,
    });
  }

  // virtual_scheme_guarded — the _isVirtualScheme regex must include the
  // optional './' guard, else './chunks:///_virtual/index.js' suffix-collides
  // with the real boot index.js.
  const vs = blockAfter(html, '_isVirtualScheme');
  const guarded = !!vs && vs.includes('(\\.\\/)?');
  checks.push({
    id: 'virtual_scheme_guarded',
    pass: guarded,
    severity: 'fail',
    detail: !vs
      ? 'No _isVirtualScheme found — repackage with the current extension.'
      : guarded
        ? "_isVirtualScheme guards the './'-prefixed probe."
        : "_isVirtualScheme lacks the (\\./)? guard — './chunks:///_virtual/index.js' collides with boot index.js → grey screen. Repackage with the current extension.",
  });

  // loader_version — banner version must be at/above the boot-safety floor.
  const ver = parseLoaderVersion(html);
  const verPass = !!ver && versionGte(ver, MIN_SAFE_LOADER_VERSION);
  checks.push({
    id: 'loader_version',
    pass: verPass,
    severity: 'fail',
    detail: !ver
      ? `No packager version banner found — expected ≥ v${MIN_SAFE_LOADER_VERSION}.`
      : verPass
        ? `Packaged with v${ver} (≥ boot-safety floor v${MIN_SAFE_LOADER_VERSION}).`
        : `Packaged with v${ver}, below boot-safety floor v${MIN_SAFE_LOADER_VERSION}. Repackage with the current extension.`,
  });

  return checks;
}

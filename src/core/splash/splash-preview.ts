/**
 * Loading-splash preview for the Package tab.
 *
 * The panel must show the operator what a custom logo will actually look like
 * at a given size — the reported bug was a wide wordmark rendering as a speck
 * because the size was fixed and invisible until a real build shipped.
 *
 * Fidelity comes from rendering the KIT's own splash markup + CSS, never a
 * lookalike: `buildSplash` is the same function the packager calls, so the
 * preview cannot drift from the build. The panel drops `srcdoc` into a
 * phone-shaped <iframe>, where the CSS's `vmin` units resolve against the
 * iframe viewport — the same fraction of the shorter side that a real device
 * resolves. Judging the proportion in the panel therefore judges the device.
 */

import {
  buildSplash,
  resolveSplashLogoDataUrl,
  splashByteCost,
} from '@playbox-ai/playable-kit';

export interface SplashPreview {
  ok: boolean;
  /** Full document for an <iframe srcdoc>. Empty string when ok is false. */
  srcdoc: string;
  /** The logo itself, for the panel's thumbnail. Empty when ok is false. */
  dataUrl: string;
  /** Raw bytes this splash adds to an HTML build (see kit splashByteCost). */
  bytes: number;
  error?: string;
}

export interface SplashPreviewInput {
  /** Absolute path to the client logo. */
  logoPath: string;
  /** Size as a % of the shorter side. Out-of-range values are the kit's to
   *  clamp — duplicating the rule here would let panel and build disagree. */
  scale?: number;
}

export function buildSplashPreview(input: SplashPreviewInput): SplashPreview {
  const dataUrl = resolveSplashLogoDataUrl(input.logoPath);
  if (!dataUrl) {
    return { ok: false, srcdoc: '', dataUrl: '', bytes: 0, error: 'unreadable' };
  }

  const opts = {
    customLogo: { dataUrl },
    logoScale: input.scale,
  };
  const splash = buildSplash(opts);

  // hideJs and the first-frame hook are deliberately left out: the preview has
  // no game to wait for, and including them would fade the splash away a moment
  // after the operator opened it. No <script> at all keeps the iframe inert, so
  // it can stay fully sandboxed.
  const srcdoc =
    '<style>html,body{margin:0;height:100%;background:#000}' +
    splash.styleCss +
    '</style>' +
    splash.bodyHtml;

  return { ok: true, srcdoc, dataUrl, bytes: splashByteCost(opts) };
}

/** Byte cost of the branded Playbox splash — the panel's cost hint. */
export function playboxSplashBytes(): number {
  return splashByteCost();
}

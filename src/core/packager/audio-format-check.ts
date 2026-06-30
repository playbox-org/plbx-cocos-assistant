import * as fs from 'fs';
import { join, extname, relative } from 'path';

/**
 * Audio extensions that Safari / iOS Web Audio `decodeAudioData()` cannot decode
 * on older or in-app WKWebViews. A playable whose game awaits audio decode on
 * bootstrap can hang (grey/black screen) on those WebViews. Safe alternatives:
 * .mp3, .m4a/AAC, .wav. See docs/superpowers/specs/2026-06-17-risky-audio-validation-design.md.
 */
export const RISKY_AUDIO_EXTENSIONS = ['.ogg', '.opus', '.webm'];

/** Plaintext head-comment marker prefix — emitted into the build when risky
 *  audio is found and parsed back out by the preview validator. */
const MARKER_PREFIX = 'plbx-risky-audio:';

/** Recursively scan a build directory for assets with a risky audio extension.
 *  Returns build-relative paths (forward-slashed). [] for a missing/unreadable
 *  dir so a transient error never produces a false warning. Skips node_modules. */
export function detectRiskyAudio(buildDir: string): string[] {
  const risky = new Set(RISKY_AUDIO_EXTENSIONS);
  const found: string[] = [];

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // missing/unreadable — skip silently
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (risky.has(extname(entry.name).toLowerCase())) {
        found.push(relative(buildDir, full).split('\\').join('/'));
      }
    }
  };

  walk(buildDir);
  return found;
}

/** The inner text of the head-comment marker (HtmlBuilder.injectHeadComment wraps
 *  it in `<!-- ... -->`). */
export function riskyAudioMarker(paths: string[]): string {
  return `${MARKER_PREFIX} ${paths.join(', ')}`;
}

/** Parse the risky-audio file list back out of a packaged HTML's head comment.
 *  Returns [] when the marker is absent. */
export function parseRiskyAudioMarker(html: string): string[] {
  const m = html.match(/<!--\s*plbx-risky-audio:\s*([^>]*?)\s*-->/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Hostile MP3 detection ───────────────────────────────────────────────────
//
// Safari/WebKit `decodeAudioData()` can REJECT (null error) an MP3 that ffmpeg,
// Chrome and macOS CoreAudio all decode cleanly. Observed in the wild: an
// ultra-short SFX carrying a Xing VBR header, written by an old/odd LAME encoder
// (e.g. Amadeus Pro). The reject is swallowed by Cocos's loadNative without
// settling its promise, so the AudioClip — and every scene that depends on it —
// hangs forever (grey screen). One bad clip kills the playable; other playables
// without that clip are fine, which is why this looks build-specific.
//
// We cannot reproduce WebKit's decoder statically, and the hostile file is
// near-identical to benign short VBR clips at the header level, so this is a
// HEURISTIC, not a proof: flag VBR (Xing) MP3s too short to justify VBR. It is
// WARN-ONLY — a false positive only nudges a re-encode. The real safety net is
// the loader's decode guard (loader/assets.ts), which keeps a bad clip from
// hanging boot regardless. See docs/research/webkit-mp3-decodeaudiodata-hostile.md.

/** A Xing VBR header on a clip with fewer than this many MPEG frames (~0.25 s at
 *  44.1 kHz) is the WebKit-hostile signature — far too short to warrant VBR. */
const HOSTILE_MP3_MAX_FRAMES = 10;

const MP3_BITRATES_L3_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_BITRATES_L3_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MP3_SAMPLE_RATES: Record<string, number[]> = {
  '1': [44100, 48000, 32000],
  '2': [22050, 24000, 16000],
  '2.5': [11025, 12000, 8000],
};

/** Byte offset of the audio after an optional ID3v2 tag (0 if none). */
function id3v2End(buf: Buffer): number {
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

/** Length in bytes of the MPEG-1/2/2.5 Layer III frame at offset `i`, or 0 if the
 *  bytes there are not a valid Layer III frame header. */
function mp3FrameLen(buf: Buffer, i: number): number {
  if (i + 4 > buf.length) return 0;
  if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return 0;
  const verBits = (buf[i + 1] >> 3) & 3;
  const layer = (buf[i + 1] >> 1) & 3;
  if (verBits === 1 || layer !== 1) return 0; // reserved version / not Layer III
  const ver = verBits === 0 ? '2.5' : verBits === 2 ? '2' : '1';
  const brIdx = (buf[i + 2] >> 4) & 0xf;
  const srIdx = (buf[i + 2] >> 2) & 3;
  if (brIdx === 0 || brIdx === 15 || srIdx === 3) return 0; // free/bad bitrate or reserved SR
  const br = (ver === '1' ? MP3_BITRATES_L3_V1 : MP3_BITRATES_L3_V2)[brIdx] * 1000;
  const sr = MP3_SAMPLE_RATES[ver][srIdx];
  const pad = (buf[i + 2] >> 1) & 1;
  return ver === '1' ? Math.floor((144 * br) / sr) + pad : Math.floor((72 * br) / sr) + pad;
}

/** Heuristic: true for the WebKit-hostile MP3 class — a Xing (VBR) header on an
 *  ultra-short clip. Warn-only; see the module note above. */
export function isHostileMp3(buf: Buffer): boolean {
  // First MPEG frame (the Xing/Info header frame, if any).
  let i = id3v2End(buf);
  while (i < buf.length - 4 && mp3FrameLen(buf, i) === 0) i++;
  const len0 = mp3FrameLen(buf, i);
  if (len0 === 0) return false;

  // VBR only: a Xing tag marks VBR. CBR uses "Info" (or no tag) and is not hostile.
  const firstFrame = buf.subarray(i, Math.min(buf.length, i + len0 + 4));
  if (!firstFrame.includes('Xing')) return false;

  // Count frames, bailing as soon as we clear the threshold (cheap for long clips).
  let frames = 1; // the Xing header frame
  let j = i + len0;
  while (j < buf.length - 4 && frames < HOSTILE_MP3_MAX_FRAMES) {
    const len = mp3FrameLen(buf, j);
    if (len === 0) break;
    frames++;
    j += len;
  }
  return frames < HOSTILE_MP3_MAX_FRAMES;
}

/** Recursively scan a build directory for WebKit-hostile MP3 files. Returns
 *  build-relative (forward-slashed) paths; [] for a missing/unreadable dir so a
 *  transient error never produces a false warning. Skips node_modules. */
export function detectHostileMp3(buildDir: string): string[] {
  const found: string[] = [];

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (extname(entry.name).toLowerCase() !== '.mp3') continue;
      let buf: Buffer;
      try {
        buf = fs.readFileSync(full);
      } catch {
        continue;
      }
      if (isHostileMp3(buf)) found.push(relative(buildDir, full).split('\\').join('/'));
    }
  };

  walk(buildDir);
  return found;
}

const HOSTILE_MP3_MARKER_PREFIX = 'plbx-hostile-mp3:';

/** Head-comment marker text for hostile MP3s (HtmlBuilder wraps it in `<!-- -->`). */
export function hostileMp3Marker(paths: string[]): string {
  return `${HOSTILE_MP3_MARKER_PREFIX} ${paths.join(', ')}`;
}

/** Parse the hostile-MP3 file list back out of a packaged HTML's head comment. */
export function parseHostileMp3Marker(html: string): string[] {
  const m = html.match(/<!--\s*plbx-hostile-mp3:\s*([^>]*?)\s*-->/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

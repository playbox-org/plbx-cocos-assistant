import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import {
  detectRiskyAudio,
  riskyAudioMarker,
  parseRiskyAudioMarker,
  RISKY_AUDIO_EXTENSIONS,
  isHostileMp3,
  detectHostileMp3,
  hostileMp3Marker,
  parseHostileMp3Marker,
} from '../../../src/core/packager/audio-format-check';

const FIXTURE = join(__dirname, '../../fixtures/risky-audio');

describe('detectRiskyAudio', () => {
  it('finds ogg/opus/webm anywhere in the tree, never mp3/m4a', () => {
    const found = detectRiskyAudio(FIXTURE).map((p) => p.replace(/\\/g, '/'));
    expect(found.some((p) => p.endsWith('assets/x.ogg'))).toBe(true);
    expect(found.some((p) => p.endsWith('assets/sub/y.opus'))).toBe(true);
    expect(found.some((p) => p.endsWith('z.webm'))).toBe(true);
    expect(found.some((p) => p.endsWith('.mp3'))).toBe(false);
    expect(found.some((p) => p.endsWith('.m4a'))).toBe(false);
  });

  it('skips node_modules', () => {
    // node_modules is gitignored, so create the trap at runtime — proves the
    // skip on a fresh clone instead of vacuously passing when the dir is absent.
    const nm = join(FIXTURE, 'node_modules');
    mkdirSync(nm, { recursive: true });
    writeFileSync(join(nm, 'skip.ogg'), '');
    try {
      const found = detectRiskyAudio(FIXTURE).map((p) => p.replace(/\\/g, '/'));
      expect(found.some((p) => p.includes('node_modules'))).toBe(false);
      expect(found.some((p) => p.endsWith('assets/x.ogg'))).toBe(true); // still finds real ones
    } finally {
      rmSync(nm, { recursive: true, force: true });
    }
  });

  it('returns [] for a missing directory (no false warning)', () => {
    expect(detectRiskyAudio(join(FIXTURE, 'does-not-exist'))).toEqual([]);
  });

  it('exposes the risky extension set (ogg/opus/webm)', () => {
    expect(RISKY_AUDIO_EXTENSIONS).toEqual(expect.arrayContaining(['.ogg', '.opus', '.webm']));
    expect(RISKY_AUDIO_EXTENSIONS).not.toContain('.mp3');
  });
});

describe('riskyAudioMarker / parseRiskyAudioMarker', () => {
  it('round-trips the file list through the head-comment marker', () => {
    const paths = ['assets/x.ogg', 'z.webm'];
    const html = `<head><!-- ${riskyAudioMarker(paths)} --></head>`;
    expect(parseRiskyAudioMarker(html)).toEqual(paths);
  });

  it('returns [] when the marker is absent', () => {
    expect(parseRiskyAudioMarker('<head><title>x</title></head>')).toEqual([]);
  });
});

describe('isHostileMp3 / detectHostileMp3', () => {
  // webkit-hostile-vbr.mp3 is the real ReelStop3FF.mp3 that Safari/iOS WebAudio
  // rejects (Amadeus Pro / old LAME, ultra-short Xing VBR). benign-short-vbr.mp3
  // is DefaultButtonClick.mp3 — a near-twin short VBR clip that Safari decodes
  // fine. The fixed file is the same clip re-encoded clean (CBR, no Xing).
  it('flags the WebKit-hostile ultra-short VBR clip', () => {
    const buf = readFileSync(join(FIXTURE, 'webkit-hostile-vbr.mp3'));
    expect(isHostileMp3(buf)).toBe(true);
  });

  it('does NOT flag a benign short VBR clip (near-twin that Safari decodes)', () => {
    const buf = readFileSync(join(FIXTURE, 'benign-short-vbr.mp3'));
    expect(isHostileMp3(buf)).toBe(false);
  });

  it('does NOT flag the re-encoded (CBR, no Xing) fix', () => {
    const buf = readFileSync(join(FIXTURE, 'webkit-hostile-vbr.fixed.mp3'));
    expect(isHostileMp3(buf)).toBe(false);
  });

  it('does NOT flag non-mp3 / empty / garbage buffers', () => {
    expect(isHostileMp3(Buffer.alloc(0))).toBe(false);
    expect(isHostileMp3(Buffer.from('not an mp3 at all'))).toBe(false);
  });

  it('finds hostile mp3s in a build tree, only the hostile one', () => {
    const found = detectHostileMp3(FIXTURE).map((p) => p.replace(/\\/g, '/'));
    expect(found.some((p) => p.endsWith('webkit-hostile-vbr.mp3'))).toBe(true);
    expect(found.some((p) => p.endsWith('benign-short-vbr.mp3'))).toBe(false);
    expect(found.some((p) => p.endsWith('webkit-hostile-vbr.fixed.mp3'))).toBe(false);
  });

  it('returns [] for a missing directory (no false warning)', () => {
    expect(detectHostileMp3(join(FIXTURE, 'does-not-exist'))).toEqual([]);
  });
});

describe('hostileMp3Marker / parseHostileMp3Marker', () => {
  it('round-trips the file list through the head-comment marker', () => {
    const paths = ['assets/main/native/cb/x.mp3', 'a/b.mp3'];
    const html = `<head><!-- ${hostileMp3Marker(paths)} --></head>`;
    expect(parseHostileMp3Marker(html)).toEqual(paths);
  });

  it('returns [] when the marker is absent', () => {
    expect(parseHostileMp3Marker('<head><title>x</title></head>')).toEqual([]);
  });

  it('does not collide with the risky-audio marker', () => {
    const html = `<head><!-- ${riskyAudioMarker(['a.ogg'])} --></head>`;
    expect(parseHostileMp3Marker(html)).toEqual([]);
  });
});

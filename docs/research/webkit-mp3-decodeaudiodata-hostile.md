# WebKit-hostile MP3 → `decodeAudioData` reject → grey-screen playable

## Symptom

A Cocos playable opens fine in Chrome but shows a **grey screen** in Safari
(desktop) **and** on iPhone. Web Inspector console:

```
failed to load Web Audio – null      cc.js
```

The failure is **build-specific**: other playables on the same devices work. It
is *not* the `.ogg/.opus/.webm` class already covered by `RISKY_AUDIO_EXTENSIONS`
— the offending asset is a perfectly ordinary-looking `.mp3`.

## Root cause

One single audio clip in the build is rejected by **Safari/WebKit
`decodeAudioData`** with a `null` error, even though **ffmpeg, Chrome, and macOS
CoreAudio (`afconvert`/`afinfo`) all decode it cleanly**. The observed file
(`ReelStop3FF.mp3`):

- Encoder `Amadeus Pro version 3.100 (lame.sf.net)` — the only non-ffmpeg encoder
  in the build (every other clip was `Lavf`/ffmpeg).
- A **Xing VBR** header frame at **128 kbps** over actual audio frames at
  **32 kbps** (bitrate mismatch), **7 frames, ~0.18 s** total, with a LAME
  encoder-delay/padding tag.

WebKit's stricter VBR/Xing handling trips on this `old-LAME VBR + bitrate-mismatch
info-frame + ultra-short clip` combination; ffmpeg/CoreAudio/Chrome are tolerant.

### Why one bad clip kills the *whole* playable

Cocos's web `AudioPlayer.loadNative` (in `cc.js`) decodes on the asset-load path:

```js
decodeAudioData(r.response)
  .then(buf => { nat.addCache(t, buf); e(buf); })   // success → resolve
  .catch(err => { X("loadNative error", t, err); }); // FAIL → only logs.
                                                      // never resolve, never reject
```

On decode failure the promise **never settles** → the AudioClip asset never
finishes loading → the scene's dependency wait hangs → **grey screen forever**.
Clips are eager scene dependencies (referenced via `@property(AudioClip)` on a
scene component), so they decode at **boot**. Chrome decodes the clip, so the
hang never triggers there — which is why this looks Chrome-vs-Safari and
build-specific (other playables simply don't contain the bad clip).

## Evidence / how it was pinned

- **15-clip WebAudio test in Safari**: 14/15 `decodeAudioData` OK, exactly one
  (`ReelStop3FF.mp3`) FAILs `null` — on desktop Safari and iPhone. Not context
  state, not concurrency, not "all MP3".
- `ffmpeg -v error` and `afconvert`/`afinfo`: decode all 15 clean → not a codec
  the system can't handle; the failure is in Safari's WebAudio layer.
- Hexdump of the bad file shows the Xing/LAME header + 128k-info-over-32k-data.
- The same clip re-encoded to plain CBR (`ffmpeg -c:a libmp3lame -b:a 128k
  -ar 44100 -ac 1 -write_xing 0 -map_metadata -1`) decodes fine in Safari.

## Fixes shipped

### 2a — loader decode guard (the real safety net, cause-agnostic)

`src/core/packager/loader/assets.ts` (`plbx_install_shims`) wraps
`AudioContext.prototype.decodeAudioData` (+ `webkitAudioContext`). On a failed
decode it **logs `console.error` loudly** (not a silent success) and resolves an
**empty 1-sample buffer**, so the engine's `loadNative` settles and boot
continues. That clip is silent; everything else runs. This protects against *any*
WebKit-undecodable clip, known signature or not.

### 2b — hostile-MP3 detector (advisory, heuristic, warn-only)

`src/core/packager/audio-format-check.ts`: `isHostileMp3` / `detectHostileMp3`
flag a **Xing (VBR) header on an ultra-short clip (< 10 MPEG frames, ~0.25 s)** —
too short to justify VBR, the demonstrated hostile signature. Surfaced as a build
warning + a `plbx-hostile-mp3:` `<head>` marker that the preview validator reads
(`hostile_mp3` check).

**Heuristic, not a proof.** The hostile file is near-identical at the header level
to benign short VBR clips (`DefaultButtonClick.mp3` is a short VBR LAME mono clip
that Safari decodes fine), so there is no clean static signature. The detector is
tuned to isolate the one confirmed case among a 15-clip real-world set; it may
over- or under-flag. Detection is **warn-only** — the loader guard (2a) is what
actually prevents the grey screen.

### Immediate fix for an affected build

Re-encode the offending clip to plain CBR and replace it in the Cocos project
(keep the filename so the `.meta` uuid and scene references survive):

```
ffmpeg -i bad.mp3 -map_metadata -1 -c:a libmp3lame -b:a 128k -ar 44100 -ac 1 \
       -write_xing 0 fixed.mp3
```

## Fixtures

- `tests/fixtures/risky-audio/webkit-hostile-vbr.mp3` — the real `ReelStop3FF.mp3`
  Safari rejects (positive case).
- `tests/fixtures/risky-audio/benign-short-vbr.mp3` — `DefaultButtonClick.mp3`, a
  near-twin short VBR clip Safari decodes (negative case, guards against the
  detector over-flagging).
- `tests/fixtures/risky-audio/webkit-hostile-vbr.fixed.mp3` — the re-encoded CBR
  fix (negative case).

Covered by `tests/core/packager/audio-format-check.test.ts`.

## Related

- `docs/superpowers/specs/2026-06-17-risky-audio-validation-design.md` — the
  ogg/opus/webm risky-audio validator this extends.
- Lifecycle / self-contained loader notes in `CLAUDE.md` ("Key gotchas").

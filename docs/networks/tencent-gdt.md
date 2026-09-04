# Tencent Ads / 优量汇 (GDT) — editor-side notes

**Status:** 2026-09-04. Network id `gdt`, panel label «Tencent Ads (优量汇 / GDT)»
(kit ≥ the release that ships `GdtAdapter`; older kits label it "GDT (Tencent)"
and emit no `config.json`).
The packaging rules live in the kit:
`playable-kit/docs/networks/tencent-gdt-playable.md`. This page covers only
what the Cocos panel user sees and does.

## What the Package tab produces

| Setting | Effect for `gdt` |
|---|---|
| Package → GDT (Tencent) | one ZIP, root `index.html` (self-contained, assets inlined). |
| `orientation` | `auto → play_direction 0` (both), `portrait → 1`, `landscape → 2` in `config.json`. `config.json` `name` is `playable` (the panel passes no `appName`; cosmetic, only shown in the media-center list). |
| `storeUrlIos` / `storeUrlAndroid` | not used by the network — the Tencent SDK performs the store jump itself. Fill them anyway: they feed the dev fallback in the preview. |
| Size budget | **3 MB hard.** The results rail shows the budget; a typical Cocos web-mobile build needs the Compress tab first (WebP images, MP3/OGG audio). |
| Deploy tab | irrelevant for delivery — Tencent takes the ZIP through its own console (below). Deploy only for sharing a preview link. |

## Preview tab

- No lifecycle checks for `gdt` (the network has no `gameReady`/`gameEnd`).
- CTA check expects `gdt_onclick` (`_gdtUnSdk.playAble.onClick()`); a bare
  `window.open()` shows as an incorrect CTA. The preview wraps the real
  `unsdk.js` when it loads and falls back to a mock after ~3 s offline.
- The playable must survive a rotate: the reviewer expects both orientations
  regardless of `play_direction`.

## Hand-off to the client (what to send with the ZIP)

1. ZIP from `build/plbx-html/gdt/…zip`; check **no Chinese characters** in the
   archive name or inside — Tencent's uploader rejects them.
2. Self-test screenshots (per Tencent's "Playable Ad Creative Self-Testing
   Guide", linked in the kit doc) — the advertiser needs them for the
   **whitelist application**; playables are off by default per account.
3. Console path for the advertiser: Toolbox (工具箱) → Media Center (素材中心) →
   试玩素材 → 上传试玩素材; then attach in the ad creative under
   试玩素材（选填）with placement 优量汇 + scenario 激励视频 (rewarded video).

## Upload errors the client may forward

| Error | Meaning |
|---|---|
| `zip file does not contain index.html in root path` | root `index.html` **or** `config.json` missing (the doc reuses the message for both). |
| `index.html has unsafe function` | `document.write` in `index.html`. Our loader does not emit it; check custom inject snippets. |
| `file or directory name include non utf-8 encoding chinese characters` | Chinese chars in a file/dir name. |
| SDK error `1002` | `GDTUnSdk` instantiated with `type` ≠ `'playable'`. |

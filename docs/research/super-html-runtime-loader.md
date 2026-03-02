# super-html Runtime Loader Analysis

## Architecture: "In-Memory Virtual Filesystem"

### Build Time (Node.js)
1. Cheerio parses Cocos Creator web-mobile build `index.html`
2. JS files -> uglify-js obfuscation -> stored as strings in `window.__res`
3. All other assets (PNG, JSON, audio, fonts, WASM) -> JSZip -> base64 -> `window.__zip`
4. CSS -> inlined into `<style>` tags via clean-css
5. Runtime loader injected (~200 lines minified JS)

### Runtime (Browser) — Two-Phase Loading

#### Phase 1: Unpack ZIP
- `JSZip.loadAsync(window.__zip, { base64: true })` unpacks all files
- Each file stored as `window.__res[path] = content` (string)
- JS files additionally mirrored into `window.__js`

#### Phase 2: Patch Browser APIs (`_custom()`)

Four browser APIs are patched to intercept asset loading:

1. **XMLHttpRequest.open()** — intercepts XHR requests, returns cached data from `window.__res` based on responseType (json/text/arraybuffer)

2. **Image.src setter** — intercepts image loading, substitutes data-URL from `window.__res` if asset exists in memory

3. **document.createElement('script')** — intercepts dynamic script creation, executes JS content from `window.__js` via Function constructor instead of network request

4. **cc.assetManager.downloader** — registers custom handlers for font formats (.ttf, .woff, etc.), loads from `window.__res` via FontFace API

### Resource Separation

| Type | Storage | Reason |
|------|---------|--------|
| `.js` (polyfills, cc, game) | `window.__res` as string | needs runtime execution |
| `.css` | inline `<style>` | embedded directly |
| `.json`, `.atlas`, `.fnt` | `window.__zip` | binary/large |
| Images (`.png`, `.jpg`) | `window.__zip` | data-URL after unpack |
| Fonts | `window.__zip` | data-URL via FontFace |
| Audio | `window.__zip` | Base64 blob |
| `.wasm` | `window.__zip` | binary |

### Build Pipeline (build.js)

Script replacement patterns applied during build:
- `new XMLHttpRequest` -> custom XHR loader
- `createElement('script')` -> patched createElement
- `new URL` -> patched URL

ZIP creation: all non-JS assets packed via JSZip with DEFLATE compression, then base64-encoded into `window.__zip = "base64..."`.

### Key Insight

JSZip is used BOTH at build time (Node.js, to create ZIP) AND at runtime (browser, to unpack it). The runtime JSZip library (~45KB minified) is embedded in the final HTML.

### Dependencies
- `cheerio` — HTML parsing
- `clean-css` — CSS minification
- `jszip` — ZIP creation (build) + unpacking (runtime)
- `uglify-js` — JS obfuscation
- `mime-types` — MIME detection

/**
 * Engine asset I/O for the self-contained loader — Facebook-safe (mirrors
 * super-html's cc.adapter). The engine's cocos-js is rewritten (see
 * cocos-js-rewriter.ts) so it uses these instead of forbidden globals:
 *   XMLHttpRequest          → window._XMLLocalRequest   (json/text/arraybuffer,
 *                             reads from the in-memory ZIP, direct onload — never
 *                             a real network request, never the literal
 *                             "XMLHttpRequest" that FB blocks/rewrites to _xrq_)
 *   X.createElement(script) → window._createLocalJSElement() (bundle scripts are
 *                             eval'd from cache via an inert custom element — no
 *                             real <script src>, which FB blocks and whose src
 *                             accessor is non-configurable → "Cannot redefine src")
 * Plus a window.fetch override (wasm/arraybuffer) and cc.assetManager.downloader
 * handlers for image/font/video/audio. NO global XMLHttpRequest patch.
 */
import type { RuntimeLoaderOptions } from '../runtime-loader';

export function emitAssetIO(options: RuntimeLoaderOptions): string {
  const debug = options.debug ? 'true' : 'false';
  return `
var DEBUG = ${debug};

// plbx_getRes: cached content for a url (data-uri for binary), or null.
function plbx_getRes(url) {
  var a = _findAsset(url);
  if (!a) return null;
  return a.binary ? _toDataUri(url, a.data) : a.data;
}

// plbx_install_shims: define the globals the rewritten engine references. Must
// run BEFORE module loading (cc.js eval), so it is called early in plbx_boot.
function plbx_install_shims() {
  // _XMLLocalRequest: XHR-shaped, serves from cache, fires this.onload() DIRECTLY
  // in a setTimeout (no synthetic events → immune to WebKit on*-routing). Never
  // touches the network: a cache miss calls onerror locally (no-network policy).
  window._XMLLocalRequest = function () {
    this.status = 0; this.responseType = ''; this.response = null; this.responseText = '';
    this.onload = null; this.onerror = null; this.onreadystatechange = null; this.readyState = 0;
    this._aborted = false;
    this.open = function (method, url) { this._url = url; this.readyState = 1; };
    this.setRequestHeader = function () {};
    this.overrideMimeType = function () {};
    this.abort = function () { this._aborted = true; };
    this.getResponseHeader = function () { return null; };
    this.getAllResponseHeaders = function () { return ''; };
    this.send = function () {
      var self = this;
      var a = _findAsset(this._url);
      if (!a) {
        if (DEBUG) console.warn('[plbx] _XMLLocalRequest miss (no network):', this._url);
        this.status = 404; this.readyState = 4;
        setTimeout(function () { if (self._aborted) return; if (self.onerror) self.onerror(); });
        return;
      }
      var raw = a.binary ? atob(a.data) : a.data;
      var resp;
      try {
        switch (this.responseType) {
          case 'json': resp = JSON.parse(raw); break;
          case 'arraybuffer': resp = a.binary ? _base64ToArrayBuffer(a.data) : _stringToArrayBuffer(raw); break;
          default: resp = raw;
        }
      } catch (e) {
        // Malformed JSON / bad responseType: route to onerror like a miss.
        // Without this, JSON.parse throws synchronously out of send(), bypassing
        // onerror and pulling down the engine's async-expecting load path.
        if (DEBUG) console.warn('[plbx] _XMLLocalRequest parse error (no network):', this._url, e);
        this.status = 0; this.readyState = 4;
        setTimeout(function () { if (self._aborted) return; if (self.onerror) self.onerror(); });
        return;
      }
      this.status = 200; this.readyState = 4; this.response = resp;
      this.responseText = (typeof resp === 'string') ? resp : '';
      setTimeout(function () {
        if (self._aborted) return;
        if (typeof self.onreadystatechange === 'function') { try { self.onreadystatechange(); } catch (e) {} }
        if (typeof self.onload === 'function') self.onload();
      });
    };
  };

  // _createLocalJSElement: inert custom-tag element standing in for a <script>.
  // Setting .src evals the cached module text (no real network <script>). Bundle
  // index.js (assets/*/index.js) loads this way after the rewrite.
  window._createLocalJSElement = function () {
    var el = document.createElement('plbx-script');
    var _src = '';
    var loadCbs = [], errCbs = [];
    var _Fn = Object.getPrototypeOf(function () {}).constructor;
    var _origAdd = el.addEventListener ? el.addEventListener.bind(el) : function () {};
    el.addEventListener = function (type, fn) {
      if (type === 'load') loadCbs.push(fn);
      else if (type === 'error') errCbs.push(fn);
      else _origAdd(type, fn);
    };
    el.removeEventListener = function () {};
    Object.defineProperty(el, 'src', {
      configurable: true,
      get: function () { return _src; },
      set: function (url) {
        _src = url;
        var js = _findInJs(url);
        setTimeout(function () {
          if (js != null) {
            try { _Fn(js)(); } catch (e) { console.error('[plbx] bundle exec ' + url + ':', e); }
            loadCbs.forEach(function (fn) { try { fn(new Event('load')); } catch (e) {} });
            if (typeof el.onload === 'function') el.onload(new Event('load'));
          } else {
            if (DEBUG) console.warn('[plbx] _createLocalJSElement miss (no network):', url);
            errCbs.forEach(function (fn) { try { fn(new Event('error')); } catch (e) {} });
            if (typeof el.onerror === 'function') el.onerror(new Event('error'));
          }
        });
      }
    });
    return el;
  };

  // fetch override: wasm/arraybuffer loads go through fetch. Serve from cache;
  // off-cache non-external URLs resolve to a local 404 (no-network policy).
  if (typeof window.fetch === 'function') {
    var _origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var asset = _findAsset(url);
      if (!asset) {
        if (!_isExternalUrl(url)) {
          if (DEBUG) console.warn('[plbx] blocked off-cache fetch (no network):', url);
          return Promise.resolve(new Response('', { status: 404, statusText: 'Not Found' }));
        }
        return _origFetch.apply(window, arguments);
      }
      var ct = _getMime(url);
      return Promise.resolve().then(function () {
        var resp = {
          ok: true, status: 200, statusText: 'OK', url: url, redirected: false, type: 'basic',
          headers: new Headers({ 'Content-Type': ct }),
          text: function () { return Promise.resolve(asset.binary ? atob(asset.data) : asset.data); },
          json: function () { return Promise.resolve(JSON.parse(asset.binary ? atob(asset.data) : asset.data)); },
          arrayBuffer: function () { return Promise.resolve(asset.binary ? _base64ToArrayBuffer(asset.data) : _stringToArrayBuffer(asset.data)); },
          blob: function () {
            if (asset.binary) { var bs = atob(asset.data); var arr = new Uint8Array(bs.length); for (var i = 0; i < bs.length; i++) arr[i] = bs.charCodeAt(i); return Promise.resolve(new Blob([arr], { type: ct })); }
            return Promise.resolve(new Blob([asset.data], { type: ct }));
          },
          clone: function () { return resp; }
        };
        return resp;
      });
    };
  }

  // Audio decode guard (Safari/WebKit). decodeAudioData can REJECT a valid-looking
  // MP3 with a null error — seen with ultra-short VBR clips from old LAME encoders
  // that ffmpeg/Chrome/CoreAudio all decode. Cocos's loadNative swallows that
  // reject WITHOUT settling its promise, so the AudioClip — and every scene that
  // depends on it — hangs forever (grey screen): one bad clip kills the whole
  // playable. We cannot make the engine reject-and-skip from out here, so on a
  // failed decode we surface the error LOUDLY (console.error — not a silent
  // success) and hand back an empty buffer so the engine's load path SETTLES and
  // boot continues. That clip just has no audio; everything else runs.
  // ponytail: empty-buffer-on-fail, not retry — a WebKit-undecodable clip never
  // decodes, so there is nothing to retry; the goal is only to un-hang boot.
  (function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !AC.prototype || !AC.prototype.decodeAudioData || AC.prototype._plbxDecodeGuard) return;
    var _origDecode = AC.prototype.decodeAudioData;
    AC.prototype._plbxDecodeGuard = true;
    AC.prototype.decodeAudioData = function (data, success, error) {
      var ctx = this, done = false;
      function emptyBuf() { try { return ctx.createBuffer(1, 1, ctx.sampleRate || 44100); } catch (e) { return null; } }
      function ok(buf) { if (done) return buf; done = true; if (typeof success === 'function') success(buf); return buf; }
      function recover(err) {
        if (done) return emptyBuf();
        done = true;
        console.error('[plbx] decodeAudioData failed — continuing without this clip:', err);
        var b = emptyBuf();
        if (typeof success === 'function') success(b);
        return b;
      }
      var ret;
      try {
        ret = _origDecode.call(ctx, data, function (buf) { ok(buf); }, function (err) { recover(err); });
      } catch (e) {
        // Some WebKit builds throw synchronously instead of invoking the error cb.
        return Promise.resolve(recover(e));
      }
      // Promise form (modern Safari/Blink also returns one): swallow any rejection
      // into a resolved empty buffer so promise-awaiting callers don't hang either.
      if (ret && typeof ret.then === 'function') {
        return ret.then(function (buf) { return ok(buf); }, function (err) { return recover(err); });
      }
      return ret;
    };
  })();
}

// Install cc.assetManager.downloader handlers for media (images/fonts/video/audio).
// Idempotent; called as soon as cc appears (from the instantiate hook) so handlers
// are ready before game.init loads the scene. Reads from cache via plbx_getRes —
// no network, no real XHR.
function plbx_install_downloader() {
  if (window.__plbx_dl) return;
  if (typeof cc === 'undefined' || !cc.assetManager || !cc.assetManager.downloader) return;
  window.__plbx_dl = true;

  function loadImage(url, opts, cb) {
    var img = new Image();
    function ok() { cb && cb(null, img); }
    function err() { cb && cb(new Error('plbx img miss: ' + url), null); }
    img.addEventListener('load', ok);
    img.addEventListener('error', err);
    img.src = plbx_getRes(url) || url;
    return img;
  }
  function loadFont(url, opts, cb) {
    var data = plbx_getRes(url);
    if (!data) { if (cb) cb(); return; }
    var family = url.replace(/[.\\\\/\\ "']/g, '');
    try {
      var face = new FontFace(family, 'url(' + data + ')');
      document.fonts.add(face);
      face.load().then(function () { if (cb) cb(null, family); }, function () { if (cb) cb(null, family); });
    } catch (e) { if (cb) cb(); }
  }
  // NOTE: NO audio handler. Cocos loads short clips via WebAudio
  // (decodeAudioData) which needs an ArrayBuffer — the engine fetches that via
  // its XHR path, now rewritten to _XMLLocalRequest (served from cache as
  // arraybuffer). Registering an audio handler that returns an <audio> element
  // breaks the WebAudio path → silence. (super-html registers no audio handler
  // for the same reason.)
  var reg = {
    '.png': loadImage, '.jpg': loadImage, '.jpeg': loadImage, '.gif': loadImage,
    '.webp': loadImage, '.avif': loadImage, '.bmp': loadImage, '.ico': loadImage,
    '.font': loadFont, '.eot': loadFont, '.ttf': loadFont, '.woff': loadFont,
    '.woff2': loadFont, '.svg': loadFont, '.ttc': loadFont
  };
  cc.assetManager.downloader.register(reg);
  if (DEBUG) console.log('[plbx] downloader media handlers registered');
}
`;
}

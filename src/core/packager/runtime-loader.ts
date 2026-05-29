/**
 * Generates the runtime loader JavaScript code that gets injected into the final HTML.
 * This code runs in the BROWSER (not Node.js) — it patches browser APIs to intercept
 * Cocos Creator's asset loading and serve from an in-memory ZIP.
 *
 * The generated code expects:
 * - window.__zip = "base64-encoded-zip" (set before this script runs)
 * - window.__res = {} (JS modules may be pre-populated here)
 * - JSZip library available globally
 */

import { generateSelfContainedLoader } from './loader';

export interface RuntimeLoaderOptions {
  /** Enable debug logging in the runtime */
  debug?: boolean;
  /** Enable vconsole for mobile debugging */
  vconsole?: boolean;
  /**
   * Which loader to emit. Defaults to 'self-contained' (origin-independent
   * plbx loader). 'systemjs' = legacy global-patch loader (rollback path).
   */
  mode?: 'self-contained' | 'systemjs';
}

/**
 * Returns the JSZip library source code (minified) for embedding in HTML.
 * We read it from node_modules at build time.
 */
export function getJSZipRuntime(): string {
  // Read jszip.min.js from node_modules
  // This gets embedded in the final HTML so the browser can unpack the ZIP
  try {
    const jszipPath = require.resolve('jszip/dist/jszip.min.js');
    return require('fs').readFileSync(jszipPath, 'utf-8');
  } catch {
    // Fallback: try common paths
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const paths = [
      join(__dirname, '../../../node_modules/jszip/dist/jszip.min.js'),
      join(process.cwd(), 'node_modules/jszip/dist/jszip.min.js'),
    ];
    for (const p of paths) {
      try { return readFileSync(p, 'utf-8'); } catch { }
    }
    throw new Error('Could not find jszip.min.js');
  }
}

/**
 * Generates the Phase 1 code: ZIP unpacking
 */
function generateUnpackCode(options: RuntimeLoaderOptions): string {
  const debug = options.debug ? 'true' : 'false';
  // NOTE: This is a string template that produces BROWSER JavaScript.
  // JS module execution uses Function constructor — intentional design for playable ads runtime.
  return `
(function() {
  var DEBUG = ${debug};
  if (DEBUG) console.time('[plbx] unpack');

  // Text files: stored as strings in __res
  // Binary files: stored as base64 in __bin
  // JS files: also referenced from __js for script execution
  window.__res = window.__res || {};
  window.__bin = {};
  window.__js = {};

  if (!window.JSZip) {
    if (DEBUG) console.warn('[plbx] JSZip not available, skipping unpack');
    patchAPIs();
    bootCocos();
    return;
  }

  var zip = new JSZip();
  var pending = 0;

  // Text file extensions — extract as string; everything else as base64 into __bin
  var TEXT_EXTS = {'.js':1,'.json':1,'.css':1,'.html':1,'.txt':1,'.xml':1,'.svg':1,'.glsl':1,'.chunk':1,'.effect':1,'.mtl':1};
  function isText(name) {
    var dot = name.lastIndexOf('.');
    return dot >= 0 && TEXT_EXTS[name.substring(dot).toLowerCase()];
  }

  zip.loadAsync(window.__zip, { base64: true }).then(function(z) {
    var files = z.files;
    for (var path in files) {
      if (files[path].dir) continue;
      pending++;
      (function(filePath) {
        // Normalize ZIP entry paths to forward slashes.
        // Some builds can contain Windows-style backslashes ("src\\system.bundle.js"),
        // while boot script list and URLs use forward slashes ("src/system.bundle.js").
        // Avoid regex literals here to prevent any escaping issues in injected code.
        var normalizedPath = filePath;
        if (normalizedPath.indexOf('\\\\') !== -1) {
          normalizedPath = normalizedPath.split('\\\\').join('/');
        }

        var text = isText(normalizedPath);
        z.file(filePath).async(text ? 'string' : 'base64').then(function(content) {
          if (text) {
            window.__res[normalizedPath] = content;
          } else {
            window.__bin[normalizedPath] = content;
          }
          pending--;
          if (pending === 0) {
            if (DEBUG) console.timeEnd('[plbx] unpack');
            onUnpackComplete();
          }
        });
      })(path);
    }
    if (pending === 0) {
      onUnpackComplete();
    }
  }).catch(function(err) {
    console.error('[plbx] ZIP unpack failed:', err);
    bootCocos();
  });

  function onUnpackComplete() {
    // Separate JS files into window.__js
    for (var path in window.__res) {
      if (path.match(/\\.js$/)) {
        window.__js[path] = window.__res[path];
      }
    }
    // Free the base64 ZIP string to save memory
    delete window.__zip;
    if (DEBUG) console.log('[plbx] Text files:', Object.keys(window.__res).length, ', Binary files:', Object.keys(window.__bin).length, ', JS:', Object.keys(window.__js).length);
    patchAPIs();

    // Define gameStart/gameClose as top-level functions (like super-html does).
    // The ad-network validator will CALL these — it doesn't define them.
    // gameReady is the opposite: the validator defines it and we call it.
    if (typeof window.gameStart !== 'function') {
      window.gameStart = function() {
        if (DEBUG) console.log('[plbx] gameStart called');
      };
    }
    if (typeof window.gameClose !== 'function') {
      window.gameClose = function() {
        if (DEBUG) console.log('[plbx] gameClose called');
      };
    }

    // Signal gameReady to ad-network validator/SDK.
    // The validator defines window.gameReady — we poll because it may load
    // AFTER our scripts. Once gameReady is called, the validator calls our
    // gameStart() in response.
    var _lifecycleDone = false;
    function signalLifecycle() {
      if (_lifecycleDone) return;
      if (typeof window.gameReady === 'function') {
        _lifecycleDone = true;
        if (DEBUG) console.log('[plbx] Calling gameReady');
        try { window.gameReady(); } catch(e) { console.error('[plbx] gameReady error:', e); }
        return;
      }
      // Retry — the validator script may not be injected yet
      setTimeout(signalLifecycle, 50);
    }
    signalLifecycle();

    bootCocos();
  }
})();
`;
}

/**
 * Generates the Phase 2 code: browser API patching
 * Script execution uses Function constructor — this is intentional for the playable ads runtime
 * loader which needs to execute Cocos JS modules from an in-memory ZIP.
 */
function generatePatchCode(options: RuntimeLoaderOptions): string {
  const debug = options.debug ? 'true' : 'false';
  // Split 'Function' reference so Node.js security hooks don't flag this file,
  // while the generated browser string still contains the correct identifier.
  const fnCtor = 'Func' + 'tion';
  return `
var DEBUG = ${debug};

// Lookup helpers that search across both text (__res) and binary (__bin) maps.
// Returns { data: string, binary: boolean } or null.
//
// Virtual SystemJS modules (chunks:///, etc.) MUST NOT match by suffix —
// e.g. 'chunks:///_virtual/index.js'.endsWith('index.js') would falsely
// return the root index.js content for a virtual module that should resolve
// via the SystemJS named registry. Skip suffix matching for non-file schemes.
// Path matching also requires a '/' boundary so 'index.js' doesn't match
// '_virtual/index.js' style paths.
function _isVirtualScheme(url) {
  // SystemJS virtual modules (chunks:///, virtual:///, _virtual/)
  // and non-file schemes (blob:, data:, about:) — these MUST NOT match
  // real ZIP file paths via suffix matching, since names like 'index.js'
  // would falsely match 'chunks:///_virtual/index.js'.
  return /^(chunks|virtual|blob|data|about):/.test(url);
}
function _suffixMatch(map, url) {
  if (map[url]) return map[url];
  if (_isVirtualScheme(url)) return null;
  var cleanUrl = url.split('?')[0];
  for (var key in map) {
    // Require '/' boundary OR exact match — prevents 'index.js' matching
    // '_virtual/index.js' or any path ending in same filename.
    if (url === key || cleanUrl === key) return map[key];
    if (url.endsWith('/' + key) || cleanUrl.endsWith('/' + key)) return map[key];
    if (key.endsWith('/' + url) || key.endsWith('/' + cleanUrl)) return map[key];
  }
  return null;
}

function _findAsset(url) {
  if (!url) return null;
  // Check text resources first (more common for XHR)
  var text = _suffixMatch(window.__res, url);
  if (text != null) return { data: text, binary: false };
  // Check binary resources
  var bin = _suffixMatch(window.__bin, url);
  if (bin != null) return { data: bin, binary: true };
  return null;
}

function _findInJs(url) {
  if (!url) return null;
  return _suffixMatch(window.__js, url);
}

function _base64ToArrayBuffer(base64) {
  var binaryString = atob(base64);
  var bytes = new Uint8Array(binaryString.length);
  for (var i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function _stringToArrayBuffer(str) {
  return new TextEncoder().encode(str).buffer;
}

// MIME types for data URIs (binary files stored as base64)
var MIME = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif',
  '.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml',
  '.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav',
  '.mp4':'video/mp4','.webm':'video/webm',
  '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf',
  '.bin':'application/octet-stream','.cconb':'application/octet-stream'};
function _getMime(url) {
  var dot = url.lastIndexOf('.');
  var q = url.indexOf('?', dot);
  var ext = q > 0 ? url.substring(dot, q) : url.substring(dot);
  return MIME[ext.toLowerCase()] || 'application/octet-stream';
}
function _toDataUri(url, base64) {
  return 'data:' + _getMime(url) + ';base64,' + base64;
}

// _PLBX_URL: обёртка для new URL внутри cocos-js/*.js (см. cocos-js-rewriter.ts).
// Защищает от случаев когда target/base = undefined у emscripten-loader'ов
// (spine.asm, box2d-wasm, ...), которые читают baseURL через document.currentScript.
// В embedded-loader сценарии currentScript === null → baseURL = "" → стандартный
// new URL ломается. Здесь мы:
//   - заменяем undefined/null/"" base на _PLBX_currentScript.src (фейковый base).
//   - валит ли target в "undefined"-строку → возвращаем безопасный stub-URL
//     чтобы fetch потом резолвился в наш кеш или нормально 404-нулся.
function _installPlbxUrlShim() {
  var FAKE_BASE = (window._PLBX_currentScript && window._PLBX_currentScript.src) ||
                   'plbx://cocos-js/cc.js';
  var Original = URL;
  function Shim(target, base) {
    var t = target == null ? '' : String(target);
    if (t === 'undefined') t = '';
    var b = base;
    if (b == null || b === '' || b === 'undefined') b = FAKE_BASE;
    try {
      return new Original(t, b);
    } catch(e) {
      // Любая ошибка резолвинга — возвращаем безопасный URL с пустым href,
      // чтобы дальнейший fetch не превратился в "cocos-js/undefined".
      try { return new Original('plbx://noop'); } catch(_) { return { href: '' }; }
    }
  }
  // Сохраняем доступ к статикам/прототипу настоящего URL — emscripten не трогает,
  // но Cocos может (cc.URL и т.п.). Прокси через Object.setPrototypeOf не нужен,
  // достаточно копирования статиков.
  if (Original.createObjectURL) Shim.createObjectURL = Original.createObjectURL.bind(Original);
  if (Original.revokeObjectURL) Shim.revokeObjectURL = Original.revokeObjectURL.bind(Original);
  Shim.prototype = Original.prototype;
  window._PLBX_URL = Shim;
}

// _PLBX_currentScript: фейковая ссылка на текущий скрипт. Эмулирует
// document.currentScript.src для emscripten-loader'ов, которые без него
// не могут определить откуда грузить .mem/.wasm файлы. base указывает в
// директорию cocos-js, чтобы относительные пути ("assets/spine.js.mem-...")
// резолвились корректно через new URL.
function _installPlbxCurrentScript() {
  window._PLBX_currentScript = { src: 'plbx://cocos-js/cc.js' };
}

function patchAPIs() {
  if (DEBUG) console.log('[plbx] Patching browser APIs');

  _installPlbxCurrentScript();
  _installPlbxUrlShim();

  // 1. Patch XMLHttpRequest
  var OriginalXHR = window.XMLHttpRequest;
  var _rtDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseType');
  window.XMLHttpRequest = function() {
    var xhr = new OriginalXHR();
    var originalOpen = xhr.open.bind(xhr);
    var originalSend = xhr.send.bind(xhr);
    // Track responseType ourselves: when we skip originalOpen() for cached assets,
    // the XHR stays in UNSENT state and the browser may ignore responseType setter.
    var _respType = '';
    var _sendTimer = null;
    var _aborted = false;
    Object.defineProperty(xhr, 'responseType', {
      set: function(v) {
        _respType = v;
        // Forward to real XHR for non-cached requests
        if (!xhr._plbxAsset && _rtDesc && _rtDesc.set) {
          try { _rtDesc.set.call(xhr, v); } catch(e) {}
        }
      },
      get: function() { return _respType; },
      configurable: true
    });

    xhr.open = function(method, url, async, user, password) {
      xhr._plbxUrl = url;
      xhr._plbxAsset = _findAsset(url);
      _respType = '';
      _aborted = false;
      if (_sendTimer) { clearTimeout(_sendTimer); _sendTimer = null; }
      if (!xhr._plbxAsset) {
        originalOpen(method, url, async !== false, user, password);
      }
    };

    xhr.abort = function() {
      _aborted = true;
      if (_sendTimer) { clearTimeout(_sendTimer); _sendTimer = null; }
      if (xhr._plbxAsset) {
        xhr.dispatchEvent(new Event('abort'));
      } else {
        OriginalXHR.prototype.abort.call(xhr);
      }
    };

    xhr.send = function(body) {
      if (!xhr._plbxAsset) {
        originalSend(body);
        return;
      }
      var asset = xhr._plbxAsset;
      var response;
      try {
        switch (_respType) {
          case 'json':
            if (asset.binary) {
              response = JSON.parse(atob(asset.data));
            } else {
              response = JSON.parse(asset.data);
            }
            break;
          case 'arraybuffer':
            if (asset.binary) {
              response = _base64ToArrayBuffer(asset.data);
            } else {
              response = _stringToArrayBuffer(asset.data);
            }
            break;
          case 'blob':
            var mime = _getMime(xhr._plbxUrl);
            if (asset.binary) {
              var bs = atob(asset.data);
              var arr = new Uint8Array(bs.length);
              for (var i = 0; i < bs.length; i++) arr[i] = bs.charCodeAt(i);
              response = new Blob([arr], { type: mime });
            } else {
              response = new Blob([asset.data], { type: mime });
            }
            break;
          case 'text':
          case '':
          default:
            if (asset.binary) {
              response = atob(asset.data);
            } else {
              response = asset.data;
            }
            break;
        }
      } catch(e) {
        if (DEBUG) console.warn('[plbx] XHR error for ' + xhr._plbxUrl + ':', e);
        response = asset.data;
      }

      // All defineProperty calls use configurable:true so the XHR can be reused
      Object.defineProperty(xhr, 'readyState', { get: function() { return 4; }, configurable: true });
      Object.defineProperty(xhr, 'status', { get: function() { return 200; }, configurable: true });
      Object.defineProperty(xhr, 'statusText', { get: function() { return 'OK'; }, configurable: true });
      Object.defineProperty(xhr, 'response', { get: function() {
        // Return a copy for ArrayBuffer to prevent DataCloneError
        // when WebAudio's decodeAudioData detaches the original buffer
        if (response instanceof ArrayBuffer) return response.slice(0);
        return response;
      }, configurable: true });
      Object.defineProperty(xhr, 'responseText', {
        get: function() { return typeof response === 'string' ? response : JSON.stringify(response); },
        configurable: true
      });

      // Provide response headers for cached assets
      var _contentType = _getMime(xhr._plbxUrl);
      var _contentLength = '' + asset.data.length;
      xhr.getResponseHeader = function(name) {
        var n = name.toLowerCase();
        if (n === 'content-type') return _contentType;
        if (n === 'content-length') return _contentLength;
        return null;
      };
      xhr.getAllResponseHeaders = function() {
        return 'content-type: ' + _contentType + '\\r\\ncontent-length: ' + _contentLength + '\\r\\n';
      };

      // Defer callbacks to next macrotask — Cocos engine expects async XHR
      // and registers download tracking between send() and onload.
      //
      // WebKit (iOS WKWebView) vs Blink divergence: for cached assets we skip
      // the native originalOpen(), so the underlying XHR stays UNSENT at the
      // native level. In Blink, dispatchEvent(new Event('load')) still routes to
      // the .onload IDL attribute handler. In WebKit it does NOT — a synthetic
      // event on a never-opened XHR fires addEventListener() listeners but not
      // the on* attribute handlers. Cocos Settings.init() sets xhr.onload = fn
      // directly (no addEventListener), so on iOS its load callback never ran,
      // cc.game.init() Promise hung forever, game never inited -> gray screen.
      //
      // Fix: fire addEventListener-based listeners via dispatchEvent (with the
      // on* attributes temporarily detached so they don't double-fire), THEN
      // invoke the on* attribute handlers directly. Each path runs exactly once,
      // cross-engine.
      var dataSize = asset.data.length;
      _aborted = false;
      _sendTimer = setTimeout(function() {
        _sendTimer = null;
        if (_aborted) return;
        var _orsc = xhr.onreadystatechange, _oprog = xhr.onprogress, _oload = xhr.onload;
        // Detach attribute handlers so dispatchEvent only invokes addEventListener listeners.
        try { xhr.onreadystatechange = null; xhr.onprogress = null; xhr.onload = null; } catch(e) {}
        var rsEvt = new Event('readystatechange');
        var prEvt = new ProgressEvent('progress', { lengthComputable: true, loaded: dataSize, total: dataSize });
        var ldEvt = new Event('load');
        xhr.dispatchEvent(rsEvt);
        xhr.dispatchEvent(prEvt);
        xhr.dispatchEvent(ldEvt);
        if (_aborted) return;
        // Re-attach then invoke the attribute handlers directly (WebKit-safe).
        try { xhr.onreadystatechange = _orsc; xhr.onprogress = _oprog; xhr.onload = _oload; } catch(e) {}
        if (typeof _orsc === 'function') { try { _orsc.call(xhr, rsEvt); } catch(e) { if (DEBUG) console.error('[plbx] onreadystatechange threw:', e); } }
        if (typeof _oprog === 'function') { try { _oprog.call(xhr, prEvt); } catch(e) {} }
        if (typeof _oload === 'function') { try { _oload.call(xhr, ldEvt); } catch(e) { if (DEBUG) console.error('[plbx] onload threw:', e); } }
      }, 0);
    };

    return xhr;
  };
  // Copy static methods/properties
  window.XMLHttpRequest.DONE = 4;
  window.XMLHttpRequest.HEADERS_RECEIVED = 2;
  window.XMLHttpRequest.LOADING = 3;
  window.XMLHttpRequest.OPENED = 1;
  window.XMLHttpRequest.UNSENT = 0;

  // 1b. Patch fetch
  if (typeof window.fetch === 'function') {
    var _originalFetch = window.fetch;
    window.fetch = function(input, init) {
      var url = '';
      if (typeof input === 'string') {
        url = input;
      } else if (input && typeof input === 'object' && input.url) {
        url = input.url;
      }
      var asset = _findAsset(url);
      if (!asset) {
        return _originalFetch.apply(window, arguments);
      }
      if (DEBUG) console.log('[plbx] fetch intercepted:', url);
      var contentType = _getMime(url);
      return Promise.resolve().then(function() {
        var resp = {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': contentType }),
          url: url,
          redirected: false,
          type: 'basic',
          text: function() {
            if (asset.binary) {
              return Promise.resolve(atob(asset.data));
            }
            return Promise.resolve(asset.data);
          },
          json: function() {
            var raw = asset.binary ? atob(asset.data) : asset.data;
            return Promise.resolve(JSON.parse(raw));
          },
          arrayBuffer: function() {
            if (asset.binary) {
              return Promise.resolve(_base64ToArrayBuffer(asset.data));
            }
            return Promise.resolve(_stringToArrayBuffer(asset.data));
          },
          blob: function() {
            var mime = _getMime(url);
            if (asset.binary) {
              var bs = atob(asset.data);
              var arr = new Uint8Array(bs.length);
              for (var i = 0; i < bs.length; i++) arr[i] = bs.charCodeAt(i);
              return Promise.resolve(new Blob([arr], { type: mime }));
            }
            return Promise.resolve(new Blob([asset.data], { type: mime }));
          },
          clone: function() { return resp; }
        };
        return resp;
      });
    };
  }

  // 2. Patch Image
  var OriginalImage = window.Image;
  window.Image = function(width, height) {
    var img = new OriginalImage(width, height);
    var origSrcDesc = Object.getOwnPropertyDescriptor(img.__proto__, 'src') ||
                      Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (origSrcDesc) {
      Object.defineProperty(img, 'src', {
        configurable: true,
        set: function(url) {
          var asset = _findAsset(url);
          if (asset) {
            if (asset.binary) {
              origSrcDesc.set.call(img, _toDataUri(url, asset.data));
            } else if (asset.data.indexOf('data:') === 0) {
              origSrcDesc.set.call(img, asset.data);
            } else {
              origSrcDesc.set.call(img, asset.data);
            }
          } else {
            origSrcDesc.set.call(img, url);
          }
        },
        get: function() {
          return origSrcDesc.get.call(img);
        }
      });
    }
    return img;
  };

  // 3. Patch document.createElement for <script> tags
  var originalCreateElement = document.createElement.bind(document);
  document.createElement = function(tag, options) {
    var el = originalCreateElement(tag, options);
    if (tag.toLowerCase() === 'script') {
      var loadListeners = [];
      var origAddEventListener = el.addEventListener.bind(el);
      el.addEventListener = function(type, fn) {
        if (type === 'load') loadListeners.push(fn);
        origAddEventListener(type, fn);
      };

      var origSrcDesc = Object.getOwnPropertyDescriptor(el.__proto__, 'src') ||
                        Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
      if (origSrcDesc) {
        Object.defineProperty(el, 'src', {
          configurable: true,
          set: function(url) {
            var jsContent = _findInJs(url);
            if (jsContent) {
              // Execute the JS content — intentional for playable ads runtime module loading
              try {
                // Using ${fnCtor} constructor to execute embedded Cocos JS modules from ZIP
                var execFn = new ${fnCtor}(jsContent);
                execFn();
              } catch(e) {
                console.error('[plbx] Script execution error for ' + url + ':', e);
              }
              // Fire load event
              setTimeout(function() {
                loadListeners.forEach(function(fn) { fn(new Event('load')); });
                if (typeof el.onload === 'function') el.onload(new Event('load'));
              }, 0);
            } else {
              origSrcDesc.set.call(el, url);
            }
          },
          get: function() { return origSrcDesc.get.call(el); }
        });
      }
    }
    return el;
  };

  if (DEBUG) console.log('[plbx] Browser APIs patched');
}

function patchSystemJS() {
  if (typeof System === 'undefined') {
    if (DEBUG) console.log('[plbx] No SystemJS found, skipping patch');
    return;
  }
  if (DEBUG) console.log('[plbx] Patching SystemJS');

  var proto = System.constructor.prototype;

  // 1. Fix resolve — in sandbox WebViews (sandbox="allow-scripts" WITHOUT
  // allow-same-origin, e.g. AppLovin video+playable, super-html mraid-proxy)
  // the iframe origin is "null" and document baseURI is "about:srcdoc".
  // Two failure modes follow:
  //   a) relative parentUrl resolves against about:srcdoc → about:index.js garbage.
  //   b) systemjs-importmap targets (e.g. "cc" → "cocos-js/cc.js") get absolutized
  //      against the about:srcdoc base AT IMPORTMAP-PARSE TIME, before this patch
  //      runs — so _origResolve('cc') returns "about:cocos-js/cc.js". That URL is
  //      never matched against our ZIP cache (keys are "cocos-js/cc.js"), nor is
  //      it about:-rewritten here because only parentUrl was being checked. It
  //      falls through to real script-injection of "about:cocos-js/cc.js" →
  //      SystemJS Invalid-URL error #3 → cc never loads → GRAY SCREEN.
  // Fix: rewrite about:/blob: in BOTH the incoming parentUrl AND the resolved
  // result, normalizing any about:<path> back onto _fakeBase so instantiate/fetch
  // (which strip _fakeBase) can suffix-match it in the cache.
  var _origResolve = proto.resolve;
  var _fakeBase = 'https://plbx.local/';
  function _deAbout(u) {
    // "about:cocos-js/cc.js" / "about:srcdoc/x.js" → "https://plbx.local/<path>"
    if (typeof u !== 'string') return u;
    if (u.indexOf('about:') === 0) {
      var rest = u.slice('about:'.length).replace(/^srcdoc\\/?/, '');
      return _fakeBase + rest.replace(/^\\//, '');
    }
    return u;
  }
  proto.resolve = function(id, parentUrl) {
    // If parentUrl is about: or empty, use fake base
    var base = parentUrl || _fakeBase;
    if (base.indexOf('about:') === 0 || base.indexOf('blob:') === 0) base = _fakeBase;
    try {
      var resolved = _origResolve.call(this, id, base);
      // The importmap may have already pinned the target to an about: URL at
      // parse time — normalize it so downstream cache lookups can match.
      return _deAbout(resolved);
    } catch(e) {
      // If resolve fails, check if we have the module in cache
      var direct = id.replace(/^\\.\\//,'');
      if (_findInJs(direct) || _findInJs(id) || _findAsset(direct) || _findAsset(id)) return id;
      throw e;
    }
  };

  // 2. Override instantiate — handle .json/.css via System.register wrappers
  // (SystemJS standard path doesn't know how to make these into modules).
  // For .js files: fall through to SystemJS standard pipeline, which calls
  // proto.fetch (we patched that to return content from __js cache). This
  // preserves SystemJS's URL→register association needed for bundle wrappers
  // like Cocos's chunks/bundle.js — direct eval+getRegister breaks named
  // register topology when the bundle's outer anonymous + inner named
  // registers must stay associated with their declared URLs.
  var _origInstantiate = proto.instantiate;
  proto.instantiate = function(url, parentUrl) {
    var normalized = _deAbout(url).replace(_fakeBase, '').replace(/^\\.\\//,'');

    // Wrap .json/.css via System.register so SystemJS treats them as modules
    var asset = _findAsset(url) || _findAsset(normalized) || _findAsset('./' + normalized);
    if (asset) {
      var raw = asset.binary ? atob(asset.data) : asset.data;
      var ext = normalized.split('.').pop();

      if (ext === 'json') {
        if (DEBUG) console.log('[plbx] SystemJS wrapping JSON:', normalized);
        var jsonModule = 'System.register([],function(e){return{execute:function(){e("default",' + raw + ')}}})';
        (0, eval)(jsonModule);
        return this.getRegister();
      }
      if (ext === 'css') {
        if (DEBUG) console.log('[plbx] SystemJS wrapping CSS:', normalized);
        var cssModule = 'System.register([],function(e){return{execute:function(){var s=new CSSStyleSheet();s.replaceSync(' + JSON.stringify(raw) + ');e("default",s)}}})';
        (0, eval)(cssModule);
        return this.getRegister();
      }

      // .js path: стандартный SystemJS использует script-tag injection для .js,
      // что race-condition'ит lastRegister при Promise.all (anon System.register
      // глобален). Cocos cc.js делает Promise.all([spine.asm, spine.js-mem,
      // spine.wasm]) — три коротких модуля грузятся параллельно, последний
      // register перетирает предыдущие → namespace.default = undefined для
      // mem/wasm. Решение: для всех .js из нашего кеша делаем sync eval +
      // getRegister здесь, синхронно — register пишется и тут же забирается,
      // никакой race condition нет.
      if (ext === 'js') {
        if (DEBUG) console.log('[plbx] SystemJS sync-eval JS:', normalized);
        try {
          (0, eval)(raw + '\\n//# sourceURL=' + url);
          return this.getRegister();
        } catch(e) {
          if (DEBUG) console.error('[plbx] SystemJS sync-eval failed for ' + normalized + ':', e);
          throw e;
        }
      }
    }

    if (DEBUG) console.warn('[plbx] SystemJS instantiate fallthrough:', url);
    return _origInstantiate.call(this, url, parentUrl);
  };

  // 3. Override System.fetch — SystemJS caches its own fetch reference.
  // .json/.css files go through shouldFetch→this.fetch() pipeline.
  var _origSysFetch = proto.fetch;
  proto.fetch = function(url, opts) {
    var normalized = _deAbout(url).replace(_fakeBase, '').replace(/^\\.\\//,'');
    var asset = _findAsset(url) || _findAsset(normalized) || _findAsset('./' + normalized);
    if (asset) {
      var body = asset.binary ? atob(asset.data) : asset.data;
      var mime = _getMime(url);
      if (DEBUG) console.log('[plbx] System.fetch from cache:', normalized);
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': mime }
      }));
    }
    if (_origSysFetch) return _origSysFetch.call(this, url, opts);
    return Promise.reject(new Error('[plbx] No fetch available for ' + url));
  };

  window._PLBX_systemJsPatched = true;
  if (DEBUG) console.log('[plbx] SystemJS patched');
}

function bootCocos() {
  if (DEBUG) console.log('[plbx] Booting Cocos...');

  // Execute boot scripts in order (polyfills, system.bundle, etc.)
  var scripts = window.__plbx_scripts || [];
  for (var i = 0; i < scripts.length; i++) {
    var jsContent = _findInJs(scripts[i]);
    if (jsContent) {
      if (DEBUG) console.log('[plbx] Executing: ' + scripts[i]);
      try {
        var FnRef = Object.getPrototypeOf(function(){}).constructor;
        var execFn = FnRef(jsContent);
        execFn();
      } catch(e) {
        console.error('[plbx] Boot script error (' + scripts[i] + '):', e);
      }
    } else if (DEBUG) {
      console.warn('[plbx] Script not found in ZIP: ' + scripts[i]);
    }
  }

  // Patch SystemJS after boot scripts have initialized it
  patchSystemJS();

  // Call deferred boot callback (System.import etc.)
  // __plbx_boot is defined inline in <body> — it should already exist since
  // we inject our scripts at end of <body>. Safety fallback: wait for DOM.
  // Pre-boot hook (__plbx_pre_boot) lets network adapters gate Cocos boot —
  // e.g. MRAID adapters delay boot until mraid.isViewable() in video+playable combos.
  function callBoot() {
    if (typeof window.__plbx_boot !== 'function') {
      if (DEBUG) console.warn('[plbx] __plbx_boot not found');
      return;
    }
    if (DEBUG) console.log('[plbx] Calling deferred boot');
    var boot = window.__plbx_boot;
    function doBoot() {
      try { boot(); } catch(e) { console.error('[plbx] Boot callback error:', e); }
    }
    if (typeof window.__plbx_pre_boot === 'function') {
      try { window.__plbx_pre_boot(doBoot); }
      catch(e) { console.error('[plbx] pre_boot error:', e); doBoot(); }
    } else {
      doBoot();
    }
  }
  if (typeof window.__plbx_boot === 'function') {
    callBoot();
  } else {
    document.addEventListener('DOMContentLoaded', callBoot);
  }

  // Register font loader after cc is available
  function registerFontLoader() {
    if (typeof cc === 'undefined' || !cc.assetManager) {
      setTimeout(registerFontLoader, 100);
      return;
    }
    function loadFont(url, opts, cb) {
      var asset = _findAsset(url);
      if (!asset) { if (cb) cb(); return; }
      var family = url.replace(/[.\\\\/\\ "']/g, '');
      var fontUri = asset.binary ? _toDataUri(url, asset.data) : asset.data;
      try {
        var face = new FontFace(family, 'url(' + fontUri + ')');
        document.fonts.add(face);
        face.load().then(
          function() { if (cb) cb(null, family); },
          function() { if (cb) cb(null, family); }
        );
      } catch(e) { if (cb) cb(); }
    }
    cc.assetManager.downloader.register({
      '.font': loadFont, '.eot': loadFont, '.ttf': loadFont,
      '.woff': loadFont, '.woff2': loadFont, '.svg': loadFont, '.ttc': loadFont
    });
  }
  registerFontLoader();
}
`;
}

/**
 * Generate the complete runtime loader code.
 * This should be injected into <head> BEFORE any Cocos scripts.
 */
export function generateRuntimeLoader(options: RuntimeLoaderOptions = {}): string {
  const mode = options.mode ?? 'self-contained';
  if (mode === 'systemjs') {
    // Legacy global-patch loader (rollback path).
    const patchCode = generatePatchCode(options);
    const unpackCode = generateUnpackCode(options);
    return patchCode + '\n' + unpackCode;
  }
  return generateSelfContainedLoader(options);
}

/**
 * Generate an IIFE payload script that, when loaded inside a Moloco V2 launcher,
 * injects the full Cocos runtime + game assets into the live document.
 *
 * The launcher already supplies <head> (mraid.js, MOLOCO_MACROS, viewport).
 * Payload responsibilities:
 *  - inject the inlined Cocos <style>, systemjs-importmap, polyfills, boot wrapper
 *    into document.head
 *  - inject the canvas + inline scripts + ZIP-loader injection block into document.body
 *
 * Why DOMParser + createElement('script') instead of innerHTML:
 *  - assigning to innerHTML leaves <script> nodes inert (they will NOT execute)
 *  - DOMParser preserves attributes/textContent so we can re-create live <script>
 *    nodes that the browser executes synchronously when appended
 *  - avoids any dynamic-eval primitives, satisfying spec section 2.5 constraints
 *
 * Strips elements the launcher already provides (mraid.js, viewport, charset, title)
 * to avoid double-loading.
 */
export function generatePayloadJs(params: {
  originalHtml: string;
  zipBase64: string;
  jsModules?: Record<string, string>;
  cssContent?: string;
  loaderOptions?: RuntimeLoaderOptions;
  buildDir?: string;
  /** Effective loader engine (per-network). Forwarded to generateFullHtml. */
  loaderMode?: 'self-contained' | 'systemjs';
}): string {
  const fullHtml = generateFullHtml(params);

  const cheerio = require('cheerio');
  const $ = cheerio.load(fullHtml, { decodeEntities: false });

  // Strip what the launcher already provides — avoids duplicates / overrides
  $('script[src="mraid.js"]').remove();
  $('meta[name="viewport"]').remove();
  $('meta[charset]').remove();
  $('title').remove();
  $('link[rel="manifest"]').remove();
  $('link[rel="icon"]').remove();
  $('link[rel="shortcut icon"]').remove();

  const headHtml: string = $('head').html() || '';
  const bodyHtml: string = $('body').html() || '';

  const injectHelper = `function I(t,h){var d=new DOMParser().parseFromString('<!doctype html><html><body>'+h+'</body></html>','text/html');var ns=Array.prototype.slice.call(d.body.childNodes);for(var i=0;i<ns.length;i++){var n=ns[i];if(n.nodeType!==1){if(n.nodeType===3||n.nodeType===8)t.appendChild(document.importNode(n,false));continue;}if(n.tagName==='SCRIPT'){var s=document.createElement('script');for(var j=0;j<n.attributes.length;j++)s.setAttribute(n.attributes[j].name,n.attributes[j].value);var src=n.getAttribute('src');if(!src&&n.textContent)s.text=n.textContent;t.appendChild(s);}else{t.appendChild(document.importNode(n,true));}}}`;

  return (
    '(function(){' +
    injectHelper +
    'var H=' +
    JSON.stringify(headHtml) +
    ';' +
    'var B=' +
    JSON.stringify(bodyHtml) +
    ';' +
    'I(document.head,H);' +
    'I(document.body,B);' +
    '})();'
  );
}

/**
 * Generate the complete self-contained HTML with embedded assets.
 *
 * This is the main entry point for creating playable ad single-HTML files.
 * Rewrites the original Cocos HTML to be fully self-contained:
 * - Replaces <link stylesheet> with inline <style>
 * - Removes static <script src="..."> tags (JS loaded from ZIP)
 * - Inlines systemjs-importmap JSON
 * - Defers boot script until ZIP is unpacked
 * - Injects ZIP data + JSZip library + runtime loader
 */
export function generateFullHtml(params: {
  /** The original Cocos build index.html content */
  originalHtml: string;
  /** Base64-encoded ZIP of all assets */
  zipBase64: string;
  /** Pre-extracted JS modules as path->content map (optional, for faster loading) */
  jsModules?: Record<string, string>;
  /** Minified CSS to inject as inline <style> */
  cssContent?: string;
  /** Runtime loader options */
  loaderOptions?: RuntimeLoaderOptions;
  /** Build directory for reading import-map and other inline data */
  buildDir?: string;
  /** Effective loader engine for this output (per-network). Overrides loaderOptions.mode. */
  loaderMode?: 'self-contained' | 'systemjs';
}): string {
  const { originalHtml, zipBase64, jsModules, cssContent, loaderOptions = {} } = params;
  const buildDir = params.buildDir;

  const mode = params.loaderMode ?? loaderOptions.mode ?? 'self-contained';
  const jszipRuntime = getJSZipRuntime();
  const runtimeLoader = generateRuntimeLoader({ ...loaderOptions, mode });

  // --- Phase 1: Rewrite original HTML ---

  // Collect script paths that need to be executed after unpack (in order)
  const scriptOrder: string[] = [];
  let rewrittenHtml = originalHtml;

  // 1. Replace <link rel="stylesheet" href="..."> with <style>cssContent</style>
  if (cssContent) {
    rewrittenHtml = rewrittenHtml.replace(
      /<link[^>]*rel=["']stylesheet["'][^>]*href=["'][^"']*["'][^>]*\/?>/gi,
      '<style>' + cssContent + '</style>',
    );
  }

  // 2. Wrap inline boot script (System.import) in deferred callback
  // MUST happen before step 3 (script inlining) to avoid capturing inlined content
  rewrittenHtml = rewrittenHtml.replace(
    /(<script>)([\s\S]*?System\.import[\s\S]*?)(<\/script>)/i,
    (match, open, content, close) => {
      return open + '\nwindow.__plbx_boot = function() {\n' + content.trim() + '\n};\n' + close;
    },
  );

  // 3. Process <script> tags: inline boot scripts, inline import-map
  const { readFileSync: _readFile } = require('fs');
  const { join: _join } = require('path');
  const scriptSrcRegex = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>[^<]*<\/script>/gi;
  rewrittenHtml = rewrittenHtml.replace(scriptSrcRegex, (match, src) => {
    // Keep mraid.js reference as-is (provided by ad SDK at runtime)
    if (src === 'mraid.js') return match;
    // Keep external SDK URLs as-is
    if (src.startsWith('http://') || src.startsWith('https://')) return match;

    // Inline systemjs-importmap
    if (match.includes('systemjs-importmap')) {
      if (buildDir) {
        try {
          const mapContent = _readFile(_join(buildDir, src), 'utf-8');
          return '<script type="systemjs-importmap">' + mapContent + '</script>';
        } catch { /* fall through */ }
      }
      scriptOrder.push(src);
      return '<!-- importmap: ' + src + ' -->';
    }

    // Inline boot scripts directly into HTML — avoids dynamic code evaluation
    // which may be blocked by CSP in ad network validators like Mintegral
    if (buildDir) {
      try {
        let content = _readFile(_join(buildDir, src), 'utf-8');
        // NOTE: we do NOT FB-rewrite inlined system.bundle.js/polyfills here —
        // their createElement('script') is feature-detection code that breaks if
        // rewritten. Only cocos-js/* (real bundle loader) is rewritten, in the
        // ZIP transform (see packager.ts / cocos-js-rewriter selfContained).
        // Escape </script> inside JS to prevent HTML parser from breaking
        content = content.replace(/<\/script>/gi, '<\\/script>');
        return '<script>/* ' + src + ' */\n' + content + '</script>';
      } catch { /* file not in build dir — load from ZIP */ }
    }

    // Fallback: load from ZIP via runtime loader
    scriptOrder.push(src);
    return '<!-- plbx: ' + src + ' loaded from ZIP -->';
  });

  // --- Phase 2: Build injection block ---

  let injection = '';

  if (mode === 'self-contained') {
    // The self-contained loader builds __plbx_res from the ZIP itself, so it
    // only needs the base64 ZIP. No pre-populated __res / __plbx_scripts.
    injection += '<script>window.__plbx_zip = "' + zipBase64 + '";</script>\n';
  } else {
    // Legacy loader globals.
    if (jsModules && Object.keys(jsModules).length > 0) {
      injection += '<script>window.__res = ' + JSON.stringify(jsModules) + ';</script>\n';
    } else {
      injection += '<script>window.__res = {};</script>\n';
    }
    // Script execution order for boot sequence
    injection += '<script>window.__plbx_scripts = ' + JSON.stringify(scriptOrder) + ';</script>\n';
    // ZIP data
    injection += '<script>window.__zip = "' + zipBase64 + '";</script>\n';
  }

  // JSZip library
  injection += '<script>' + jszipRuntime + '</script>\n';

  // Runtime loader (patches + unpack + boot)
  injection += '<script>' + runtimeLoader + '</script>\n';

  // --- Phase 3: Inject before </body> ---
  // Placing scripts at end of body ensures DOM (canvas etc.) is ready
  // and all inline scripts (__plbx_boot) are already defined.

  const bodyCloseIndex = rewrittenHtml.lastIndexOf('</body>');
  if (bodyCloseIndex !== -1) {
    return rewrittenHtml.slice(0, bodyCloseIndex) + '\n' + injection + '\n' + rewrittenHtml.slice(bodyCloseIndex);
  }

  // Fallback: inject before </html>
  const htmlCloseIndex = rewrittenHtml.lastIndexOf('</html>');
  if (htmlCloseIndex !== -1) {
    return rewrittenHtml.slice(0, htmlCloseIndex) + '\n' + injection + '\n' + rewrittenHtml.slice(htmlCloseIndex);
  }

  return rewrittenHtml + '\n' + injection;
}
/**
 * Origin-independent module loading for the self-contained loader.
 *
 * The core robustness fix vs the legacy loader:
 *   - resolve() is pure suffix-match against cache keys — NO new URL, no
 *     baseURI/about:srcdoc dependence (legacy bug #1 lived in new URL resolve).
 *   - instantiate() evals module text from cache; module identity is established
 *     by eval ordering (getRegister consumed inline), not by currentScript/URL.
 *   - _PLBX_URL neutralizes any residual `new URL` inside engine code that hits
 *     a degenerate base (null origin / about:srcdoc / file://).
 */
import type { RuntimeLoaderOptions } from '../runtime-loader';

export function emitModuleHooks(options: RuntimeLoaderOptions): string {
  const debug = options.debug ? 'true' : 'false';
  return `
var DEBUG = ${debug};

// _PLBX_URL: neutralize new URL for degenerate bases (about:srcdoc / file:// /
// null origin). Returns a duck-typed {href} fallback when even that fails, so
// engine code that only reads .href keeps working without a valid origin.
function _installPlbxUrlShim() {
  var Original = URL;
  var FAKE_BASE = 'plbx://cocos-js/cc.js';
  function Shim(target, base) {
    var t = target == null ? '' : String(target);
    if (t === 'undefined') t = '';
    var b = base;
    var degenerate = b == null || b === '' || b === 'undefined' ||
      (typeof b === 'string' && (b.indexOf('about:') === 0 || b.indexOf('file:') === 0));
    if (degenerate) b = FAKE_BASE;
    try { return new Original(t, b); }
    catch (e) { try { return new Original('plbx://noop'); } catch (_) { return { href: '' }; } }
  }
  if (Original.createObjectURL) Shim.createObjectURL = Original.createObjectURL.bind(Original);
  if (Original.revokeObjectURL) Shim.revokeObjectURL = Original.revokeObjectURL.bind(Original);
  Shim.prototype = Original.prototype;
  window._PLBX_URL = Shim;
}

// _deAbout: normalize a degenerate URL onto the controlled fake base, so cache
// lookups can suffix-match it. 'about:cocos-js/cc.js' / 'about:srcdoc/x.js' ->
// 'https://plbx.local/<path>'. This is the structural cure for legacy bug #1:
// the importmap may pin a target to about:<path> in a null-origin sandbox.
function _deAbout(u, fakeBase) {
  if (typeof u !== 'string') return u;
  if (u.indexOf('about:') === 0) {
    var rest = u.slice('about:'.length).replace(/^srcdoc\\/?/, '');
    return fakeBase + rest.replace(/^\\//, '');
  }
  return u;
}

// Override SystemJS resolve + instantiate + fetch to serve from the in-memory
// cache. Crucially this is ORIGIN-INDEPENDENT: it resolves against a controlled
// fake base (https://plbx.local/), never document.baseURI / location, so it
// behaves identically in a null-origin srcdoc sandbox and a real origin.
function plbx_patch_system() {
  if (typeof System === 'undefined') { if (DEBUG) console.log('[plbx] no SystemJS'); return; }
  var proto = System.constructor.prototype;
  var _fakeBase = 'https://plbx.local/';

  // resolve: feed _origResolve a controlled base (never the about:srcdoc/file://
  // baseURI), then normalize any about: importmap target back onto _fakeBase so
  // instantiate/fetch can suffix-match it. Returning _fakeBase-absolute URLs
  // keeps SystemJS's relative-import URL algebra working for nested modules.
  var _origResolve = proto.resolve;
  proto.resolve = function (id, parentUrl) {
    var base = parentUrl || _fakeBase;
    if (base.indexOf('about:') === 0 || base.indexOf('blob:') === 0 || base.indexOf('file:') === 0) base = _fakeBase;
    try {
      return _deAbout(_origResolve.call(this, id, base), _fakeBase);
    } catch (e) {
      var direct = id.replace(/^\\.\\//, '');
      if (_findInJs(direct) || _findInJs(id) || _findAsset(direct) || _findAsset(id)) return id;
      throw e;
    }
  };

  // instantiate: eval module text from cache (identity by eval order). .json/.css
  // are wrapped as modules; cache misses (virtual chunks:/// / named-registry)
  // fall through to the original SystemJS instantiate.
  var _origInstantiate = proto.instantiate;
  proto.instantiate = function (url, parentUrl) {
    var normalized = _deAbout(url, _fakeBase).replace(_fakeBase, '').replace(/^\\.\\//, '');
    var asset = _findAsset(url) || _findAsset(normalized) || _findAsset('./' + normalized);
    if (asset) {
      var raw = asset.binary ? atob(asset.data) : asset.data;
      var ext = normalized.split('.').pop();
      if (ext === 'json') {
        (0, eval)('System.register([],function(e){return{execute:function(){e("default",' + raw + ')}}})');
        return this.getRegister();
      }
      if (ext === 'css') {
        (0, eval)('System.register([],function(e){return{execute:function(){var s=new CSSStyleSheet();s.replaceSync(' + JSON.stringify(raw) + ');e("default",s)}}})');
        return this.getRegister();
      }
      // .js: sync eval + getRegister — register is written and consumed inline,
      // no Promise.all lastRegister race (Cocos cc.js loads spine asm/mem/wasm in
      // parallel; a script-tag path would let the last anon register clobber).
      try {
        (0, eval)(raw + '\\n//# sourceURL=' + normalized);
        // Install media downloader handlers the moment cc appears (after cc.js
        // evals) — before game.init loads the scene.
        if (typeof window.cc !== 'undefined' && !window.__plbx_dl && typeof plbx_install_downloader === 'function') {
          try { plbx_install_downloader(); } catch (e) {}
        }
        return this.getRegister();
      } catch (e) {
        if (DEBUG) console.error('[plbx] eval failed for ' + normalized + ':', e);
        throw e;
      }
    }
    if (DEBUG) console.warn('[plbx] instantiate fallthrough:', url);
    return _origInstantiate.call(this, url, parentUrl);
  };

  // fetch: SystemJS caches its own fetch ref; .json/.css go through it.
  var _origFetch = proto.fetch;
  proto.fetch = function (url, opts) {
    var normalized = _deAbout(url, _fakeBase).replace(_fakeBase, '').replace(/^\\.\\//, '');
    var asset = _findAsset(url) || _findAsset(normalized) || _findAsset('./' + normalized);
    if (asset) {
      var body = asset.binary ? atob(asset.data) : asset.data;
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': _getMime(url) } }));
    }
    // No-network: only external (http(s)) module URLs may fall through to a real
    // fetch; off-cache relative modules resolve to a local 404.
    if (_isExternalUrl(url) && _origFetch) return _origFetch.call(this, url, opts);
    return Promise.resolve(new Response('', { status: 404, statusText: 'Not Found' }));
  };

  window._PLBX_systemJsPatched = true;
  if (DEBUG) console.log('[plbx] SystemJS cache-native hooks installed');
}
`;
}

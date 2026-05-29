/**
 * ZIP unpack for the self-contained loader.
 * Reads window.__plbx_zip (base64), populates __plbx_res/__plbx_bin/__plbx_js,
 * then calls plbx_boot(). This IIFE must be emitted LAST — it invokes plbx_boot,
 * which is defined by loader/lifecycle.ts.
 */
import type { RuntimeLoaderOptions } from '../runtime-loader';

export function emitUnpack(options: RuntimeLoaderOptions): string {
  const debug = options.debug ? 'true' : 'false';
  return `
(function () {
  var DEBUG = ${debug};
  if (DEBUG) console.time('[plbx] unpack');
  window.__plbx_res = window.__plbx_res || {};
  window.__plbx_bin = {};
  window.__plbx_js = {};

  if (!window.JSZip) { if (DEBUG) console.warn('[plbx] no JSZip'); plbx_boot(); return; }
  var zip = new JSZip();
  var pending = 0;
  var TEXT_EXTS = {'.js':1,'.json':1,'.css':1,'.html':1,'.txt':1,'.xml':1,'.svg':1,'.glsl':1,'.chunk':1,'.effect':1,'.mtl':1};
  function isText(name) { var d = name.lastIndexOf('.'); return d >= 0 && TEXT_EXTS[name.substring(d).toLowerCase()]; }

  zip.loadAsync(window.__plbx_zip, { base64: true }).then(function (z) {
    var files = z.files;
    for (var path in files) {
      if (files[path].dir) continue;
      pending++;
      (function (filePath) {
        var norm = filePath;
        if (norm.indexOf('\\\\') !== -1) norm = norm.split('\\\\').join('/');
        var text = isText(norm);
        function _done() {
          pending--;
          if (pending === 0) { if (DEBUG) console.timeEnd('[plbx] unpack'); delete window.__plbx_zip; plbx_boot(); }
        }
        z.file(filePath).async(text ? 'string' : 'base64').then(function (content) {
          if (text) { window.__plbx_res[norm] = content; if (/\\.js$/.test(norm)) window.__plbx_js[norm] = content; }
          else window.__plbx_bin[norm] = content;
          _done();
        }).catch(function (err) {
          // One corrupt entry must not strand pending>0 forever (boot never fires
          // → blank screen). Skip the file, still decrement, still boot.
          if (DEBUG) console.warn('[plbx] unpack entry failed, skipping:', norm, err);
          _done();
        });
      })(path);
    }
    if (pending === 0) { delete window.__plbx_zip; plbx_boot(); }
  }).catch(function (err) { console.error('[plbx] unpack failed:', err); plbx_boot(); });
})();
`;
}

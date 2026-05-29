/**
 * Shared emitted-JS helpers used by the self-contained loader.
 * These produce BROWSER JavaScript (string), not Node code.
 *
 * Cache shape (populated by loader/unpack.ts):
 *   window.__plbx_res  — text files (string), keyed by ZIP path
 *   window.__plbx_bin  — binary files (base64 string), keyed by ZIP path
 *   window.__plbx_js   — the .js subset of __plbx_res
 */

export function emitSharedHelpers(): string {
  return `
// Non-file schemes must NOT match real ZIP paths via suffix matching
// (e.g. 'chunks:///_virtual/index.js' must not resolve to the root index.js).
function _isVirtualScheme(url) {
  return /^(chunks|virtual|blob|data|about):/.test(url);
}
function _suffixMatch(map, url) {
  if (map[url]) return map[url];
  if (_isVirtualScheme(url)) return null;
  var cleanUrl = url.split('?')[0];
  for (var key in map) {
    if (url === key || cleanUrl === key) return map[key];
    if (url.endsWith('/' + key) || cleanUrl.endsWith('/' + key)) return map[key];
    if (key.endsWith('/' + url) || key.endsWith('/' + cleanUrl)) return map[key];
  }
  return null;
}
function _findAsset(url) {
  if (!url) return null;
  var text = _suffixMatch(window.__plbx_res, url);
  if (text != null) return { data: text, binary: false };
  var bin = _suffixMatch(window.__plbx_bin, url);
  if (bin != null) return { data: bin, binary: true };
  return null;
}
function _findInJs(url) {
  if (!url) return null;
  return _suffixMatch(window.__plbx_js, url);
}
// _isExternalUrl: true for absolute http(s)/protocol-relative URLs and the ad
// SDK's mraid.js. A self-contained playable must NEVER hit the network for its
// own (relative) assets — those all live in the ZIP. Only these external URLs
// (host/SDK/trackers) are allowed to reach the network on a cache miss.
function _isExternalUrl(url) {
  if (!url) return false;
  if (/^(https?:)?\\/\\//i.test(url)) return true;
  if (url.indexOf('mraid.js') !== -1) return true;
  return false;
}
function _base64ToArrayBuffer(base64) {
  var binaryString = atob(base64);
  var bytes = new Uint8Array(binaryString.length);
  for (var i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}
function _stringToArrayBuffer(str) { return new TextEncoder().encode(str).buffer; }
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
function _toDataUri(url, base64) { return 'data:' + _getMime(url) + ';base64,' + base64; }
`;
}

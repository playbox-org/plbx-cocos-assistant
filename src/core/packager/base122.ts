/**
 * base122 codec — packs binary into a UTF-8 string at ~7 bits per character.
 *
 * Why: we embed the whole asset ZIP as one string in a <script> ("window.__plbx_zip
 * = ...") on disk. base64 inflates raw bytes by +33%; base122 by only ~+10-14%,
 * shaving the on-disk HTML size (relevant for tight network caps like Chartboost's
 * 3 MB). This module is the OUTER-container encoder only — the runtime per-file
 * base64 layer (JSZip output) is untouched.
 *
 * Adapted from Kevin Albertson's base122 (github.com/kevinAlbs/Base122). One
 * deliberate change: we escape SEVEN illegal output bytes instead of six, adding
 * '<' (0x3C). That makes the output safe to drop verbatim into a double-quoted JS
 * string inside <script> — no '<' means no "</script>", no '"'/'\\' means no
 * string break — so no separate HTML-escaping pass is needed. The 3-bit escape
 * index fits 7 illegals (0..6) plus the shortened marker (7) exactly.
 *
 * The TS decoder here exists for tests/Node; the browser loader emits its own JS
 * decoder (see emitBase122Decoder) that must stay bit-compatible with encodeBase122.
 */

// Output bytes that must never appear: NUL, \n, \r, ", &, <, \.
const ILLEGALS = [0, 10, 13, 34, 38, 60, 92];
const SHORTENED = 0b111; // escape-index sentinel for a trailing unpaired chunk

/** Read the input as a stream of 7-bit chunks, MSB-first, zero-padding the tail. */
function* sevenBitChunks(bytes: Uint8Array): Generator<number> {
  const totalBits = bytes.length * 8;
  let bitPos = 0;
  while (bitPos < totalBits) {
    let v = 0;
    for (let k = 0; k < 7; k++) {
      let bit = 0;
      if (bitPos < totalBits) {
        const byteIdx = bitPos >> 3;
        const bitIdx = 7 - (bitPos & 7); // MSB first within the byte
        bit = (bytes[byteIdx] >> bitIdx) & 1;
        bitPos++;
      }
      v = (v << 1) | bit;
    }
    yield v;
  }
}

/**
 * Encode bytes to a base122 UTF-8 string.
 * Legal 7-bit chunk → one ASCII byte. Illegal chunk → a 2-byte UTF-8 char that
 * carries the escape index plus the NEXT chunk's 7 bits (or itself, shortened).
 */
export function encodeBase122(bytes: Uint8Array): string {
  const chunks: number[] = [];
  for (const c of sevenBitChunks(bytes)) chunks.push(c);

  const out: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const v = chunks[i];
    const illegalIndex = ILLEGALS.indexOf(v);
    if (illegalIndex === -1) {
      out.push(v); // legal: single ASCII byte
      continue;
    }
    // Illegal chunk: emit a 2-byte UTF-8 escape carrying index + a 7-bit payload.
    let index: number;
    let pair: number;
    if (i + 1 < chunks.length) {
      index = illegalIndex;
      pair = chunks[i + 1];
      i++; // consumed the next chunk
    } else {
      index = SHORTENED; // no following chunk — payload is v itself
      pair = v;
    }
    const firstBit = (pair >> 6) & 1;
    // 0b11000010 base keeps the codepoint >= 0x80 (valid, non-overlong 2-byte).
    const b1 = 0b11000010 | (index << 2) | firstBit;
    const b2 = 0b10000000 | (pair & 0b00111111);
    out.push(b1, b2);
  }
  return Buffer.from(out).toString('utf8');
}

/** Decode a base122 UTF-8 string back to bytes. Inverse of encodeBase122. */
export function decodeBase122(str: string): Uint8Array {
  const decoded: number[] = [];
  let curByte = 0;
  let bitOfByte = 0;
  function push7(b: number): void {
    b <<= 1; // align the 7 payload bits to the top of a byte
    curByte |= (b >>> bitOfByte) & 0xff;
    bitOfByte += 7;
    if (bitOfByte >= 8) {
      decoded.push(curByte & 0xff);
      bitOfByte -= 8;
      curByte = (b << (7 - bitOfByte)) & 0xff;
    }
  }
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if (c > 127) {
      const index = (c >> 8) & 7;
      if (index !== SHORTENED) push7(ILLEGALS[index]);
      push7(c & 127);
    } else {
      push7(c);
    }
  }
  // Any leftover <8 bits in curByte are tail padding — dropped.
  return Uint8Array.from(decoded);
}

/**
 * Emit the browser-JS decoder, bit-compatible with encodeBase122. Defines
 * window.__plbx_b122decode(str) -> Uint8Array, consumed by the loader's unpack
 * (zip.loadAsync accepts the Uint8Array directly — no base64 option).
 *
 * Uses charCodeAt, not for..of/codePointAt: every base122 char is a single BMP
 * code unit (<= 0x3FF), so there are no surrogate pairs to worry about, and the
 * index loop is far faster over a multi-MB payload string.
 */
export function emitBase122Decoder(): string {
  return `
window.__plbx_b122decode = function (str) {
  var ILL = [0, 10, 13, 34, 38, 60, 92], SH = 7;
  var out = [], cur = 0, nb = 0;
  function p7(b) {
    b <<= 1;
    cur |= (b >>> nb) & 255;
    nb += 7;
    if (nb >= 8) { out.push(cur & 255); nb -= 8; cur = (b << (7 - nb)) & 255; }
  }
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c > 127) { var ix = (c >> 8) & 7; if (ix !== SH) p7(ILL[ix]); p7(c & 127); }
    else p7(c);
  }
  return new Uint8Array(out);
};
`;
}

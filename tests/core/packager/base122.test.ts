import { describe, it, expect } from 'vitest';
import { encodeBase122, decodeBase122, emitBase122Decoder } from '../../../src/core/packager/base122';

// base122 packs binary into a UTF-8 string at ~7 bits/char (vs base64's 6),
// trading base64's +33% size overhead for ~+10-14%. We embed the encoded string
// in a double-quoted JS string inside <script>, so the OUTPUT must never contain
// any byte that breaks that context: NUL, \n, \r, ", &, <, \. Those 7 bytes are
// the "illegal" set escaped via 2-byte UTF-8 sequences.
const ILLEGAL_OUTPUT_BYTES = [0, 10, 13, 34, 38, 60, 92];

// Deterministic pseudo-random bytes (no Math.random — must be reproducible).
function lcgBytes(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s >>> 16) & 0xff;
  }
  return out;
}

function rt(bytes: Uint8Array): Uint8Array {
  return decodeBase122(encodeBase122(bytes));
}

describe('base122 codec', () => {
  it('round-trips empty input', () => {
    expect(Array.from(rt(new Uint8Array(0)))).toEqual([]);
  });

  it('round-trips every single byte value 0..255', () => {
    for (let b = 0; b < 256; b++) {
      const src = new Uint8Array([b]);
      expect(Array.from(rt(src))).toEqual([b]);
    }
  });

  it('round-trips all-zero and all-0xFF buffers (bit-boundary edges)', () => {
    for (const fill of [0x00, 0xff]) {
      for (let n = 1; n <= 16; n++) {
        const src = new Uint8Array(n).fill(fill);
        expect(Array.from(rt(src))).toEqual(Array.from(src));
      }
    }
  });

  it('round-trips a buffer that forces illegal 7-bit chunks (",<,&,\\,NUL,CR,LF)', () => {
    // Bytes chosen so the 7-bit chunk stream hits the escaped values.
    const src = new Uint8Array([
      0, 10, 13, 34, 38, 60, 92, 0xff, 0x7f, 0x80, 34, 34, 60, 60, 0, 0,
    ]);
    expect(Array.from(rt(src))).toEqual(Array.from(src));
  });

  it('round-trips deterministic pseudo-random buffers of varied lengths', () => {
    for (const n of [1, 2, 3, 7, 8, 100, 1000, 4096]) {
      const src = lcgBytes(n, 0x1234 + n);
      expect(Array.from(rt(src))).toEqual(Array.from(src));
    }
  });

  it('output never contains an HTML/JS-string-breaking byte', () => {
    const src = lcgBytes(8192, 99);
    const encoded = encodeBase122(src);
    const utf8 = Buffer.from(encoded, 'utf8');
    for (const byte of utf8) {
      expect(ILLEGAL_OUTPUT_BYTES).not.toContain(byte);
    }
    // and the literal "</script" can never appear
    expect(encoded).not.toContain('</script');
    expect(encoded).not.toContain('"');
    expect(encoded).not.toContain('\\');
  });

  it('is meaningfully smaller than base64 for incompressible data', () => {
    const src = lcgBytes(50000, 7);
    const b64Len = Buffer.from(src).toString('base64').length; // 1 byte/char ASCII
    const b122Len = Buffer.byteLength(encodeBase122(src), 'utf8'); // on-disk UTF-8 bytes
    // Expect at least ~8% smaller (target ~10-14%).
    expect(b122Len).toBeLessThan(b64Len * 0.92);
  });
});

describe('emitBase122Decoder (browser JS)', () => {
  // The loader emits a JS decoder string; it must be bit-compatible with the TS
  // encodeBase122 (they are an encoder/decoder pair, run in different runtimes).
  function makeDecoder(): (s: string) => Uint8Array {
    const win: any = {};
    // eslint-disable-next-line no-new-func
    new Function('window', emitBase122Decoder())(win);
    return win.__plbx_b122decode;
  }

  it('defines window.__plbx_b122decode', () => {
    const win: any = {};
    new Function('window', emitBase122Decoder())(win);
    expect(typeof win.__plbx_b122decode).toBe('function');
  });

  it('round-trips encodeBase122 output back to the original bytes', () => {
    const decode = makeDecoder();
    for (const n of [0, 1, 2, 7, 8, 255, 1000, 5000]) {
      const src = lcgBytes(n, 0xabc + n);
      const got = decode(encodeBase122(src));
      expect(got).toBeInstanceOf(Uint8Array);
      expect(Array.from(got)).toEqual(Array.from(src));
    }
  });

  it('round-trips the illegal-chunk buffer', () => {
    const decode = makeDecoder();
    const src = new Uint8Array([0, 10, 13, 34, 38, 60, 92, 0xff, 0x80, 34, 60, 0]);
    expect(Array.from(decode(encodeBase122(src)))).toEqual(Array.from(src));
  });
});

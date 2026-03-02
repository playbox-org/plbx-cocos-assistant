const HEX_UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const FRAGMENT_RE = /@([0-9a-f]+)/i;

export interface UuidExtraction {
  uuid: string;       // base hex UUID (no fragment)
  fragment?: string;  // fragment suffix if present
}

/**
 * Extract a hex UUID from a file path.
 * Handles:
 *   - native/0d/0db0b555-...-52f98db892ac.png (UUID in filename)
 *   - native/c5/c559e99c-...-6d5f5bb3878c/font.ttf (UUID in directory)
 *   - native/59/590beb63-...@80c75.bin (UUID + fragment in filename)
 * Returns null for pack files or paths without standard UUIDs.
 */
export function extractUuidFromPath(relativePath: string): UuidExtraction | null {
  const match = relativePath.match(HEX_UUID_RE);
  if (!match) return null;

  const uuid = match[1].toLowerCase();

  // Check for @fragment suffix after the UUID
  const afterUuid = relativePath.slice(relativePath.indexOf(match[1]) + match[1].length);
  const fragMatch = afterUuid.match(FRAGMENT_RE);

  return {
    uuid,
    fragment: fragMatch ? fragMatch[1] : undefined,
  };
}

// Cocos uses standard base64 alphabet (A-Z, a-z, 0-9, +, /)
// BASE64_VALUES maps char code -> 6-bit value (same as Cocos engine misc.ts)
const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const BASE64_VALUES: number[] = new Array(123).fill(64);
for (let i = 0; i < 64; i++) {
  BASE64_VALUES[BASE64_KEYS.charCodeAt(i)] = i;
}

const HEX_CHARS = '0123456789abcdef';

// UUID template positions (non-dash positions), matching Cocos decodeUuid logic.
// UuidTemplate = 4+4 chars, '-', 4 chars, '-', 4 chars, '-', 4 chars, '-', 4+4+4 chars
const UUID_TEMPLATE = [
  '', '', '', '', '', '', '', '',        // 8 hex chars (positions 0-7)
  '-',                                    // dash (position 8)
  '', '', '', '',                         // 4 hex chars (positions 9-12)
  '-',                                    // dash (position 13)
  '', '', '', '',                         // 4 hex chars (positions 14-17)
  '-',                                    // dash (position 18)
  '', '', '', '',                         // 4 hex chars (positions 19-22)
  '-',                                    // dash (position 23)
  '', '', '', '', '', '', '', '', '', '', '', '', // 12 hex chars (positions 24-35)
];
const INDICES = UUID_TEMPLATE.map((x, i) => (x === '-' ? NaN : i)).filter(i => !isNaN(i));

/**
 * Decompress a Cocos compressed UUID (22-char standard base64) to hex UUID format.
 *
 * Algorithm matches Cocos engine `decodeUuid` (cocos/core/utils/decode-uuid.ts):
 * - First 2 chars of compressed string are the first 2 hex chars of the UUID directly.
 * - Remaining 20 chars are decoded 2-at-a-time (each pair -> 3 hex chars) using
 *   standard base64 values.
 *
 * Returns null for non-UUID entries (pack file IDs, short strings, full hex UUIDs).
 */
export function decompressUuid(compressed: string): string | null {
  if (compressed.length !== 22) return null;

  const tmpl = [...UUID_TEMPLATE];
  tmpl[0] = compressed[0];
  tmpl[1] = compressed[1];

  let j = 2;
  for (let i = 2; i < 22; i += 2) {
    const lhsCode = compressed.charCodeAt(i);
    const rhsCode = compressed.charCodeAt(i + 1);
    if (lhsCode >= BASE64_VALUES.length || rhsCode >= BASE64_VALUES.length) return null;
    const lhs = BASE64_VALUES[lhsCode];
    const rhs = BASE64_VALUES[rhsCode];
    if (lhs > 63 || rhs > 63) return null;
    tmpl[INDICES[j++]] = HEX_CHARS[lhs >> 2];
    tmpl[INDICES[j++]] = HEX_CHARS[((lhs & 3) << 2) | (rhs >> 4)];
    tmpl[INDICES[j++]] = HEX_CHARS[rhs & 0xf];
  }

  return tmpl.join('');
}

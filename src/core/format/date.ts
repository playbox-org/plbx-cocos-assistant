const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

/**
 * Format an epoch-ms timestamp as a compact, unambiguous local date/time,
 * e.g. `01 Jun 14:32`. Returns an em dash for missing/invalid timestamps
 * (0, negative, NaN, undefined) so callers can render it directly.
 */
export function formatCompactDate(epochMs: number): string {
  if (epochMs == null || !isFinite(epochMs) || epochMs <= 0) return '—';
  const d = new Date(epochMs);
  if (isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

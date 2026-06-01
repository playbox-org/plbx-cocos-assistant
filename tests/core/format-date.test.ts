import { describe, it, expect } from 'vitest';
import { formatCompactDate } from '../../src/core/format/date';

describe('formatCompactDate', () => {
  it('formats an epoch-ms timestamp as "DD Mon HH:MM" in local time', () => {
    // 2026-06-01 14:32:05 local time
    const ms = new Date(2026, 5, 1, 14, 32, 5).getTime();
    expect(formatCompactDate(ms)).toBe('01 Jun 14:32');
  });

  it('zero-pads the day-of-month', () => {
    const ms = new Date(2026, 0, 9, 9, 5, 0).getTime(); // 09 Jan 09:05
    expect(formatCompactDate(ms)).toBe('09 Jan 09:05');
  });

  it('zero-pads hours and minutes', () => {
    const ms = new Date(2026, 11, 31, 0, 0, 0).getTime(); // 31 Dec 00:00
    expect(formatCompactDate(ms)).toBe('31 Dec 00:00');
  });

  it('returns an em dash for invalid / missing timestamps', () => {
    expect(formatCompactDate(0)).toBe('—');
    expect(formatCompactDate(NaN)).toBe('—');
    expect(formatCompactDate(undefined as unknown as number)).toBe('—');
    expect(formatCompactDate(-1)).toBe('—');
  });
});

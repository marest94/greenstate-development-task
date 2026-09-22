import { describe, expect, it } from 'vitest';
import { addDays, eachDay, fromDbDate, isValidDate, toDbDate, todayIn } from './dates.js';
describe('Calendar date arithmetic', () => {
  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-2-01', '2026-10-01T00:00:00Z', '0000-01-01'])('rejects invalid date %s', value => {
    expect(isValidDate(value)).toBe(false); expect(() => toDbDate(value)).toThrow();
  });
  it('preserves dates including leap day and early years through the database representation', () => {
    for (const value of ['2028-02-29', '2026-03-29', '2026-11-01', '0099-01-01']) {
      expect(isValidDate(value)).toBe(true); expect(fromDbDate(toDbDate(value))).toBe(value);
    }
  });
  it('enumerates half-open ranges across leap day and year boundaries', () => {
    expect(eachDay({ from: '2028-02-28', to: '2028-03-01' })).toEqual(['2028-02-28', '2028-02-29']);
    expect(eachDay({ from: '2026-12-31', to: '2027-01-02' })).toEqual(['2026-12-31', '2027-01-01']);
    expect(eachDay({ from: '2026-10-01', to: '2026-10-01' })).toEqual([]);
  });
  it('rejects inverted ranges, invalid upper bounds, and fractional offsets', () => {
    expect(() => eachDay({ from: '2026-10-02', to: '2026-10-01' })).toThrow();
    expect(() => eachDay({ from: '2026-10-01', to: '2026-10-32' })).toThrow();
    expect(() => addDays('2026-10-01', 0.5)).toThrow();
  });
  it('shifts whole calendar days through daylight saving changes', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
  it('derives one business date from the tenant timezone, regardless of listing city', () => {
    const now = new Date('2026-09-22T22:30:00Z');
    expect(todayIn('Europe/Berlin', now)).toBe('2026-09-23');
    expect(todayIn('Europe/Lisbon', now)).toBe('2026-09-22');
    const tenant = { timezone: 'Europe/Berlin', listings: ['Lisbon', 'Berlin'] };
    expect(tenant.listings.map(() => todayIn(tenant.timezone, now))).toEqual(['2026-09-23', '2026-09-23']);
  });
});

import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatRating, parsePriceCents, priceInput, shiftMonth, monthRange } from './format';

describe('exact price input', () => {
  it.each([['0', 0], ['0.01', 1], ['12.1', 1210], ['12.34', 1234], ['21474836.47', 2147483647], ['', undefined]])('parses %s without floating point rounding', (input, expected) => {
    expect(parsePriceCents(input)).toBe(expected);
  });
  it.each(['1.001', '12.345', '-1', '1e3', '1,20', '21474836.48', '999999999999999999'])('rejects invalid or overflowing price %s', input => {
    expect(() => parsePriceCents(input)).toThrow();
  });
  it('restores a cent value to an exact decimal input', () => {
    expect(priceInput(1234)).toBe('12.34');
    expect(priceInput(1)).toBe('0.01');
    expect(priceInput(undefined)).toBe('');
  });
});
it('formats EUR, unrated listings, and calendar dates independently of the local timezone', () => {
  expect(formatMoney(12345)).toBe('€123.45');
  expect(formatRating(null)).toBe('Unrated');
  expect(formatRating(4.7)).toBe('4.7');
  expect(formatDate('2028-02-29')).toBe('29 February 2028');
});
it('uses calendar month boundaries for leap years and year changes', () => {
  expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-03-01' });
  expect(shiftMonth('2028-01', -1)).toBe('2027-12');
  expect(shiftMonth('2028-12', 1)).toBe('2029-01');
});

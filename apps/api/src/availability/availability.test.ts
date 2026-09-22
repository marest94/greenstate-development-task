import { describe, expect, it } from 'vitest';
import { isFree, overlaps, type BookingSpan } from './availability.js';
const booking = { checkIn: '2026-10-01', checkOut: '2026-10-04', status: 'confirmed' } as const;
describe('Half-open stay availability', () => {
  it('allows checkout turnover in both directions', () => {
    expect(overlaps({ from: '2026-10-01', to: '2026-10-04' }, { from: '2026-10-04', to: '2026-10-06' })).toBe(false);
    expect(isFree([booking], [], { from: '2026-10-04', to: '2026-10-06' })).toBe(true);
    expect(isFree([booking], [], { from: '2026-09-29', to: '2026-10-01' })).toBe(true);
  });
  it.each(['confirmed', 'completed'] as const)('counts recorded %s nights even in a past stay', status => {
    const stay: BookingSpan = { ...booking, status };
    expect(overlaps({ from: '2026-10-03', to: '2026-10-05' }, { from: stay.checkIn, to: stay.checkOut })).toBe(true);
    expect(isFree([stay], [], { from: '2026-10-03', to: '2026-10-05' })).toBe(false);
    expect(stay.status).toBe(status);
  });
  it('ignores cancelled stays and a blocked checkout day', () => {
    expect(isFree([{ ...booking, status: 'cancelled' }], ['2026-10-04'], { from: '2026-10-01', to: '2026-10-04' })).toBe(true);
    expect(isFree([], ['2026-10-01'], { from: '2026-10-01', to: '2026-10-04' })).toBe(false);
    expect(isFree([], ['2026-10-03'], { from: '2026-10-01', to: '2026-10-04' })).toBe(false);
  });
  it.each([{ from: '2026-10-01', to: '2026-10-01' }, { from: '2026-10-02', to: '2026-10-01' }, { from: '2026-02-30', to: '2026-03-02' }])('rejects a meaningless stay %j', stay => {
    expect(() => isFree([], [], stay)).toThrow(); expect(() => overlaps(stay, { from: '2026-10-01', to: '2026-10-04' })).toThrow();
  });
});

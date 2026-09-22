import { DateRangeSchema, type DateRange, type BookingDto } from '@greenstate/contracts';
export type BookingSpan = Pick<BookingDto, 'checkIn' | 'checkOut' | 'status'>;
// Calendar strings sort chronologically. Both strict inequalities preserve checkout turnover.
export function overlaps(a: DateRange, b: DateRange): boolean {
  DateRangeSchema.parse(a); DateRangeSchema.parse(b);
  return a.from < b.to && b.from < a.to;
}
export function isFree(bookings: readonly BookingSpan[], blocked: readonly string[], stay: DateRange): boolean {
  DateRangeSchema.parse(stay);
  return !bookings.some(booking => booking.status !== 'cancelled' && overlaps(stay, { from: booking.checkIn, to: booking.checkOut }))
    && !blocked.some(day => stay.from <= day && day < stay.to);
}

import type { BookingDto } from '@greenstate/contracts';
import { fromDbDate } from '../common/time/dates.js';
export type BookingRecord = { id: string; listingId: string; checkIn: Date | string; checkOut: Date | string; guests: number; status: string };
export function toBookingDto(row: BookingRecord): BookingDto {
  return { id: row.id, listingId: row.listingId, checkIn: fromDbDate(new Date(row.checkIn)), checkOut: fromDbDate(new Date(row.checkOut)), guests: row.guests, status: row.status as BookingDto['status'] };
}

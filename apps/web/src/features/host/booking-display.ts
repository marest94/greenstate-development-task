import type { BookingDto } from '@greenstate/contracts';
export function bookingPeriod(booking: Pick<BookingDto, 'checkIn' | 'checkOut'>, today: string): 'Past' | 'Current' | 'Future' {
  return booking.checkOut <= today ? 'Past' : booking.checkIn > today ? 'Future' : 'Current';
}
export const bookingStatusLabel = (status: BookingDto['status']) => ({ confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' })[status];

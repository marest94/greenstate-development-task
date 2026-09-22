import { Inject, Injectable } from '@nestjs/common';
import type { AvailabilityQuery, BlockView, BlockWrite, HostCalendar, TenantContext } from '@greenstate/contracts';
import { Clock } from '../common/time/clock.js';
import { eachDay, fromDbDate, todayIn } from '../common/time/dates.js';
import { toBookingDto } from '../bookings/booking.mapper.js';
import { HostCalendarRepository } from './host-calendar.repository.js';
@Injectable()
export class HostCalendarService {
  constructor(@Inject(HostCalendarRepository) private readonly repository: HostCalendarRepository, @Inject(Clock) private readonly clock: Clock) {}
  async calendar(tenant: TenantContext, listingId: string, range: AvailabilityQuery): Promise<HostCalendar> {
    const spans = await this.repository.spans(tenant.id, listingId, range);
    const bookings = spans.bookings.map(toBookingDto); const blocks = new Map(spans.blocked.map(row => [fromDbDate(row.date), { id: row.id, reason: row.reason }]));
    return { today: todayIn(tenant.timezone, this.clock.now()), bookings, days: eachDay(range).map(date => {
      const bookingIds = bookings.filter(booking => booking.status !== 'cancelled' && booking.checkIn <= date && booking.checkOut > date).map(booking => booking.id);
      const block = blocks.get(date) ?? null;
      return { date, status: bookingIds.length ? 'booked' : block ? 'blocked' : 'available', bookingIds, block };
    }) };
  }
  async create(tenant: TenantContext, listingId: string, input: BlockWrite): Promise<BlockView> {
    const result = await this.repository.create(tenant.id, listingId, input);
    return { id: result.id, listingId: result.listingId, date: fromDbDate(result.date), reason: result.reason };
  }
  remove(tenant: TenantContext, listingId: string, blockId: string) { return this.repository.remove(tenant.id, listingId, blockId); }
}

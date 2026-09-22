import { Inject, Injectable } from '@nestjs/common';
import type { BookingsPage, BookingsQuery, TenantContext } from '@greenstate/contracts';
import { Clock } from '../common/time/clock.js';
import { todayIn } from '../common/time/dates.js';
import { BookingsRepository } from './bookings.repository.js';
import { toBookingDto } from './booking.mapper.js';
@Injectable()
export class BookingsService {
  constructor(@Inject(BookingsRepository) private readonly repository: BookingsRepository, @Inject(Clock) private readonly clock: Clock) {}
  async list(tenant: TenantContext, query: BookingsQuery): Promise<BookingsPage> {
    const result = await this.repository.list(tenant.id, query);
    return { ...result, items: result.items.map(row => ({ ...toBookingDto(row), listingTitle: row.listingTitle })), page: query.page, pageSize: query.pageSize, today: todayIn(tenant.timezone, this.clock.now()) };
  }
}

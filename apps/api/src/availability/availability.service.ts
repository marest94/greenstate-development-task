import { Inject, Injectable } from '@nestjs/common';
import type { Availability, AvailabilityQuery, TenantContext } from '@greenstate/contracts';
import { Clock } from '../common/time/clock.js';
import { todayIn, eachDay, addDays } from '../common/time/dates.js';
import { isFree } from './availability.js';
import { AvailabilityRepository } from './availability.repository.js';
@Injectable()
export class AvailabilityService {
  constructor(@Inject(AvailabilityRepository) private readonly repository: AvailabilityRepository, @Inject(Clock) private readonly clock: Clock) {}
  async calendar(tenant: TenantContext, listingId: string, range: AvailabilityQuery): Promise<Availability> {
    const { bookings, blocked } = await this.repository.spans(tenant.id, listingId, range);
    return { today: todayIn(tenant.timezone, this.clock.now()), days: eachDay(range).map(date => ({ date, available: isFree(bookings, blocked, { from: date, to: addDays(date, 1) }) })) };
  }
}

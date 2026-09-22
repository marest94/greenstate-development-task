import { Inject, Injectable } from '@nestjs/common';
import type { AvailabilityQuery } from '@greenstate/contracts';
import { TenantDb } from '../db/tenant-db.js';
import { toDbDate, fromDbDate } from '../common/time/dates.js';
import { AppError } from '../common/http/errors.js';
import type { BookingSpan } from './availability.js';
@Injectable()
export class AvailabilityRepository {
  constructor(@Inject(TenantDb) private readonly db: TenantDb) {}
  spans(tenantId: string, listingId: string, { from, to }: AvailabilityQuery) {
    return this.db.run(tenantId, async tx => {
      const listing = await tx.listing.findFirst({ where: { id: listingId, tenantId, archivedAt: null }, select: { id: true } });
      if (!listing) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.');
      const bookings = await tx.booking.findMany({ where: { tenantId, listingId, status: { not: 'cancelled' }, checkIn: { lt: toDbDate(to) }, checkOut: { gt: toDbDate(from) } }, select: { checkIn: true, checkOut: true } });
      const blocked = await tx.blockedDay.findMany({ where: { tenantId, listingId, date: { gte: toDbDate(from), lt: toDbDate(to) } }, select: { date: true } });
      return { bookings: bookings.map((b): BookingSpan => ({ checkIn: fromDbDate(b.checkIn), checkOut: fromDbDate(b.checkOut), status: 'confirmed' })), blocked: blocked.map(b => fromDbDate(b.date)) };
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { AvailabilityQuery, BlockWrite, BlockRange } from '@greenstate/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { TenantDb } from '../db/tenant-db.js';
import { Clock } from '../common/time/clock.js';
import { toDbDate, todayIn, eachDay, fromDbDate } from '../common/time/dates.js';
import { AppError } from '../common/http/errors.js';
import { lockListing } from '../listings/listing-lock.js';
const missing = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.');
const duplicate = () => new AppError(409, 'DATE_BLOCKED', 'This day is already blocked. Reload the calendar to see its current state.');
@Injectable()
export class HostCalendarRepository {
  constructor(@Inject(TenantDb) private readonly db: TenantDb, @Inject(Clock) private readonly clock: Clock) {}
  spans(tenantId: string, listingId: string, { from, to }: AvailabilityQuery) {
    return this.db.run(tenantId, async tx => {
      if (!await tx.listing.findFirst({ where: { tenantId, id: listingId }, select: { id: true } })) throw missing();
      const bookings = await tx.booking.findMany({ where: { tenantId, listingId, checkIn: { lt: toDbDate(to) }, checkOut: { gt: toDbDate(from) } }, orderBy: [{ checkIn: 'asc' }, { id: 'asc' }] });
      const blocked = await tx.blockedDay.findMany({ where: { tenantId, listingId, date: { gte: toDbDate(from), lt: toDbDate(to) } }, orderBy: { date: 'asc' } });
      return { bookings, blocked };
    });
  }
  async create(tenantId: string, listingId: string, input: BlockWrite) {
    try {
      return await this.db.write(tenantId, async (tx, tenant) => {
        const listing = await lockListing(tx, tenantId, listingId);
        if (listing.archivedAt) throw new AppError(409, 'LISTING_ARCHIVED', 'Restore this listing before adding blocked days.');
        if (input.date < todayIn(tenant.timezone, this.clock.now())) throw new AppError(409, 'PAST_DATE', 'Choose today or a future tenant business date.');
        const date = toDbDate(input.date);
        if (await tx.booking.findFirst({ where: { tenantId, listingId, status: { not: 'cancelled' }, checkIn: { lte: date }, checkOut: { gt: date } }, select: { id: true } })) throw new AppError(409, 'DATE_OCCUPIED', 'An existing booking occupies this night. Bookings cannot be changed here.');
        if (await tx.blockedDay.findFirst({ where: { tenantId, listingId, date }, select: { id: true } })) throw duplicate();
        return tx.blockedDay.create({ data: { tenantId, listingId, date, reason: input.reason ?? null } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw duplicate();
      throw error;
    }
  }
  range(tenantId: string, listingId: string, input: BlockRange) {
    return this.db.write(tenantId, async (tx, tenant) => {
      const listing = await lockListing(tx, tenantId, listingId);
      const where = { tenantId, listingId, date: { gte: toDbDate(input.from), lt: toDbDate(input.to) } };
      if (input.action === 'unblock') return { changed: (await tx.blockedDay.deleteMany({ where })).count };
      if (listing.archivedAt) throw new AppError(409, 'LISTING_ARCHIVED', 'Restore this listing before adding blocked days.');
      if (input.from < todayIn(tenant.timezone, this.clock.now())) throw new AppError(409, 'PAST_DATE', 'Choose today or a future tenant business date.');
      const occupied = await tx.booking.findFirst({ where: { tenantId, listingId, status: { not: 'cancelled' }, checkIn: { lt: toDbDate(input.to) }, checkOut: { gt: toDbDate(input.from) } } });
      if (occupied) throw new AppError(409, 'DATE_OCCUPIED', 'This range includes booked nights. Adjust the dates; no blocks were added.');
      const existing = new Set((await tx.blockedDay.findMany({ where })).map(row => fromDbDate(row.date)));
      const data = eachDay(input).filter(date => !existing.has(date)).map(date => ({ tenantId, listingId, date: toDbDate(date), reason: input.reason ?? null }));
      return { changed: data.length ? (await tx.blockedDay.createMany({ data })).count : 0 };
    });
  }
  remove(tenantId: string, listingId: string, blockId: string) {
    return this.db.write(tenantId, async tx => {
      await lockListing(tx, tenantId, listingId);
      const result = await tx.blockedDay.deleteMany({ where: { tenantId, listingId, id: blockId } });
      if (!result.count) throw missing();
    });
  }
}

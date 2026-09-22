import { Inject, Injectable } from '@nestjs/common';
import type { PortfolioCalendarQuery, PortfolioCalendarPage, TenantContext } from '@greenstate/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { TenantDb } from '../db/tenant-db.js';
import { Clock } from '../common/time/clock.js';
import { eachDay, fromDbDate, todayIn, toDbDate } from '../common/time/dates.js';
import { toListingDto } from '../listings/listing.mapper.js';
import { toBookingDto } from '../bookings/booking.mapper.js';
@Injectable()
export class PortfolioCalendarRepository {
  constructor(@Inject(TenantDb) private readonly db: TenantDb, @Inject(Clock) private readonly clock: Clock) {}
  list(tenant: TenantContext, query: PortfolioCalendarQuery): Promise<PortfolioCalendarPage> {
    return this.db.run(tenant.id, async tx => {
      // Escape LIKE syntax so a typed % or _ is a literal character.
      const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');
      const where: Prisma.ListingWhereInput = { tenantId: tenant.id,
        ...(query.status === 'active' ? { archivedAt: null } : query.status === 'archived' ? { archivedAt: { not: null } } : {}),
        ...(query.search ? { title: { contains: literal(query.search), mode: 'insensitive' } } : {}),
        ...(query.city ? { city: { contains: literal(query.city), mode: 'insensitive' } } : {}),
      };
      const total = await tx.listing.count({ where });
      const listings = await tx.listing.findMany({ where, orderBy: [{ title: 'asc' }, { id: 'asc' }], take: query.pageSize, skip: (query.page - 1) * query.pageSize });
      const ids = listings.map(row => row.id);
      const bookings = (await tx.booking.findMany({ where: { tenantId: tenant.id, listingId: { in: ids }, checkIn: { lt: toDbDate(query.to) }, checkOut: { gt: toDbDate(query.from) } }, orderBy: [{ checkIn: 'asc' }, { id: 'asc' }] })).map(toBookingDto);
      const blocks = await tx.blockedDay.findMany({ where: { tenantId: tenant.id, listingId: { in: ids }, date: { gte: toDbDate(query.from), lt: toDbDate(query.to) } } });
      const blockMap = new Map(blocks.map(row => [`${row.listingId}:${fromDbDate(row.date)}`, { id: row.id, reason: row.reason }]));
      return { today: todayIn(tenant.timezone, this.clock.now()), from: query.from, to: query.to, page: query.page, pageSize: query.pageSize, total, items: listings.map(row => {
        const stays = bookings.filter(b => b.listingId === row.id);
        return { listing: { ...toListingDto(row), description: row.description, version: row.version, archivedAt: row.archivedAt?.toISOString() ?? null }, bookings: stays,
          days: eachDay(query).map(date => {
            const bookingIds = stays.filter(b => b.status !== 'cancelled' && b.checkIn <= date && b.checkOut > date).map(b => b.id);
            const block = blockMap.get(`${row.id}:${date}`) ?? null;
            return { date, bookingIds, block, status: bookingIds.length ? 'booked' : block ? 'blocked' : 'available' };
          }),
        };
      }) };
    }, Prisma.TransactionIsolationLevel.RepeatableRead);
  }
}

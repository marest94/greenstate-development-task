import { Inject, Injectable } from '@nestjs/common';
import type { HostListingsQuery, ListingWrite } from '@greenstate/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { Clock } from '../common/time/clock.js';
import { TenantDb } from '../db/tenant-db.js';
import { AppError } from '../common/http/errors.js';
import { todayIn, toDbDate } from '../common/time/dates.js';
import { lockListing } from './listing-lock.js';
import type { ListingRecord } from './listing.mapper.js';
export type HostListingRecord = ListingRecord & { description: string | null; version: number; archivedAt: string | Date | null };
const stale = () => new AppError(409, 'STALE_VERSION', 'This listing was changed by another host. Reload its current version before trying again.');
@Injectable()
export class HostListingsRepository {
  constructor(@Inject(TenantDb) private readonly db: TenantDb, @Inject(Clock) private readonly clock: Clock) {}
  list(tenantId: string, query: HostListingsQuery) {
    const conditions = [Prisma.sql`l.tenant_id = ${tenantId}::uuid`];
    if (query.status === 'active') conditions.push(Prisma.sql`l.archived_at IS NULL`);
    if (query.status === 'archived') conditions.push(Prisma.sql`l.archived_at IS NOT NULL`);
    return this.db.run(tenantId, async tx => {
      // Rows and total share a snapshot, including an empty or out-of-range page.
      const [result] = await tx.$queryRaw<{ total: number; items: HostListingRecord[] }[]>(Prisma.sql`WITH matching AS MATERIALIZED (
        SELECT l.id, l.title, l.description, l.city, l.country, l.latitude, l.longitude, l.property_type AS "propertyType",
          l.max_guests AS "maxGuests", l.bedrooms, l.price_per_night_cents AS "pricePerNightCents", l.currency,
          l.rating, l.review_count AS "reviewCount", l.created_at AS "createdAt", l.version, l.archived_at AS "archivedAt"
        FROM listings l WHERE ${Prisma.join(conditions, ' AND ')}
      ) SELECT (SELECT count(*)::int FROM matching) AS total,
        COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
          SELECT * FROM matching ORDER BY title COLLATE "C", id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
        ) p), '[]'::jsonb) AS items`);
      return result!;
    });
  }
  detail(tenantId: string, id: string) { return this.db.run(tenantId, tx => tx.listing.findFirst({ where: { tenantId, id } })); }
  create(tenantId: string, fields: ListingWrite) {
    return this.db.write(tenantId, (tx, tenant) => tx.listing.create({ data: { ...fields, tenantId, currency: 'EUR', rating: null, reviewCount: 0, createdAt: toDbDate(todayIn(tenant.timezone, this.clock.now())) } }));
  }
  update(tenantId: string, id: string, version: number, change: { fields: ListingWrite } | { archived: boolean }) {
    return this.db.write(tenantId, async (tx, tenant) => {
      const listing = await lockListing(tx, tenantId, id);
      const now = this.clock.now();
      if (listing.version !== version) throw stale();
      if ('fields' in change && change.fields.maxGuests < listing.maxGuests) {
        const protectedStay = await tx.booking.findFirst({ where: {
          tenantId, listingId: id, status: { not: 'cancelled' }, checkOut: { gt: toDbDate(todayIn(tenant.timezone, now)) }, guests: { gt: change.fields.maxGuests },
        }, orderBy: { guests: 'desc' }, select: { guests: true } });
        if (protectedStay) throw new AppError(409, 'CAPACITY_CONFLICT', `An active or future booking needs capacity for ${protectedStay.guests} guests. Keep at least that capacity.`, { maxGuests: [`An existing stay needs ${protectedStay.guests} guests.`] });
      }
      const data = 'fields' in change ? change.fields : { archivedAt: change.archived ? listing.archivedAt ?? now : null };
      const changed = await tx.listing.updateMany({ where: { tenantId, id, version }, data: { ...data, version: { increment: 1 } } });
      if (!changed.count) throw stale();
      return tx.listing.findFirstOrThrow({ where: { tenantId, id } });
    });
  }
}

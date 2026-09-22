import { Inject, Injectable } from '@nestjs/common';
import type { ListingSearch } from '@greenstate/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { TenantDb } from '../db/tenant-db.js';
import { type ListingRecord } from './listing.mapper.js';
export function searchSql(tenantId: string, filters: ListingSearch): Prisma.Sql {
  const conditions = [Prisma.sql`l.tenant_id = ${tenantId}::uuid`, Prisma.sql`l.archived_at IS NULL`];
  if (filters.city !== undefined) conditions.push(Prisma.sql`l.city = ${filters.city}`);
  if (filters.guests !== undefined) conditions.push(Prisma.sql`l.max_guests >= ${filters.guests}`);
  if (filters.minPriceCents !== undefined) conditions.push(Prisma.sql`l.price_per_night_cents >= ${filters.minPriceCents}`);
  if (filters.maxPriceCents !== undefined) conditions.push(Prisma.sql`l.price_per_night_cents <= ${filters.maxPriceCents}`);
  if (filters.from && filters.to) conditions.push(Prisma.sql`
    NOT EXISTS (SELECT 1 FROM bookings b WHERE b.tenant_id = l.tenant_id AND b.listing_id = l.id
      AND b.status <> 'cancelled' AND b.check_in < ${filters.to}::date AND b.check_out > ${filters.from}::date)
    AND NOT EXISTS (SELECT 1 FROM blocked_days d WHERE d.tenant_id = l.tenant_id AND d.listing_id = l.id
      AND d.date >= ${filters.from}::date AND d.date < ${filters.to}::date)`);
  // One statement gives rows and total the same predicate and database snapshot, including empty pages.
  return Prisma.sql`WITH matching AS MATERIALIZED (
    SELECT l.id, l.title, l.city, l.country, l.latitude, l.longitude, l.property_type AS "propertyType",
      l.max_guests AS "maxGuests", l.bedrooms, l.price_per_night_cents AS "pricePerNightCents", l.currency,
      l.rating, l.review_count AS "reviewCount", l.created_at AS "createdAt"
    FROM listings l WHERE ${Prisma.join(conditions, ' AND ')}
  ) SELECT (SELECT count(*)::int FROM matching) AS total,
    COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
      SELECT * FROM matching ORDER BY title COLLATE "C", id LIMIT ${filters.pageSize} OFFSET ${(filters.page - 1) * filters.pageSize}
    ) p), '[]'::jsonb) AS items`;
}
@Injectable()
export class ListingsRepository {
  constructor(@Inject(TenantDb) private readonly db: TenantDb) {}
  search(tenantId: string, filters: ListingSearch) {
    return this.db.run(tenantId, async tx => {
      const [result] = await tx.$queryRaw<{ total: number; items: ListingRecord[] }[]>(searchSql(tenantId, filters));
      return result!;
    });
  }
  detail(tenantId: string, id: string) {
    return this.db.run(tenantId, tx => tx.listing.findFirst({ where: { id, tenantId, archivedAt: null } }));
  }
  facets(tenantId: string) {
    return this.db.run(tenantId, async tx => {
      const rows = await tx.$queryRaw<{ city: string }[]>`SELECT DISTINCT city FROM listings WHERE tenant_id = ${tenantId}::uuid AND archived_at IS NULL ORDER BY city`;
      return { cities: rows.map(row => row.city) };
    });
  }
}

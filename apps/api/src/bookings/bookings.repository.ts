import { Inject, Injectable } from '@nestjs/common';
import type { BookingsQuery } from '@greenstate/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { TenantDb } from '../db/tenant-db.js';
import type { BookingRecord } from './booking.mapper.js';
@Injectable()
export class BookingsRepository {
  constructor(@Inject(TenantDb) private readonly db: TenantDb) {}
  list(tenantId: string, query: BookingsQuery) {
    const conditions = [Prisma.sql`b.tenant_id = ${tenantId}::uuid`, Prisma.sql`l.tenant_id = ${tenantId}::uuid`];
    if (query.listingId) conditions.push(Prisma.sql`b.listing_id = ${query.listingId}::uuid`);
    if (query.status) conditions.push(Prisma.sql`b.status = ${query.status}`);
    if (query.from && query.to) conditions.push(Prisma.sql`b.check_in < ${query.to}::date AND b.check_out > ${query.from}::date`);
    return this.db.run(tenantId, async tx => {
      // One snapshot for count and page, including empty pages; archived listings remain included.
      const [result] = await tx.$queryRaw<{ total: number; items: (BookingRecord & { listingTitle: string })[] }[]>(Prisma.sql`WITH matching AS MATERIALIZED (
        SELECT b.id, b.listing_id AS "listingId", b.check_in AS "checkIn", b.check_out AS "checkOut", b.guests, b.status, l.title AS "listingTitle"
        FROM bookings b JOIN listings l ON l.id = b.listing_id AND l.tenant_id = b.tenant_id
        WHERE ${Prisma.join(conditions, ' AND ')}
      ) SELECT (SELECT count(*)::int FROM matching) AS total,
        COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
          SELECT * FROM matching ORDER BY "checkIn" DESC, id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
        ) p), '[]'::jsonb) AS items`);
      return result!;
    });
  }
}

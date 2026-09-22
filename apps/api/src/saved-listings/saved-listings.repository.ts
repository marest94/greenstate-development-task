import { Inject, Injectable } from '@nestjs/common';
import type { SavedListingsQuery } from '@greenstate/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { TenantDb } from '../db/tenant-db.js';
import { lockLiveTenant } from '../db/tenant-lock.js';
import { lockListing } from '../listings/listing-lock.js';
import type { ListingRecord } from '../listings/listing.mapper.js';
import { AppError } from '../common/http/errors.js';
type SavedRow = { listingId: string; savedAt: string; listing: ListingRecord | null };
@Injectable()
export class SavedListingsRepository {
  constructor(@Inject(TenantDb) private readonly db: TenantDb) {}
  list(tenantId: string, userId: string, query: SavedListingsQuery) {
    return this.db.runForUser(tenantId, userId, async tx => {
      const filter = query.listingIds ? Prisma.sql`AND s.listing_id IN (${Prisma.join(query.listingIds.map(id => Prisma.sql`${id}::uuid`))})` : Prisma.empty;
      // A single snapshot keeps totals and paginated rows consistent. Archived details never
      // leave the database; an unavailable entry contains only its saved ID and timestamp.
      const [result] = await tx.$queryRaw<{ total: number; items: SavedRow[] }[]>(Prisma.sql`
        WITH matching AS MATERIALIZED (
          SELECT s.listing_id AS "listingId", s.saved_at AS "savedAt",
            CASE WHEN l.archived_at IS NULL THEN jsonb_build_object(
              'id', l.id, 'title', l.title, 'city', l.city, 'country', l.country,
              'latitude', l.latitude, 'longitude', l.longitude, 'propertyType', l.property_type,
              'maxGuests', l.max_guests, 'bedrooms', l.bedrooms, 'pricePerNightCents', l.price_per_night_cents,
              'currency', l.currency, 'rating', l.rating, 'reviewCount', l.review_count, 'createdAt', l.created_at
            ) ELSE NULL END AS listing
          FROM saved_listings s JOIN listings l ON l.id = s.listing_id AND l.tenant_id = s.tenant_id
          WHERE s.tenant_id = ${tenantId}::uuid AND s.user_id = ${userId}::uuid ${filter}
        ) SELECT (SELECT count(*)::int FROM matching) AS total,
          COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
            SELECT * FROM matching ORDER BY "savedAt" DESC, "listingId" ASC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
          ) p), '[]'::jsonb) AS items`);
      return result!;
    });
  }
  put(tenantId: string, userId: string, listingId: string) {
    return this.db.runForUser(tenantId, userId, async tx => {
      await lockLiveTenant(tx, tenantId, 'shared');
      const listing = await lockListing(tx, tenantId, listingId);
      if (listing.archivedAt) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.');
      await tx.savedListing.createMany({ data: { tenantId, userId, listingId }, skipDuplicates: true });
    });
  }
  remove(tenantId: string, userId: string, listingId: string) {
    return this.db.runForUser(tenantId, userId, async tx => {
      await lockLiveTenant(tx, tenantId, 'shared');
      await tx.savedListing.deleteMany({ where: { tenantId, userId, listingId } });
    });
  }
}

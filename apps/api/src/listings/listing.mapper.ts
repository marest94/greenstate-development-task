import { ListingDtoSchema, type ListingDto } from '@greenstate/contracts';
import type { Listing } from '../generated/prisma/client.js';
import { fromDbDate } from '../common/time/dates.js';
export type ListingRecord = Omit<ListingDto, 'createdAt' | 'propertyType'> & { createdAt: string | Date; propertyType: string };
export function toListingDto(row: ListingRecord | Listing): ListingDto {
  return ListingDtoSchema.parse({
    id: row.id, title: row.title, city: row.city, country: row.country,
    latitude: row.latitude, longitude: row.longitude, propertyType: row.propertyType,
    maxGuests: row.maxGuests, bedrooms: row.bedrooms, pricePerNightCents: row.pricePerNightCents,
    currency: row.currency, rating: row.rating, reviewCount: row.reviewCount,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : fromDbDate(row.createdAt),
  });
}

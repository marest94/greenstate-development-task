import { z } from 'zod';
import { ListingDtoSchema, ListingViewSchema } from './listing.js';
import { PaginationSchema } from './pagination.js';
const fields = ListingDtoSchema.shape;
export const ListingWriteSchema = z.strictObject({
  title: fields.title, description: z.string().trim().max(5000).nullable(), city: fields.city, country: fields.country,
  latitude: fields.latitude, longitude: fields.longitude, propertyType: fields.propertyType, maxGuests: fields.maxGuests,
  bedrooms: fields.bedrooms, pricePerNightCents: fields.pricePerNightCents,
});
export type ListingWrite = z.infer<typeof ListingWriteSchema>;
export const ListingVersionSchema = z.strictObject({ version: z.number().int().min(1).max(2147483646) });
export const ListingEditSchema = ListingWriteSchema.extend(ListingVersionSchema.shape);
export type ListingEdit = z.infer<typeof ListingEditSchema>;
export const HostListingsQuerySchema = PaginationSchema.extend({ status: z.enum(['active', 'archived', 'all']).default('active') });
export type HostListingsQuery = z.infer<typeof HostListingsQuerySchema>;
export const HostListingViewSchema = ListingViewSchema.safeExtend({ archivedAt: z.iso.datetime().nullable() });
export type HostListingView = z.infer<typeof HostListingViewSchema>;
export const HostListingsPageSchema = z.strictObject({ items: z.array(HostListingViewSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50) });
export type HostListingsPage = z.infer<typeof HostListingsPageSchema>;

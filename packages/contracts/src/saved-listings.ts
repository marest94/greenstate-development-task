import { z } from 'zod';
import { ListingDtoSchema } from './listing.js';
import { PaginationSchema } from './pagination.js';
export const SavedListingsQuerySchema = PaginationSchema.extend({
  listingIds: z.string().transform(value => value.split(',')).pipe(z.array(z.uuid()).min(1).max(50)).optional(),
});
export type SavedListingsQuery = z.infer<typeof SavedListingsQuerySchema>;
export const SavedListingViewSchema = z.strictObject({ listingId: z.uuid(), savedAt: z.iso.datetime(), listing: ListingDtoSchema.nullable() });
export type SavedListingView = z.infer<typeof SavedListingViewSchema>;
export const SavedListingsPageSchema = z.strictObject({ items: z.array(SavedListingViewSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50) });
export type SavedListingsPage = z.infer<typeof SavedListingsPageSchema>;

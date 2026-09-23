import { z } from 'zod';
import { PaginationSchema, queryInteger } from './pagination.js';
import { withinSearchSpan } from './availability.js';
import { IsoDateSchema } from './primitives.js';
import type { ListingDto, BookingDto } from './supplied.js';
export const CitySchema = z.string().trim().min(1).max(80)
  .refine(value => [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127), 'Use a valid city name.');
export const ListingDtoSchema = z.strictObject({
  id: z.uuid(), title: z.string().trim().min(1).max(200), city: CitySchema,
  country: z.string().regex(/^[A-Z]{2}$/), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  propertyType: z.enum(['apartment', 'studio', 'house', 'loft', 'room']), maxGuests: z.number().int().min(1).max(12),
  bedrooms: z.number().int().min(0).max(20), pricePerNightCents: z.number().int().min(0).max(2147483647),
  currency: z.literal('EUR'), rating: z.number().min(0).max(5).nullable(), reviewCount: z.number().int().min(0).max(2147483647),
  createdAt: IsoDateSchema,
}).refine(row => (row.rating === null) === (row.reviewCount === 0), 'Rating and review count must agree.') satisfies z.ZodType<ListingDto>;
export const BookingDtoSchema = z.strictObject({
  id: z.uuid(), listingId: z.uuid(), checkIn: IsoDateSchema, checkOut: IsoDateSchema,
  guests: z.number().int().min(1).max(12), status: z.enum(['confirmed', 'completed', 'cancelled']),
}).refine(row => row.checkIn < row.checkOut, 'Checkout must follow check-in.') satisfies z.ZodType<BookingDto>;

export const ListingViewSchema = ListingDtoSchema.safeExtend({ description: z.string().nullable(), version: z.number().int().positive() });
export type ListingView = z.infer<typeof ListingViewSchema>;
export const ListingSearchSchema = PaginationSchema.extend({
  city: CitySchema.optional(),
  guests: queryInteger(1, 12).optional(), minPriceCents: queryInteger(0, 2147483647).optional(), maxPriceCents: queryInteger(0, 2147483647).optional(),
  from: IsoDateSchema.optional(), to: IsoDateSchema.optional(),
}).refine(value => (value.from === undefined) === (value.to === undefined), { path: ['to'], message: 'Provide both check-in and checkout.' })
  .refine(value => !value.from || !value.to || withinSearchSpan(value.from, value.to), { path: ['to'], message: 'Choose a checkout after check-in, up to 366 nights later.' })
  .refine(value => value.minPriceCents === undefined || value.maxPriceCents === undefined || value.minPriceCents <= value.maxPriceCents, { path: ['maxPriceCents'], message: 'Maximum price must be at least the minimum price.' });
export type ListingSearch = z.infer<typeof ListingSearchSchema>;
export const ListingPageSchema = z.strictObject({ items: z.array(ListingDtoSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50), today: IsoDateSchema });
export type ListingPage = z.infer<typeof ListingPageSchema>;
export const ListingFacetsSchema = z.strictObject({ cities: z.array(z.string()) });
export type ListingFacets = z.infer<typeof ListingFacetsSchema>;

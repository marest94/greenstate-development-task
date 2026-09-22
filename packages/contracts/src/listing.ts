import { z } from 'zod';
import { IsoDateSchema } from './primitives.js';
import type { ListingDto, BookingDto } from './supplied.js';
export const ListingDtoSchema = z.strictObject({
  id: z.uuid(), title: z.string().trim().min(1).max(200), city: z.string().trim().min(1).max(80),
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

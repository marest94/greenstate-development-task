import { z } from 'zod';
import { BookingDtoSchema } from './listing.js';
import { PaginationSchema } from './pagination.js';
import { IsoDateSchema } from './primitives.js';
import { withinSearchSpan } from './availability.js';
export const BookingsQuerySchema = PaginationSchema.extend({
  listingId: z.uuid().optional(), status: z.enum(['confirmed', 'completed', 'cancelled']).optional(), from: IsoDateSchema.optional(), to: IsoDateSchema.optional(),
}).refine(value => (value.from === undefined) === (value.to === undefined), { path: ['to'], message: 'Provide both date boundaries.' })
  .refine(value => !value.from || !value.to || withinSearchSpan(value.from, value.to), { path: ['to'], message: 'Choose an end date after the start, up to 366 days later.' });
export type BookingsQuery = z.infer<typeof BookingsQuerySchema>;
export const BookingViewSchema = BookingDtoSchema.safeExtend({ listingTitle: z.string() });
export type BookingView = z.infer<typeof BookingViewSchema>;
export const BookingsPageSchema = z.strictObject({ items: z.array(BookingViewSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50), today: IsoDateSchema });
export type BookingsPage = z.infer<typeof BookingsPageSchema>;

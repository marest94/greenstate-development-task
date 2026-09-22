import { z } from 'zod';
import { IsoDateSchema } from './primitives.js';
import { PaginationSchema } from './pagination.js';
import { HostListingViewSchema } from './host-listings.js';
import { HostCalendarSchema } from './host-calendar.js';
export const PortfolioCalendarQuerySchema = PaginationSchema.extend({
  from: IsoDateSchema, to: IsoDateSchema, search: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().min(1).max(80).optional(), status: z.enum(['active', 'archived', 'all']).default('active'),
}).refine(({ from, to }) => from < to && Date.parse(to) - Date.parse(from) <= 31 * 86400000, { path: ['to'], message: 'Choose a range of 1 to 31 nights.' });
export type PortfolioCalendarQuery = z.infer<typeof PortfolioCalendarQuerySchema>;
export const PortfolioCalendarPageSchema = z.strictObject({
  today: IsoDateSchema, from: IsoDateSchema, to: IsoDateSchema, page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50), total: z.number().int().nonnegative(),
  items: z.array(z.strictObject({ listing: HostListingViewSchema, days: HostCalendarSchema.shape.days, bookings: HostCalendarSchema.shape.bookings })).max(50),
});
export type PortfolioCalendarPage = z.infer<typeof PortfolioCalendarPageSchema>;

import { z } from 'zod';
import { IsoDateSchema } from './primitives.js';
import { BookingDtoSchema } from './listing.js';
export const BlockWriteSchema = z.strictObject({ date: IsoDateSchema, reason: z.string().trim().min(1).max(500).optional() });
export type BlockWrite = z.infer<typeof BlockWriteSchema>;
export const BlockViewSchema = z.strictObject({ id: z.uuid(), listingId: z.uuid(), date: IsoDateSchema, reason: z.string().nullable() });
export type BlockView = z.infer<typeof BlockViewSchema>;
export const HostCalendarDaySchema = z.strictObject({
  date: IsoDateSchema, status: z.enum(['available', 'booked', 'blocked']), bookingIds: z.array(z.uuid()),
  block: z.strictObject({ id: z.uuid(), reason: z.string().nullable() }).nullable(),
});
export const HostCalendarSchema = z.strictObject({ today: IsoDateSchema, days: z.array(HostCalendarDaySchema).max(366), bookings: z.array(BookingDtoSchema) });
export type HostCalendar = z.infer<typeof HostCalendarSchema>;

export const RangeResultSchema = z.strictObject({ changed: z.number().int().nonnegative() });
export const BlockRangeSchema = z.strictObject({ from: IsoDateSchema, to: IsoDateSchema, action: z.enum(['block', 'unblock']), reason: BlockWriteSchema.shape.reason })
  .refine(({ from, to }) => from < to && Date.parse(to) - Date.parse(from) <= 31 * 86400000, { path: ['to'], message: 'Choose a range of 1 to 31 nights.' });
export type BlockRange = z.infer<typeof BlockRangeSchema>;

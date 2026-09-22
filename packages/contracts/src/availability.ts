import { z } from 'zod';
import { IsoDateSchema } from './primitives.js';
export const withinSearchSpan = (from: string, to: string) => from < to && Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) <= 366 * 86_400_000;
export const AvailabilityQuerySchema = z.strictObject({ from: IsoDateSchema, to: IsoDateSchema })
  .refine(({ from, to }) => withinSearchSpan(from, to), { path: ['to'], message: 'Choose a checkout after check-in, up to 366 nights later.' });
export const AvailabilitySchema = z.strictObject({ today: IsoDateSchema, days: z.array(z.strictObject({ date: IsoDateSchema, available: z.boolean() })).max(366) });
export type Availability = z.infer<typeof AvailabilitySchema>;
export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

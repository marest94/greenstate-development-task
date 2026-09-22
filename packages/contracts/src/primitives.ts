import { z } from 'zod';
export const IsoDateSchema = z.iso.date().refine(value => !value.startsWith('0000-'), 'Use a year from 0001 onwards.');
export const DateRangeSchema = z.object({ from: IsoDateSchema, to: IsoDateSchema })
  .refine(range => range.from < range.to, 'The checkout date must follow the check-in date.');
export type DateRange = z.infer<typeof DateRangeSchema>;

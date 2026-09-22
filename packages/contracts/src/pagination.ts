import { z } from 'zod';
// Accept decimal query strings without coercing empty strings, arrays, hex or booleans.
export const queryInteger = (min: number, max: number) => z.union([
  z.number(), z.string().regex(/^\d+$/).transform(Number),
]).pipe(z.number().int().min(min).max(max));
export const PaginationSchema = z.strictObject({ page: queryInteger(1, 1_000_000).default(1), pageSize: queryInteger(1, 50).default(20) });
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

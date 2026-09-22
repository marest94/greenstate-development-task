import { z } from 'zod';

export const HealthResponseSchema = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export const ApiErrorSchema = z.object({
  status: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  fields: z.record(z.string(), z.array(z.string())).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export * from './tenant.js';
export * from './primitives.js';
export * from './supplied.js';
export * from './listing.js';
export * from './pagination.js';
export * from './availability.js';
export * from './permissions.js';
export * from './auth.js';
export * from './saved-listings.js';
export * from './host-listings.js';

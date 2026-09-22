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

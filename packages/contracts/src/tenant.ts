import { z } from 'zod';
export const SlugSchema = z.string().min(1).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const TenantSchema = z.object({
  id: z.uuid(), slug: SlugSchema, name: z.string(), timezone: z.string(),
  primaryColor: z.string().nullable(), contactEmail: z.string().nullable(), currency: z.literal('EUR'),
});
export type TenantContext = z.infer<typeof TenantSchema>;

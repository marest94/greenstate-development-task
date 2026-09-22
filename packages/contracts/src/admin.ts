import { z } from 'zod';
import { EmailSchema, PasswordSchema } from './auth.js';
import { PaginationSchema } from './pagination.js';
import { SlugSchema, TenantSchema } from './tenant.js';
export const ReservedSlugs = ['admin', 'api', 'assets', 'login', 'register', 'account', 'password', 'saved', 'host', 'listings'] as const;
export const TimezoneSchema = z.string().min(1).max(100).refine(value => {
  if (/^[+-]/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; } catch { return false; }
}, 'Choose a valid named time zone, such as Europe/Berlin or UTC.');
export const TenantConfigSchema = z.strictObject({
  name: z.string().trim().min(1).max(120), timezone: TimezoneSchema,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour.').nullable().default(null),
  contactEmail: EmailSchema.nullable().default(null),
});
export type TenantConfig = z.infer<typeof TenantConfigSchema>;
export const TenantUpdateSchema = z.strictObject({
  name: TenantConfigSchema.shape.name.optional(), timezone: TimezoneSchema.optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour.').nullable().optional(),
  contactEmail: EmailSchema.nullable().optional(),
}).refine(value => Object.keys(value).length > 0, 'Provide at least one configuration field.');
export type TenantUpdate = z.infer<typeof TenantUpdateSchema>;
export const TenantCreateSchema = TenantConfigSchema.extend({ slug: SlugSchema.refine(value => !(ReservedSlugs as readonly string[]).includes(value), 'This slug is reserved.') });
export type TenantCreate = z.infer<typeof TenantCreateSchema>;
export const AdminTenantSchema = z.strictObject({ ...TenantSchema.shape, createdAt: z.iso.datetime(), deletedAt: z.iso.datetime().nullable() });
export type AdminTenant = z.infer<typeof AdminTenantSchema>;
export const AdminTenantsQuerySchema = PaginationSchema.extend({ search: z.string().trim().min(1).max(120).optional(), status: z.enum(['active', 'deleted', 'all']).default('active') });
export type AdminTenantsQuery = z.infer<typeof AdminTenantsQuerySchema>;
export const TenantCountsSchema = z.strictObject({ activeListings: z.number().int().nonnegative(), archivedListings: z.number().int().nonnegative(), accounts: z.number().int().nonnegative(), enabledHosts: z.number().int().nonnegative() });
export type TenantCounts = z.infer<typeof TenantCountsSchema>;
export const AdminTenantSummarySchema = AdminTenantSchema.extend({ counts: TenantCountsSchema });
export type AdminTenantSummary = z.infer<typeof AdminTenantSummarySchema>;
export const AdminTenantsPageSchema = z.strictObject({ items: z.array(AdminTenantSummarySchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50) });
export type AdminTenantsPage = z.infer<typeof AdminTenantsPageSchema>;
export const TenantAccountSchema = z.strictObject({
  id: z.uuid(), tenantId: z.uuid(), name: z.string().nullable(), email: EmailSchema, role: z.enum(['client', 'host']),
  disabledAt: z.iso.datetime().nullable(), mustChangePassword: z.boolean(), createdAt: z.iso.datetime(),
});
export type TenantAccount = z.infer<typeof TenantAccountSchema>;
export const AccountsQuerySchema = PaginationSchema.extend({ email: z.string().trim().min(1).max(254).optional(), role: z.enum(['client', 'host']).optional(), status: z.enum(['enabled', 'disabled', 'all']).default('all') });
export type AccountsQuery = z.infer<typeof AccountsQuerySchema>;
export const AccountsPageSchema = z.strictObject({ items: z.array(TenantAccountSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50) });
export type AccountsPage = z.infer<typeof AccountsPageSchema>;
export const HostCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(120), email: EmailSchema, temporaryPassword: PasswordSchema });
export type HostCreate = z.infer<typeof HostCreateSchema>;
export const AccountResetSchema = z.strictObject({ temporaryPassword: PasswordSchema });
export type AccountReset = z.infer<typeof AccountResetSchema>;

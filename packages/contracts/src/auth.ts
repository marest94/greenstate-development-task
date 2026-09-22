import { z } from 'zod';
import { PermissionSchema } from './permissions.js';
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const PasswordSchema = z.string().max(256).refine(value => [...value].length >= 15 && [...value].length <= 128, 'Use a password of 15 to 128 characters.');
export const LoginSchema = z.strictObject({ email: EmailSchema, password: z.string().min(1).max(256) });
export const RegisterSchema = z.strictObject({ email: EmailSchema, password: PasswordSchema });
export const PasswordChangeSchema = z.strictObject({ currentPassword: z.string().min(1).max(256), newPassword: PasswordSchema })
  .refine(value => value.currentPassword !== value.newPassword, { path: ['newPassword'], message: 'Choose a different password.' });
const PrincipalFields = { id: z.uuid(), email: EmailSchema, mustChangePassword: z.boolean(), permissions: z.array(PermissionSchema) };
export const TenantPrincipalSchema = z.strictObject({ ...PrincipalFields, realm: z.literal('tenant'), tenantId: z.uuid(), role: z.enum(['client', 'host']) });
export const PlatformPrincipalSchema = z.strictObject({ ...PrincipalFields, realm: z.literal('platform'), tenantId: z.null(), role: z.literal('superadmin') });
export const PrincipalSchema = z.discriminatedUnion('realm', [TenantPrincipalSchema, PlatformPrincipalSchema]);
export type Principal = z.infer<typeof PrincipalSchema>;
export type TenantPrincipal = z.infer<typeof TenantPrincipalSchema>;
export type PlatformPrincipal = z.infer<typeof PlatformPrincipalSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type PasswordChangeInput = z.infer<typeof PasswordChangeSchema>;

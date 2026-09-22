import { z } from 'zod';
export const PermissionSchema = z.enum(['saved-listings:manage', 'listings:manage', 'calendar:manage', 'bookings:read', 'tenants:manage', 'accounts:manage']);
export type Permission = z.infer<typeof PermissionSchema>;
export type Role = 'client' | 'host' | 'superadmin';
const rolePermissions: Record<Role, readonly Permission[]> = {
  client: ['saved-listings:manage'],
  host: ['saved-listings:manage', 'listings:manage', 'calendar:manage', 'bookings:read'],
  superadmin: ['tenants:manage', 'accounts:manage'],
};
export function permissionsFor(role: Role): Permission[] { return [...rolePermissions[role]]; }

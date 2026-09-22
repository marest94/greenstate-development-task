import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../common/http/errors.js';

// Namespace 7101 is reserved for tenant lifecycle coordination. Hash collisions only serialize
// unrelated tenants; ownership remains enforced independently by RLS and composite foreign keys.
export async function lockLiveTenant(tx: Prisma.TransactionClient, tenantId: string, mode: 'shared' | 'exclusive') {
  // executeRaw discards PostgreSQL void results; queryRaw cannot deserialize them.
  if (mode === 'shared') await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(7101, hashtext(${tenantId}))`;
  else await tx.$executeRaw`SELECT pg_advisory_xact_lock(7101, hashtext(${tenantId}))`;
  // A separate statement is essential: READ COMMITTED takes a fresh snapshot after waiting.
  const tenant = await tx.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
  if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'This rental portal was not found.');
  return tenant;
}

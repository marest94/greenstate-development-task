import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Passwords } from '../identity/passwords.js';
import { AppError } from '../common/http/errors.js';
import { lockLiveTenant } from '../db/tenant-lock.js';
import { DEMO_TENANTS } from './seed.js';
import type { AdminDb } from '../db/admin-db.js';
export const DEMO_ACCOUNTS = [
  { role: 'host', email: 'host@example.test', password: 'GreenState demo host 2026!' },
  { role: 'client', email: 'client@example.test', password: 'GreenState demo client 2026!' },
  { role: 'superadmin', email: 'admin@example.test', password: 'GreenState demo admin 2026!' },
] as const;
const Counts = z.object({ tenantUsers: z.number().int().nonnegative(), platformUsers: z.number().int().nonnegative() });
const checksum = createHash('sha256').update(JSON.stringify({ accounts: DEMO_ACCOUNTS, tenants: DEMO_TENANTS.map(tenant => tenant.id), mustChangePassword: true })).digest('hex');
export async function runAccountSeed(options: { db: AdminDb; enabled: boolean }) {
  if (!options.enabled) throw new Error('Explicit demo-account opt-in is required.');
  // Password hashes have independent salts and are prepared outside the database transaction.
  const passwords = new Passwords();
  const prepared = await Promise.all(DEMO_TENANTS.flatMap(tenant => DEMO_ACCOUNTS.filter(account => account.role !== 'superadmin').map(async account => ({ tenantId: tenant.id, email: account.email, role: account.role, passwordHash: await passwords.hash(account.password), mustChangePassword: true }))));
  const platform = DEMO_ACCOUNTS.find(account => account.role === 'superadmin')!;
  const platformHash = await passwords.hash(platform.password);
  return options.db.transaction(async tx => {
    // Account initialization has its own marker and advisory key, independent of inventory.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7102, 2)`;
    const previous = await tx.seedRun.findUnique({ where: { key: 'accounts' } });
    if (previous) {
      if (previous.version !== 1 || previous.checksum !== checksum) throw new Error('Demo-account definitions differ from the completed initialization.');
      return Counts.parse(previous.counts);
    }
    if (!await tx.seedRun.findUnique({ where: { key: 'inventory' } })) throw new Error('Complete inventory initialization before demo accounts.');
    let tenantUsers = 0;
    for (const tenant of DEMO_TENANTS) {
      try { await lockLiveTenant(tx, tenant.id, 'shared'); }
      catch (error) { if (error instanceof AppError && error.code === 'TENANT_NOT_FOUND') continue; throw error; }
      tenantUsers += (await tx.tenantUser.createMany({ data: prepared.filter(account => account.tenantId === tenant.id) })).count;
    }
    await tx.platformUser.create({ data: { email: platform.email, passwordHash: platformHash, mustChangePassword: true } });
    const counts = { tenantUsers, platformUsers: 1 };
    await tx.seedRun.create({ data: { key: 'accounts', version: 1, checksum, counts } });
    return counts;
  });
}

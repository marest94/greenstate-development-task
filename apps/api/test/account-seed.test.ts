import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { AdminDb } from '../src/db/admin-db.js';
import { runSeed, DEMO_TENANTS } from '../src/seed/seed.js';
import { runAccountSeed, DEMO_ACCOUNTS } from '../src/seed/accounts.js';
import { AuthService } from '../src/identity/auth.service.js';
import { createApp } from '../src/bootstrap.js';
let db: TestDatabase; let admin: AdminDb;
beforeEach(async () => { db = await createTestDatabase(); admin = new AdminDb(db.urls.admin); });
afterEach(async () => { await admin?.close(); await db?.close(); });
describe('Separate versioned demo-account bootstrap', () => {
  it('upgrades inventory-only databases and serializes concurrent account initialization', async () => {
    await runSeed({ db: admin, enabled: true }); expect(await db.admin.tenantUser.count()).toBe(0);
    expect(await Promise.all([runAccountSeed({ db: admin, enabled: true }), runAccountSeed({ db: admin, enabled: true })])).toEqual([{ tenantUsers: 4, platformUsers: 1 }, { tenantUsers: 4, platformUsers: 1 }]);
    expect(await db.admin.tenantUser.count()).toBe(4); expect(await db.admin.platformUser.count()).toBe(1); expect(await db.admin.seedRun.count()).toBe(2);
    const users = await db.admin.tenantUser.findMany(); expect(users.every(user => user.mustChangePassword)).toBe(true); expect(new Set(users.map(user => user.passwordHash)).size).toBe(4);
  });
  it('does not overwrite changed passwords, archive edits or deleted tenants on rerun', async () => {
    await runSeed({ db: admin, enabled: true }); await runAccountSeed({ db: admin, enabled: true });
    const app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, log: () => {} }); await app.init();
    try {
      const demo = DEMO_ACCOUNTS.find(user => user.role === 'host')!; const auth = app.get(AuthService); const tenantId = DEMO_TENANTS[0].id;
      const login = await auth.login(tenantId, demo); await auth.password(tenantId, login.token, { currentPassword: demo.password, newPassword: 'A privately changed demo account password' });
      const listing = await db.admin.listing.findFirstOrThrow({ where: { tenantId } }); await db.tenantDb.write(tenantId, tx => tx.listing.update({ where: { id: listing.id }, data: { title: 'Preserve the edit', archivedAt: new Date() } }));
      await admin.forTenant(DEMO_TENANTS[1].id, 'exclusive', tx => tx.tenant.update({ where: { id: DEMO_TENANTS[1].id }, data: { deletedAt: new Date() } }));
      await runSeed({ db: admin, enabled: true }); await runAccountSeed({ db: admin, enabled: true });
      await expect(auth.login(tenantId, demo)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect((await auth.login(tenantId, { email: demo.email, password: 'A privately changed demo account password' })).principal.mustChangePassword).toBe(false);
      expect(await db.admin.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ title: 'Preserve the edit', archivedAt: expect.any(Date) });
      expect((await db.admin.tenant.findUniqueOrThrow({ where: { id: DEMO_TENANTS[1].id } })).deletedAt).not.toBeNull();
    } finally { await app.close(); }
  });
  it('leaves an already-deleted tenant untouched during an inventory-only upgrade', async () => {
    await runSeed({ db: admin, enabled: true }); await admin.forTenant(DEMO_TENANTS[1].id, 'exclusive', tx => tx.tenant.update({ where: { id: DEMO_TENANTS[1].id }, data: { deletedAt: new Date() } }));
    expect(await runAccountSeed({ db: admin, enabled: true })).toEqual({ tenantUsers: 2, platformUsers: 1 });
    expect(await db.admin.tenantUser.count({ where: { tenantId: DEMO_TENANTS[1].id } })).toBe(0);
  });
  it('rolls back new accounts and its marker when an existing account conflicts', async () => {
    await runSeed({ db: admin, enabled: true });
    const existing = await db.admin.platformUser.create({ data: { email: 'admin@example.test', passwordHash: 'x'.repeat(60) } });
    await expect(runAccountSeed({ db: admin, enabled: true })).rejects.toThrow();
    expect(await db.admin.tenantUser.count()).toBe(0); expect(await db.admin.platformUser.count()).toBe(1);
    expect((await db.admin.platformUser.findUniqueOrThrow({ where: { id: existing.id } })).passwordHash).toBe('x'.repeat(60));
    expect(await db.admin.seedRun.findUnique({ where: { key: 'accounts' } })).toBeNull();
  });
  it('requires deliberate opt-in and completed inventory initialization', async () => {
    await expect(runAccountSeed({ db: admin, enabled: false })).rejects.toThrow(/demo/);
    await expect(runAccountSeed({ db: admin, enabled: true })).rejects.toThrow(/inventory/);
    expect(await db.admin.tenantUser.count()).toBe(0); expect(await db.admin.platformUser.count()).toBe(0); expect(await db.admin.seedRun.count()).toBe(0);
  });
});

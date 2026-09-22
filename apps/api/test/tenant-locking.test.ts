import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
import { AdminDb } from '../src/db/admin-db.js';
import { lockLiveTenant } from '../src/db/tenant-lock.js';
let db: TestDatabase;
let adminDb: AdminDb;
let fixture: Awaited<ReturnType<typeof inventoryFixture>>;
beforeAll(async () => {
  db = await createTestDatabase();
  await db.server.query(`ALTER DATABASE "${db.name}" SET default_transaction_isolation = 'repeatable read'`);
  adminDb = new AdminDb(db.urls.admin);
});
beforeEach(async () => { fixture = await inventoryFixture(db.admin); });
afterAll(async () => { await adminDb?.close(); await db?.close(); });
async function waitForAdvisoryWait(pid: number) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const result = await db.server.query('SELECT 1 FROM pg_locks WHERE pid = $1 AND locktype = $2 AND NOT granted', [pid, 'advisory']);
    if (result.rowCount) return;
    await delay(10);
  }
  throw new Error('Expected a transaction waiting on the tenant advisory lock');
}
async function waitingWrite() {
  const pid = Promise.withResolvers<number>();
  const result = db.tenantDb.run(fixture.a.id, async tx => {
    const rows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    pid.resolve(rows[0]!.pid);
    const tenant = await lockLiveTenant(tx, fixture.a.id, 'shared');
    return { tenant, isolation: await tx.$queryRaw`SHOW transaction_isolation` };
  });
  // Attach immediately so assertion errors cannot leave a rejected transaction unobserved.
  const outcome = result.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
  return { pid: await pid.promise, outcome };
}
describe('Tenant lifecycle transaction coordination', () => {
  it('allows unrelated writes to share a tenant lock', async () => {
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const first = db.tenantDb.run(fixture.a.id, async tx => {
      await lockLiveTenant(tx, fixture.a.id, 'shared'); acquired.resolve(); await release.promise;
    });
    await acquired.promise;
    try {
      await db.tenantDb.run(fixture.a.id, async tx => {
        const tenant = await lockLiveTenant(tx, fixture.a.id, 'shared'); expect(tenant.id).toBe(fixture.a.id);
      });
    } finally { release.resolve(); await first; }
  });
  it('rejects a waiting write after deletion commits, despite a Repeatable Read database default', async () => {
    const acquired = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
    const deletion = adminDb.forTenant(fixture.a.id, 'exclusive', async tx => {
      expect(await tx.$queryRaw`SHOW transaction_isolation`).toEqual([{ transaction_isolation: 'read committed' }]);
      await tx.tenant.update({ where: { id: fixture.a.id }, data: { deletedAt: new Date() } });
      acquired.resolve(); await release.promise;
    });
    const observedDeletion = deletion.catch(error => { acquired.reject(error); throw error; });
    try {
      await acquired.promise;
      const waiting = await waitingWrite();
      await waitForAdvisoryWait(waiting.pid);
      release.resolve(); await observedDeletion;
      expect((await waiting.outcome).error).toMatchObject({ code: 'TENANT_NOT_FOUND' });
    } finally { release.resolve(); await observedDeletion.catch(() => {}); }
  });
  it('uses current configuration after a waiting write acquires its lock', async () => {
    const acquired = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
    const update = adminDb.forTenant(fixture.a.id, 'exclusive', async tx => {
      await tx.tenant.update({ where: { id: fixture.a.id }, data: { timezone: 'America/New_York' } });
      acquired.resolve(); await release.promise;
    });
    await acquired.promise;
    try {
      const waiting = await waitingWrite(); await waitForAdvisoryWait(waiting.pid);
      release.resolve(); await update;
      const outcome = await waiting.outcome;
      expect(outcome.error).toBeUndefined();
      expect(outcome.value?.tenant.timezone).toBe('America/New_York');
      expect(outcome.value?.isolation).toEqual([{ transaction_isolation: 'read committed' }]);
    } finally { release.resolve(); await update; }
  });
  it('releases an exclusive lock on rollback and does not retain its deletion', async () => {
    const acquired = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
    const rollback = adminDb.forTenant(fixture.a.id, 'exclusive', async tx => {
      await tx.tenant.update({ where: { id: fixture.a.id }, data: { deletedAt: new Date() } });
      acquired.resolve(); await release.promise; throw new Error('Deliberate rollback');
    }).catch(error => error);
    await acquired.promise;
    try {
      const waiting = await waitingWrite(); await waitForAdvisoryWait(waiting.pid);
      release.resolve(); expect(await rollback).toMatchObject({ message: 'Deliberate rollback' });
      expect((await waiting.outcome).value?.tenant.deletedAt).toBeNull();
    } finally { release.resolve(); await rollback; }
  });
});

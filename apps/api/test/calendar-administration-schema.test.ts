import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
let db: TestDatabase; let f: Awaited<ReturnType<typeof inventoryFixture>>;
beforeAll(async () => { db = await createTestDatabase(); f = await inventoryFixture(db.admin); });
afterAll(async () => { await db?.close(); });
it('gives blocked days stable IDs/reasons without weakening date uniqueness or tenant scope', async () => {
  const rows = await db.tenantDb.run(f.a.id, tx => tx.$queryRaw<{ id: string; reason: string }[]>`INSERT INTO blocked_days (tenant_id, listing_id, date, reason) VALUES (${f.a.id}::uuid, ${f.listingA.id}::uuid, '2026-10-01', 'Maintenance') RETURNING id, reason`);
  expect(rows).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), reason: 'Maintenance' }]);
  await expect(db.tenantDb.run(f.a.id, tx => tx.$executeRaw`INSERT INTO blocked_days (tenant_id, listing_id, date) VALUES (${f.a.id}::uuid, ${f.listingA.id}::uuid, '2026-10-01')`)).rejects.toThrow(/duplicate key/);
  expect(await db.tenantDb.run(f.b.id, tx => tx.$executeRaw`DELETE FROM blocked_days WHERE id = ${rows[0]!.id}::uuid`)).toBe(0);
});
it('bounds optional block reasons in storage', async () => {
  await expect(db.tenantDb.run(f.a.id, tx => tx.$executeRaw`INSERT INTO blocked_days (tenant_id, listing_id, date, reason) VALUES (${f.a.id}::uuid, ${f.listingA.id}::uuid, '2026-10-02', ${'x'.repeat(501)})`)).rejects.toThrow(/check constraint/);
});
it('allows administrator-provisioned display names but forbids ordinary registration from setting that column', async () => {
  const rows = await db.admin.$queryRaw<{ name: string }[]>`INSERT INTO tenant_users (tenant_id, email, password_hash, role, name) VALUES (${f.a.id}::uuid, 'named-host@example.test', ${'x'.repeat(60)}, 'host', 'Named host') RETURNING name`;
  expect(rows).toEqual([{ name: 'Named host' }]);
  await expect(db.tenantDb.run(f.a.id, tx => tx.$executeRaw`INSERT INTO tenant_users (tenant_id, email, password_hash, name) VALUES (${f.a.id}::uuid, 'injected-name@example.test', ${'x'.repeat(60)}, 'Injected name')`)).rejects.toThrow(/permission denied/);
});

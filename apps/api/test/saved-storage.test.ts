import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
let db: TestDatabase;
let f: Awaited<ReturnType<typeof inventoryFixture>>;
let a: string; let other: string; let foreign: string;
beforeAll(async () => {
  db = await createTestDatabase(1); f = await inventoryFixture(db.admin);
  const account = (tenantId: string, email: string) => db.admin.tenantUser.create({ data: { tenantId, email, passwordHash: 'x'.repeat(60) } });
  a = (await account(f.a.id, 'a@example.test')).id; other = (await account(f.a.id, 'other@example.test')).id; foreign = (await account(f.b.id, 'foreign@example.test')).id;
});
afterAll(async () => { await db?.close(); });
describe('Saved listing storage under real restricted roles', () => {
  it('requires both tenant and owner context, with no pooled context leakage', async () => {
    await db.tenantDb.runForUser(f.a.id, a, tx => tx.$executeRaw`INSERT INTO saved_listings (tenant_id, user_id, listing_id) VALUES (${f.a.id}::uuid, ${a}::uuid, ${f.listingA.id}::uuid)`);
    expect(await db.tenantDb.runForUser(f.a.id, a, tx => tx.$queryRaw`SELECT user_id FROM saved_listings`)).toEqual([{ user_id: a }]);
    expect(await db.tenantDb.runForUser(f.a.id, other, tx => tx.$queryRaw`SELECT * FROM saved_listings`)).toEqual([]);
    expect(await db.tenantDb.runForUser(f.b.id, a, tx => tx.$queryRaw`SELECT * FROM saved_listings`)).toEqual([]);
    expect(await db.tenantDb.run(f.a.id, tx => tx.$queryRaw`SELECT * FROM saved_listings`)).toEqual([]);
    expect(await db.tenantDb.client.$queryRaw`SELECT * FROM saved_listings`).toEqual([]);
    expect(await db.tenantDb.runForUser(f.a.id, other, tx => tx.$executeRaw`DELETE FROM saved_listings WHERE user_id = ${a}::uuid`)).toBe(0);
  });
  it('enforces owner and tenant on writes and composite foreign keys even under the privileged role', async () => {
    await expect(db.tenantDb.runForUser(f.a.id, other, tx => tx.$executeRaw`INSERT INTO saved_listings (tenant_id, user_id, listing_id) VALUES (${f.a.id}::uuid, ${a}::uuid, ${f.listingA.id}::uuid)`)).rejects.toThrow(/row-level security/);
    await expect(db.tenantDb.run(f.a.id, tx => tx.$executeRaw`INSERT INTO saved_listings (tenant_id, user_id, listing_id) VALUES (${f.a.id}::uuid, ${other}::uuid, ${f.listingA.id}::uuid)`)).rejects.toThrow(/row-level security/);
    await expect(db.admin.$executeRaw`INSERT INTO saved_listings (tenant_id, user_id, listing_id) VALUES (${f.a.id}::uuid, ${foreign}::uuid, ${f.listingA.id}::uuid)`).rejects.toThrow(/foreign key/);
    await expect(db.admin.$executeRaw`INSERT INTO saved_listings (tenant_id, user_id, listing_id) VALUES (${f.a.id}::uuid, ${other}::uuid, ${f.listingB.id}::uuid)`).rejects.toThrow(/foreign key/);
  });
  it('rejects ownership/timestamp updates and duplicate records', async () => {
    await db.admin.$executeRaw`INSERT INTO saved_listings (tenant_id, user_id, listing_id) VALUES (${f.a.id}::uuid, ${other}::uuid, ${f.listingA.id}::uuid)`;
    await expect(db.tenantDb.runForUser(f.a.id, other, tx => tx.$executeRaw`UPDATE saved_listings SET user_id = ${a}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(db.tenantDb.runForUser(f.a.id, other, tx => tx.$executeRaw`UPDATE saved_listings SET saved_at = NOW()`)).rejects.toThrow(/permission denied/);
    await expect(db.admin.$executeRaw`INSERT INTO saved_listings (tenant_id, user_id, listing_id) VALUES (${f.a.id}::uuid, ${other}::uuid, ${f.listingA.id}::uuid)`).rejects.toThrow(/duplicate key/);
  });
});

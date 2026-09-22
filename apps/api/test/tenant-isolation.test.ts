import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture, listingData } from './fixtures.js';
let db: TestDatabase;
let fixture: Awaited<ReturnType<typeof inventoryFixture>>;
beforeAll(async () => { db = await createTestDatabase(1); });
beforeEach(async () => { fixture = await inventoryFixture(db.admin); });
afterAll(async () => { await db?.close(); });
describe('Restricted PostgreSQL tenant isolation', () => {
  it('limits reads to the selected tenant and clears context on pool reuse', async () => {
    const a = await db.tenantDb.run(fixture.a.id, tx => tx.listing.findMany());
    expect(a.map(x => x.id)).toEqual([fixture.listingA.id]);
    expect(await db.tenantDb.client.listing.findMany()).toEqual([]);
    const b = await db.tenantDb.run(fixture.b.id, tx => tx.listing.findMany());
    expect(b.map(x => x.id)).toEqual([fixture.listingB.id]);
    expect(await db.tenantDb.client.listing.findMany()).toEqual([]);
  });
  it('also scopes bookings and blocked days, including reads after a rolled-back transaction', async () => {
    await db.admin.booking.create({ data: { id: randomUUID(), tenantId: fixture.a.id, listingId: fixture.listingA.id, checkIn: new Date('2026-10-01'), checkOut: new Date('2026-10-02'), guests: 1, status: 'confirmed' } });
    await db.tenantDb.run(fixture.a.id, tx => tx.blockedDay.create({ data: { tenantId: fixture.a.id, listingId: fixture.listingA.id, date: new Date('2026-10-03') } }));
    expect(await db.tenantDb.run(fixture.a.id, tx => tx.booking.count())).toBe(1);
    expect(await db.tenantDb.run(fixture.b.id, tx => tx.booking.count())).toBe(0);
    expect(await db.tenantDb.run(fixture.b.id, tx => tx.blockedDay.count())).toBe(0);
    await expect(db.tenantDb.run(fixture.a.id, async () => { throw new Error('Rollback'); })).rejects.toThrow('Rollback');
    expect(await db.tenantDb.client.booking.count()).toBe(0);
    expect(await db.tenantDb.client.blockedDay.count()).toBe(0);
  });
  it('rejects writes outside the current tenant', async () => {
    await expect(db.tenantDb.run(fixture.a.id, tx => tx.listing.create({ data: listingData(fixture.b.id) }))).rejects.toThrow();
    await expect(db.tenantDb.client.listing.create({ data: listingData(fixture.a.id) })).rejects.toThrow();
    const changed = await db.tenantDb.run(fixture.a.id, tx => tx.listing.updateMany({ where: { id: fixture.listingB.id }, data: { title: 'Intrusion' } }));
    expect(changed.count).toBe(0);
  });
  it('permits ordinary inventory fields but denies ownership changes and hard deletion', async () => {
    const changed = await db.tenantDb.run(fixture.a.id, tx => tx.listing.update({ where: { id: fixture.listingA.id }, data: { title: 'Updated safely' } }));
    expect(changed.title).toBe('Updated safely');
    await expect(db.tenantDb.run(fixture.a.id, tx => tx.listing.update({ where: { id: fixture.listingA.id }, data: { tenantId: fixture.b.id } }))).rejects.toThrow();
    await expect(db.tenantDb.run(fixture.a.id, tx => tx.listing.delete({ where: { id: fixture.listingA.id } }))).rejects.toThrow();
    await expect(db.tenantDb.client.$executeRaw`ALTER TABLE listings ADD COLUMN compromised boolean`).rejects.toThrow();
  });
  it('keeps the tenant registry read-only and slugs immutable to runtime roles', async () => {
    await expect(db.tenantDb.client.tenant.update({ where: { id: fixture.a.id }, data: { name: 'Intrusion' } })).rejects.toThrow();
    await expect(db.admin.tenant.update({ where: { id: fixture.a.id }, data: { slug: 'changed' } })).rejects.toThrow();
  });
  it('rejects a booking or blocked day that points into another tenant', async () => {
    await expect(db.admin.booking.create({ data: { id: randomUUID(), tenantId: fixture.b.id, listingId: fixture.listingA.id, checkIn: new Date('2026-10-01'), checkOut: new Date('2026-10-02'), guests: 1, status: 'confirmed' } })).rejects.toThrow();
    await expect(db.tenantDb.run(fixture.b.id, tx => tx.blockedDay.create({ data: { tenantId: fixture.b.id, listingId: fixture.listingA.id, date: new Date('2026-10-01') } }))).rejects.toThrow();
  });
  it.each([{ maxGuests: 0 }, { pricePerNightCents: -1 }, { latitude: 91 }, { longitude: -181 }, { bedrooms: -1 }, { rating: null, reviewCount: 2 }])('enforces numeric invariants %j', async (invalid) => {
    await expect(db.admin.listing.create({ data: { ...listingData(fixture.a.id), ...invalid } })).rejects.toThrow();
  });
  it('rejects empty booking ranges and ordinary booking writes', async () => {
    const booking = { id: randomUUID(), tenantId: fixture.a.id, listingId: fixture.listingA.id, checkIn: new Date('2026-10-01'), checkOut: new Date('2026-10-01'), guests: 1, status: 'confirmed' };
    await expect(db.admin.booking.create({ data: booking })).rejects.toThrow();
    await expect(db.tenantDb.run(fixture.a.id, tx => tx.booking.create({ data: { ...booking, checkOut: new Date('2026-10-02') } }))).rejects.toThrow();
  });
});

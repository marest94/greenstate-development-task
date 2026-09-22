import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { AdminDb } from '../src/db/admin-db.js';
import { runSeed } from '../src/seed/seed.js';
import { listingData } from './fixtures.js';
let db: TestDatabase; let adminDb: AdminDb;
beforeEach(async () => { db = await createTestDatabase(); adminDb = new AdminDb(db.urls.admin); });
afterEach(async () => { await adminDb?.close(); await db?.close(); });
const expected = { listings: 1000, bookings: 12757, tenants: 2 };
describe('Deterministic original-data import', () => {
  it('retains every original ID and supplied booking status and splits sorted UUIDs evenly', async () => {
    expect(await runSeed({ db: adminDb, enabled: true })).toEqual(expected);
    const tenants = await db.admin.tenant.findMany({ orderBy: { id: 'asc' } });
    expect(tenants).toHaveLength(2);
    const listings = await db.admin.listing.findMany({ orderBy: { id: 'asc' } });
    const source = await readFile(new URL('../../../data/listings.csv', import.meta.url), 'utf8');
    const originalIds = source.trim().split(/\r?\n/).slice(1).map(line => line.split(',')[0]).sort();
    expect(listings.map(row => row.id)).toEqual(originalIds);
    expect(listings.every((row, index) => row.tenantId === tenants[index % 2]!.id)).toBe(true);
    for (const tenant of tenants) expect(await db.tenantDb.run(tenant.id, tx => tx.listing.count())).toBe(500);
    const bookings = await db.admin.booking.findMany();
    const bookingSource = await readFile(new URL('../../../data/bookings.csv', import.meta.url), 'utf8');
    const sourceBookings = bookingSource.trim().split(/\r?\n/).slice(1).map(line => line.split(','));
    expect(bookings.map(row => row.id).sort()).toEqual(sourceBookings.map(row => row[0]).sort());
    const statusById = new Map(sourceBookings.map(row => [row[0], row[5]]));
    expect(bookings.every(row => row.status === statusById.get(row.id))).toBe(true);
    const tenantByListing = new Map(listings.map(row => [row.id, row.tenantId]));
    expect(bookings.every(row => row.tenantId === tenantByListing.get(row.listingId))).toBe(true);
  });
  it('serializes concurrent initialization and reruns without duplicating or repairing edited data', async () => {
    expect(await Promise.all([runSeed({ db: adminDb, enabled: true }), runSeed({ db: adminDb, enabled: true })])).toEqual([expected, expected]);
    const listing = await db.admin.listing.findFirstOrThrow();
    await db.tenantDb.write(listing.tenantId, tx => tx.listing.update({ where: { id: listing.id }, data: { title: 'Keep my edit', archivedAt: new Date() } }));
    await db.tenantDb.write(listing.tenantId, tx => tx.listing.create({ data: listingData(listing.tenantId) }));
    await adminDb.forTenant(listing.tenantId, 'exclusive', tx => tx.tenant.update({ where: { id: listing.tenantId }, data: { deletedAt: new Date() } }));
    expect(await runSeed({ db: adminDb, enabled: true })).toEqual(expected);
    expect(await db.admin.listing.count()).toBe(1001);
    expect(await db.admin.booking.count()).toBe(12757);
    expect(await db.admin.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ title: 'Keep my edit', archivedAt: expect.any(Date) });
    expect((await db.admin.tenant.findUniqueOrThrow({ where: { id: listing.tenantId } })).deletedAt).not.toBeNull();
  });
  it('rejects corrupt CSV before committing any application rows', async () => {
    const source = await readFile(new URL('../../../data/bookings.csv', import.meta.url), 'utf8');
    await expect(runSeed({ db: adminDb, enabled: true, bookingsCsv: source.replace('2026-07-28', '2026-02-30') })).rejects.toThrow();
    expect(await db.admin.tenant.count()).toBe(0); expect(await db.admin.listing.count()).toBe(0); expect(await db.admin.booking.count()).toBe(0);
  });
  it('rejects a changed checksum after import instead of changing stored data', async () => {
    await runSeed({ db: adminDb, enabled: true });
    const source = await readFile(new URL('../../../data/listings.csv', import.meta.url), 'utf8');
    await expect(runSeed({ db: adminDb, enabled: true, listingsCsv: source.replace('Rooftop apartment', 'Changed apartment') })).rejects.toThrow(/previously imported/);
    expect(await db.admin.listing.count()).toBe(1000);
  });
  it('rejects original ID conflicts without a marker and rolls back the whole import', async () => {
    const tenant = await db.admin.tenant.create({ data: { slug: 'preexisting', name: 'Existing data', timezone: 'UTC' } });
    await db.admin.listing.create({ data: { ...listingData(tenant.id), id: '128699a9-d81d-4217-b143-21d21169ed25', title: 'Retain original' } });
    await expect(runSeed({ db: adminDb, enabled: true })).rejects.toThrow();
    expect(await db.admin.tenant.count()).toBe(1); expect(await db.admin.listing.count()).toBe(1);
    expect(await db.admin.booking.count()).toBe(0);
    expect((await db.admin.listing.findFirstOrThrow()).title).toBe('Retain original');
  });
  it('requires deliberate demo-data opt-in', async () => {
    await expect(runSeed({ db: adminDb, enabled: false })).rejects.toThrow(/demo/);
    expect(await db.admin.tenant.count()).toBe(0);
  });
});

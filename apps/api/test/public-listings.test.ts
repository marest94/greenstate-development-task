import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ListingDto } from '@greenstate/contracts';
import { createApp } from '../src/bootstrap.js';
import { Clock } from '../src/common/time/clock.js';
import { addDays, eachDay } from '../src/common/time/dates.js';
import { isFree, type BookingSpan } from '../src/availability/availability.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture, listingData } from './fixtures.js';
import { AdminDb } from '../src/db/admin-db.js';
import { runSeed } from '../src/seed/seed.js';
import { mapData } from '../src/seed/map-data.js';
let db: TestDatabase; let app: INestApplication;
let f: Awaited<ReturnType<typeof inventoryFixture>>;
let archiveId: string; let secondId: string; let thirdId: string;
const bookings: BookingSpan[] = [
  { checkIn: '2026-10-01', checkOut: '2026-10-04', status: 'confirmed' },
  { checkIn: '2026-10-08', checkOut: '2026-10-10', status: 'completed' },
  { checkIn: '2026-10-12', checkOut: '2026-10-15', status: 'cancelled' },
];
const blocked = ['2026-10-06'];
const fixedClock: Clock = { now: () => new Date('2026-10-01T22:30:00Z') };
const endpoint = () => `/api/v1/t/${f.a.slug}/listings`;
const ids = (body: { items: ListingDto[] }) => body.items.map(item => item.id);
beforeAll(async () => {
  db = await createTestDatabase(); f = await inventoryFixture(db.admin);
  secondId = (await db.admin.listing.create({ data: { ...listingData(f.a.id), title: 'Alpha', city: 'Lisbon', country: 'PT', maxGuests: 2, pricePerNightCents: 5000 } })).id;
  thirdId = (await db.admin.listing.create({ data: { ...listingData(f.a.id), title: 'Alpha', city: 'Paris', country: 'FR', maxGuests: 6, pricePerNightCents: 20000 } })).id;
  archiveId = (await db.admin.listing.create({ data: { ...listingData(f.a.id), city: 'Archived city', archivedAt: new Date() } })).id;
  await db.admin.booking.createMany({ data: bookings.map(b => ({ id: randomUUID(), tenantId: f.a.id, listingId: f.listingA.id, checkIn: new Date(b.checkIn), checkOut: new Date(b.checkOut), guests: 2, status: b.status })) });
  await db.tenantDb.run(f.a.id, tx => tx.blockedDay.create({ data: { tenantId: f.a.id, listingId: f.listingA.id, date: new Date(blocked[0]!) } }));
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, log: () => {}, clock: fixedClock });
  await app.init();
});
afterAll(async () => { await app?.close(); await db?.close(); });
describe('Public listing HTTP API', () => {
  it('returns only active tenant inventory, stable pages, totals and the tenant business date', async () => {
    const a = await request(app.getHttpServer()).get(endpoint()).query({ pageSize: 2 }).expect(200);
    expect(a.body).toMatchObject({ total: 3, page: 1, pageSize: 2, today: '2026-10-02' });
    expect(ids(a.body)).toEqual([secondId, thirdId].sort());
    const b = await request(app.getHttpServer()).get(endpoint()).query({ page: 2, pageSize: 2 }).expect(200);
    expect(ids(b.body)).toEqual([f.listingA.id]); expect(b.body.total).toBe(3);
    const empty = await request(app.getHttpServer()).get(endpoint()).query({ page: 3, pageSize: 2 }).expect(200);
    expect(empty.body).toMatchObject({ items: [], total: 3 });
    const other = await request(app.getHttpServer()).get(`/api/v1/t/${f.b.slug}/listings`).expect(200);
    expect(ids(other.body)).toEqual([f.listingB.id]); expect(other.body.today).toBe('2026-10-01');
  });
  it.each([
    [{ city: 'Lisbon' }, () => [secondId]], [{ guests: 5 }, () => [thirdId]],
    [{ minPriceCents: 12000, maxPriceCents: 12000 }, () => [f.listingA.id]],
    [{ city: 'Berlin', guests: 4, minPriceCents: 12000, maxPriceCents: 20000 }, () => [f.listingA.id]],
    [{ city: 'Missing' }, () => []], [{ city: "' OR 1=1 --" }, () => []],
  ])('filters with %j', async (query, expected) => {
    const result = await request(app.getHttpServer()).get(endpoint()).query(query).expect(200);
    expect(ids(result.body)).toEqual(expected()); expect(result.body.total).toBe(expected().length);
  });
  it('exposes public fields and tenant-scoped facets without archived cities', async () => {
    const detail = await request(app.getHttpServer()).get(`${endpoint()}/${f.listingA.id}`).expect(200);
    expect(detail.body).toEqual({ id: f.listingA.id, title: 'Quiet apartment', city: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.4, propertyType: 'apartment', maxGuests: 4, bedrooms: 2, pricePerNightCents: 12000, currency: 'EUR', rating: null, reviewCount: 0, createdAt: '2026-01-01', description: null, version: 1 });
    const facets = await request(app.getHttpServer()).get(`${endpoint()}/facets`).expect(200);
    expect(facets.body).toEqual({ cities: ['Berlin', 'Lisbon', 'Paris'] });
  });
  it('conceals archived, foreign and nonexistent detail/calendar IDs identically', async () => {
    for (const id of [archiveId, f.listingB.id, randomUUID()]) for (const suffix of ['', '/availability?from=2026-10-01&to=2026-10-03']) {
      const r = await request(app.getHttpServer()).get(`${endpoint()}/${id}${suffix}`).expect(404);
      expect(r.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND', message: 'The requested resource was not found.' });
    }
  });
  it.each([
    ['2026-09-29', '2026-10-01'], ['2026-10-01', '2026-10-04'], ['2026-10-02', '2026-10-03'],
    ['2026-09-29', '2026-10-05'], ['2026-10-03', '2026-10-06'], ['2026-10-04', '2026-10-06'],
    ['2026-10-05', '2026-10-06'], ['2026-10-06', '2026-10-07'], ['2026-10-07', '2026-10-08'],
    ['2026-10-08', '2026-10-10'], ['2026-10-10', '2026-10-11'], ['2026-10-12', '2026-10-15'],
    ['2024-02-28', '2024-03-01'],
  ])('matches pure half-open availability for %s to %s', async (from, to) => {
    const result = await request(app.getHttpServer()).get(endpoint()).query({ from, to, city: 'Berlin' }).expect(200);
    expect(ids(result.body).includes(f.listingA.id)).toBe(isFree(bookings, blocked, { from, to }));
    const calendar = await request(app.getHttpServer()).get(`${endpoint()}/${f.listingA.id}/availability`).query({ from, to }).expect(200);
    expect(calendar.body).toEqual({ today: '2026-10-02', days: eachDay({ from, to }).map(date => ({ date, available: isFree(bookings, blocked, { from: date, to: addDays(date, 1) }) })) });
  });
  it.each([
    { page: 0 }, { page: -1 }, { page: 1.2 }, { page: '' }, { page: '0x10' }, { page: 1000001 },
    { pageSize: 0 }, { pageSize: 51 }, { guests: 0 }, { guests: 13 }, { minPriceCents: -1 },
    { minPriceCents: 1.5 }, { maxPriceCents: 2147483648 }, { minPriceCents: 2, maxPriceCents: 1 },
    { city: '' }, { city: 'a'.repeat(81) }, { city: '\u0000' }, { unexpected: 'x' },
    { from: '2026-10-01' }, { to: '2026-10-03' }, { from: '2026-02-30', to: '2026-03-04' },
    { from: '2026-10-01', to: '2026-10-01' }, { from: '2026-10-03', to: '2026-10-01' },
    { from: '2026-01-01', to: '2027-01-03' }, { from: '0000-01-01', to: '0001-01-01' },
  ])('rejects invalid search %j', async query => {
    const r = await request(app.getHttpServer()).get(endpoint()).query(query).expect(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
  });
  it('rejects duplicates, malformed IDs and unrelated detail/calendar/facet query parameters', async () => {
    for (const suffix of ['?page=1&page=2', '/not-a-uuid', `/${f.listingA.id}?secret=value`, '/facets?city=Berlin', `/${f.listingA.id}/availability`, `/${f.listingA.id}/availability?from=2026-10-01&to=2026-10-03&foo=x`]) {
      const r = await request(app.getHttpServer()).get(endpoint() + suffix).expect(400);
      expect(r.body.code).toBe('VALIDATION_FAILED');
    }
  });
  it('accepts the full 366-night limit and hides unknown/deleted tenant portals', async () => {
    await request(app.getHttpServer()).get(endpoint()).query({ from: '2024-01-01', to: '2025-01-01' }).expect(200);
    const tenant = await db.admin.tenant.create({ data: { slug: `removed-${randomUUID()}`, name: 'Removed', timezone: 'UTC', deletedAt: new Date() } });
    for (const slug of ['unknown-tenant', tenant.slug]) {
      const r = await request(app.getHttpServer()).get(`/api/v1/t/${slug}/listings`).expect(404);
      expect(r.body.code).toBe('TENANT_NOT_FOUND');
    }
  });
  it('matches search totals and calendar against the original CSV inputs after seeding', async () => {
    const listingCsv = await readFile(new URL('../../../data/listings.csv', import.meta.url), 'utf8');
    const bookingCsv = await readFile(new URL('../../../data/bookings.csv', import.meta.url), 'utf8');
    const data = mapData(listingCsv, bookingCsv);
    const adminDb = new AdminDb(db.urls.admin);
    try { await runSeed({ db: adminDb, enabled: true }); } finally { await adminDb.close(); }
    const assigned = [...data.listings].sort((a, b) => a.id < b.id ? -1 : 1).filter((_, index) => index % 2 === 0);
    const stay = { from: '2026-10-01', to: '2026-10-05' };
    const expected = assigned.filter(l => l.city === 'Berlin' && l.maxGuests >= 2 && l.pricePerNightCents <= 20000 && isFree(data.bookings.filter(b => b.listingId === l.id), [], stay));
    const response = await request(app.getHttpServer()).get('/api/v1/t/greenstate/listings').query({ ...stay, city: 'Berlin', guests: 2, maxPriceCents: 20000, pageSize: 50 }).expect(200);
    expect(response.body.total).toBe(expected.length); expect(ids(response.body).sort()).toEqual(expected.map(l => l.id).sort());
    const selected = assigned[0]!;
    const calendar = await request(app.getHttpServer()).get(`/api/v1/t/greenstate/listings/${selected.id}/availability`).query(stay).expect(200);
    expect(calendar.body.days).toEqual(eachDay(stay).map(date => ({ date, available: isFree(data.bookings.filter(b => b.listingId === selected.id), [], { from: date, to: addDays(date, 1) }) })));
  });
});

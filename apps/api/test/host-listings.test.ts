import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HostListingViewSchema, HostListingsPageSchema } from '@greenstate/contracts';
import * as locks from '../src/listings/listing-lock.js';
import { createApp } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture, listingData } from './fixtures.js';
let db: TestDatabase; let app: INestApplication; let f: Awaited<ReturnType<typeof inventoryFixture>>;
let host: string; let client: string; let foreignHost: string; let restricted: string;
let now = new Date('2026-10-01T22:30:00Z'); // Berlin's business date is October 2; Lisbon's is October 1.
const origin = 'http://localhost:5173';
const csrf = { Origin: origin, 'X-Requested-By': 'greenstate-web' };
const fields = { title: 'A bright studio', description: 'Space to relax.', city: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.4, propertyType: 'studio', maxGuests: 4, bedrooms: 1, pricePerNightCents: 12345 };
const path = (id?: string, slug = f.a.slug) => `/api/v1/t/${slug}/host/listings${id ? `/${id}` : ''}`;
const get = (url: string, session = host) => request(app.getHttpServer()).get(url).set('Cookie', session);
const post = (url: string, session = host) => request(app.getHttpServer()).post(url).set(csrf).set('Cookie', session);
const patch = (url: string, session = host) => request(app.getHttpServer()).patch(url).set(csrf).set('Cookie', session);
async function account(tenantId: string, slug: string, role = 'host', mustChangePassword = false) {
  const response = await request(app.getHttpServer()).post(`/api/v1/t/${slug}/auth/register`).set(csrf).send({ email: `${randomUUID()}@example.test`, password: 'A long host inventory test passphrase' }).expect(201);
  await db.admin.tenantUser.update({ where: { id: response.body.id }, data: { role, mustChangePassword } });
  expect(response.body.tenantId).toBe(tenantId);
  return (response.headers['set-cookie'] as unknown as string[]).map(value => value.split(';')[0]).join('; ');
}
beforeAll(async () => {
  db = await createTestDatabase(); f = await inventoryFixture(db.admin);
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, config: loadConfig({ APP_ORIGIN: origin }), clock: { now: () => now }, log: () => {} });
  await app.init();
  host = await account(f.a.id, f.a.slug); client = await account(f.a.id, f.a.slug, 'client');
  foreignHost = await account(f.b.id, f.b.slug); restricted = await account(f.a.id, f.a.slug, 'host', true);
});
afterAll(async () => { await app?.close(); await db?.close(); });
describe('Host inventory HTTP boundary', () => {
  it('requires an unrestricted tenant host for every inventory endpoint', async () => {
    for (const [method, url, body] of [
      ['get', path(), undefined], ['get', path(f.listingA.id), undefined], ['post', path(), fields],
      ['patch', path(f.listingA.id), { ...fields, version: 1 }], ['post', `${path(f.listingA.id)}/archive`, { version: 1 }], ['post', `${path(f.listingA.id)}/restore`, { version: 1 }],
    ] as const) {
      for (const [session, expected] of [['', 401], [client, 403], [restricted, 403], [foreignHost, 401]] as const) {
        const response = await request(app.getHttpServer())[method](url).set(csrf).set('Cookie', session).send(body).expect(expected);
        if (session === restricted) expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      }
    }
    await get(path()).expect(200);
  });
  it('creates a public listing with server-owned fields and tenant-local creation date', async () => {
    const result = await post(path()).send(fields).expect(201);
    expect(HostListingViewSchema.safeParse(result.body).success).toBe(true);
    expect(result.body).toMatchObject({ ...fields, currency: 'EUR', rating: null, reviewCount: 0, createdAt: '2026-10-02', version: 1, archivedAt: null });
    expect(result.body).not.toHaveProperty('tenantId');
    await request(app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/listings/${result.body.id}`).expect(200).expect(r => expect(r.body.description).toBe('Space to relax.'));
    const other = await post(path(undefined, f.b.slug), foreignHost).send(fields).expect(201);
    expect(other.body.createdAt).toBe('2026-10-01');
  });
  it('rejects unknown or protected fields on create and edit', async () => {
    for (const extra of [{ tenantId: f.b.id }, { id: randomUUID() }, { rating: 5 }, { reviewCount: 99 }, { currency: 'USD' }, { archivedAt: now.toISOString() }, { createdAt: '2026-01-01' }]) {
      await post(path()).send({ ...fields, ...extra }).expect(400);
      await patch(path(f.listingA.id)).send({ ...fields, version: 1, ...extra }).expect(400);
    }
  });
  it('rejects cities containing control characters on both create and edit', async () => {
    for (const city of ['New\nYork', 'New\tYork', 'New\u0000York', 'New\u007fYork']) {
      await post(path()).send({ ...fields, city }).expect(400);
      await patch(path(f.listingA.id)).send({ ...fields, city, version: 1 }).expect(400);
    }
    expect((await get(path(f.listingA.id)).expect(200)).body.city).toBe('Berlin');
  });
  it('makes accepted city names usable from host writes through public facets and search', async () => {
    const publicPath = `/api/v1/t/${f.a.slug}/listings`;
    const created = await post(path()).send({ ...fields, city: '  São João  ' }).expect(201);
    expect(created.body.city).toBe('São João');
    const facets = await request(app.getHttpServer()).get(`${publicPath}/facets`).expect(200);
    const city = facets.body.cities.find((value: string) => value === 'São João');
    expect(city).toBe('São João');
    const found = await request(app.getHttpServer()).get(publicPath).query({ city }).expect(200);
    expect(found.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id);
    await patch(path(created.body.id)).send({ ...fields, city: '  Saint-Jean-d’Angély  ', version: 1 }).expect(200);
    const updatedFacets = await request(app.getHttpServer()).get(`${publicPath}/facets`).expect(200);
    expect(updatedFacets.body.cities).toContain('Saint-Jean-d’Angély');
    expect(updatedFacets.body.cities).not.toContain('São João');
    const updated = await request(app.getHttpServer()).get(publicPath).query({ city: 'Saint-Jean-d’Angély' }).expect(200);
    expect(updated.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id);
  });
  it('bounds and validates writes, versions, IDs, and inventory query inputs', async () => {
    for (const invalid of [{ title: '' }, { description: 'x'.repeat(5001) }, { country: 'de' }, { latitude: 91 }, { longitude: 181 }, { maxGuests: 13 }, { bedrooms: -1 }, { pricePerNightCents: 1.5 }, { propertyType: 'castle' }]) await post(path()).send({ ...fields, ...invalid }).expect(400);
    for (const version of [undefined, 0, -1, 2147483647, 1.5, '1']) {
      await patch(path(f.listingA.id)).send({ ...fields, version }).expect(400);
      await post(`${path(f.listingA.id)}/archive`).send({ version }).expect(400);
    }
    for (const suffix of ['?status=missing', '?page=0', '?pageSize=51', '?status=all&extra=1', '?status=active&status=archived']) await get(`${path()}${suffix}`).expect(400);
    await get(path('invalid')).expect(400);
    await get(`${path(f.listingA.id)}?extra=1`).expect(400);
    await post(`${path()}?extra=1`).send(fields).expect(400);
  });
  it('requires both CSRF boundaries on all mutations', async () => {
    for (const [method, url, body] of [['post', path(), fields], ['patch', path(f.listingA.id), { ...fields, version: 1 }], ['post', `${path(f.listingA.id)}/archive`, { version: 1 }], ['post', `${path(f.listingA.id)}/restore`, { version: 1 }]] as const) {
      for (const headers of [{}, { Origin: origin }, { Origin: 'https://elsewhere.test', 'X-Requested-By': 'greenstate-web' }]) await request(app.getHttpServer())[method](url).set(headers).set('Cookie', host).send(body).expect(403);
    }
  });
  it('never reveals or changes another tenant’s inventory, including by UUID', async () => {
    const before = await db.admin.listing.findUniqueOrThrow({ where: { id: f.listingB.id } });
    await get(path(f.listingB.id)).expect(404);
    await patch(path(f.listingB.id)).send({ ...fields, version: 1 }).expect(404);
    for (const action of ['archive', 'restore']) await post(`${path(f.listingB.id)}/${action}`).send({ version: 1 }).expect(404);
    await get(path(randomUUID())).expect(404);
    const result = await get(`${path()}?status=all`).expect(200);
    expect(result.body.items.map((item: { id: string }) => item.id)).not.toContain(f.listingB.id);
    expect(await db.admin.listing.findUniqueOrThrow({ where: { id: f.listingB.id } })).toEqual(before);
  });
  it('serializes concurrent edits and rejects stale archive or restore attempts', async () => {
    const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
    const results = await Promise.all([patch(path(listing.id)).send({ ...fields, title: 'First edit', version: 1 }), patch(path(listing.id)).send({ ...fields, title: 'Second edit', version: 1 })]);
    expect(results.map(response => response.status).sort()).toEqual([200, 409]);
    expect(results.find(response => response.status === 409)?.body.code).toBe('STALE_VERSION');
    const current = await get(path(listing.id)).expect(200);
    expect(current.body.version).toBe(2); expect(current.body.title).toBe(results.find(response => response.status === 200)?.body.title);
    for (const action of ['archive', 'restore']) await post(`${path(listing.id)}/${action}`).send({ version: 1 }).expect(409).expect(r => expect(r.body.code).toBe('STALE_VERSION'));
  });
  it('archives with active and future bookings unchanged, preserves saves, and restores public visibility', async () => {
    const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
    const user = await db.admin.tenantUser.findFirstOrThrow({ where: { tenantId: f.a.id } });
    await db.admin.savedListing.create({ data: { tenantId: f.a.id, userId: user.id, listingId: listing.id } });
    await db.admin.booking.createMany({ data: [
      { id: randomUUID(), tenantId: f.a.id, listingId: listing.id, checkIn: new Date('2026-10-01'), checkOut: new Date('2026-10-04'), guests: 3, status: 'confirmed' },
      { id: randomUUID(), tenantId: f.a.id, listingId: listing.id, checkIn: new Date('2026-10-06'), checkOut: new Date('2026-10-08'), guests: 4, status: 'confirmed' },
    ] });
    const before = await db.admin.booking.findMany({ where: { listingId: listing.id }, orderBy: { id: 'asc' } });
    const archived = await post(`${path(listing.id)}/archive`).send({ version: 1 }).expect(200);
    expect(archived.body).toMatchObject({ archivedAt: now.toISOString(), version: 2 });
    await request(app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/listings/${listing.id}`).expect(404);
    expect((await get(path()).expect(200)).body.items.map((item: { id: string }) => item.id)).not.toContain(listing.id);
    const page = await get(`${path()}?status=archived&pageSize=1`).expect(200);
    expect(HostListingsPageSchema.safeParse(page.body).success).toBe(true); expect(page.body.items[0].id).toBe(listing.id); expect(page.body.total).toBe(1);
    await patch(path(listing.id)).send({ ...fields, version: 2 }).expect(200);
    const restored = await post(`${path(listing.id)}/restore`).send({ version: 3 }).expect(200);
    expect(restored.body).toMatchObject({ archivedAt: null, version: 4 });
    await request(app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/listings/${listing.id}`).expect(200);
    expect(await db.admin.booking.findMany({ where: { listingId: listing.id }, orderBy: { id: 'asc' } })).toEqual(before);
    expect(await db.admin.savedListing.count({ where: { listingId: listing.id } })).toBe(1);
  });
  it.each([
    ['in progress', '2026-10-01', '2026-10-03', 'confirmed', 3, 409],
    ['future', '2026-10-04', '2026-10-06', 'confirmed', 3, 409],
    ['noncancelled completed status', '2026-10-01', '2026-10-03', 'completed', 3, 409],
    ['equal capacity', '2026-10-01', '2026-10-03', 'confirmed', 4, 200],
    ['cancelled', '2026-10-01', '2026-10-03', 'cancelled', 3, 200],
    ['checkout today', '2026-10-01', '2026-10-02', 'confirmed', 3, 200],
    ['past', '2026-09-01', '2026-09-03', 'confirmed', 3, 200],
  ])('applies tenant business-date capacity rules to %s stays', async (_label, checkIn, checkOut, bookingStatus, capacity, expected) => {
    const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
    const booking = await db.admin.booking.create({ data: { id: randomUUID(), tenantId: f.a.id, listingId: listing.id, checkIn: new Date(checkIn), checkOut: new Date(checkOut), guests: 4, status: bookingStatus } });
    const response = await patch(path(listing.id)).send({ ...fields, maxGuests: capacity, version: 1 }).expect(expected);
    if (expected === 409) { expect(response.body.code).toBe('CAPACITY_CONFLICT'); expect(response.body.message).toMatch(/4/); }
    expect(await db.admin.booking.findUniqueOrThrow({ where: { id: booking.id } })).toEqual(booking);
    expect((await get(path(listing.id))).body.version).toBe(expected === 200 ? 2 : 1);
  });
  it('returns deterministic bounded pages, including an out-of-range empty page with its total', async () => {
    const first = await get(`${path()}?status=all&pageSize=2`).expect(200);
    const second = await get(`${path()}?status=all&pageSize=2&page=2`).expect(200);
    expect(first.body.items).toHaveLength(2); expect(second.body.items).toHaveLength(2);
    expect(second.body.items.map((item: { id: string }) => item.id).some((id: string) => first.body.items.some((item: { id: string }) => item.id === id))).toBe(false);
    expect((await get(`${path()}?status=all&pageSize=2`).expect(200)).body).toEqual(first.body);
    const absent = await get(`${path()}?status=all&page=1000&pageSize=2`).expect(200);
    expect(absent.body.items).toEqual([]); expect(absent.body.total).toBe(first.body.total);
  });
  it('rejects all host reads and writes once the tenant is deleted', async () => {
    const fixture = await inventoryFixture(db.admin); const session = await account(fixture.a.id, fixture.a.slug);
    await db.admin.tenant.update({ where: { id: fixture.a.id }, data: { deletedAt: now } });
    await get(path(undefined, fixture.a.slug), session).expect(404);
    await post(path(undefined, fixture.a.slug), session).send(fields).expect(404);
    await patch(path(fixture.listingA.id, fixture.a.slug), session).send({ ...fields, version: 1 }).expect(404);
  });
});

it('uses the business date after a listing lock wait crosses midnight for capacity edits', async () => {
 const before = now; const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
 const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
 await db.admin.booking.create({ data: { id: randomUUID(), tenantId: f.a.id, listingId: listing.id, checkIn: new Date('2026-10-01'), checkOut: new Date('2026-10-02'), guests: 4, status: 'confirmed' } });
 const original = locks.lockListing;
 const spy = vi.spyOn(locks, 'lockListing').mockImplementationOnce(async (...args) => { const locked = await original(...args); entered.resolve(); await release.promise; return locked; });
 now = new Date('2026-10-01T21:59:59.900Z');
 const response = patch(path(listing.id)).send({ ...fields, maxGuests: 2, version: 1 }).then(value => value);
 try {
  await entered.promise; now = new Date('2026-10-01T22:00:00.100Z'); release.resolve();
  const result = await response; expect(result.status).toBe(200); expect(result.body.maxGuests).toBe(2);
 } finally { release.resolve(); await response; spy.mockRestore(); now = before; }
});

it('filters literal title/city/type and sorts prices across the full tenant inventory', async () => {
  const one = await db.admin.listing.create({ data: { ...listingData(f.a.id), title: '100% inventory-one', city: 'Porto', propertyType: 'studio', pricePerNightCents: 9000 } });
  const two = await db.admin.listing.create({ data: { ...listingData(f.a.id), title: '100% inventory-two', city: 'Porto', propertyType: 'studio', pricePerNightCents: 11000 } });
  const result = await get(path()).query({ search: '100%', city: 'porto', propertyType: 'studio', sort: 'price-desc', pageSize: 1 }).expect(200);
  expect(result.body.total).toBe(2); expect(result.body.items[0].id).toBe(two.id);
  const next = await get(path()).query({ search: '100%', sort: 'price-desc', pageSize: 1, page: 2 }).expect(200);
  expect(next.body.items[0].id).toBe(one.id);
});

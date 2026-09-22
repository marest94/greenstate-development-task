import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BlockViewSchema, HostCalendarSchema } from '@greenstate/contracts';
import { createApp } from '../src/bootstrap.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture, listingData } from './fixtures.js';
import { bookingData, calendarAccount, calendarCsrf, calendarNow, calendarPlatformAccount } from './calendar-fixtures.js';
import * as locks from '../src/listings/listing-lock.js';
import { TenantDb } from '../src/db/tenant-db.js';
let db: TestDatabase; let app: INestApplication; let f: Awaited<ReturnType<typeof inventoryFixture>>;
let now = calendarNow;
let host: string; let client: string; let restricted: string; let foreign: string; let platform: string;
const base = (id: string, slug = f.a.slug) => `/api/v1/t/${slug}/host/listings/${id}`;
const range = { from: '2026-10-09', to: '2026-10-14' };
const get = (id: string, cookie = host) => request(app.getHttpServer()).get(`${base(id)}/calendar`).set('Cookie', cookie).query(range);
const block = (id: string, date = '2026-10-10', cookie = host) => request(app.getHttpServer()).post(`${base(id)}/blocks`).set(calendarCsrf).set('Cookie', cookie).send({ date });
const remove = (id: string, blockId: string, cookie = host) => request(app.getHttpServer()).delete(`${base(id)}/blocks/${blockId}`).set(calendarCsrf).set('Cookie', cookie);
beforeAll(async () => {
  db = await createTestDatabase(); f = await inventoryFixture(db.admin);
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, clock: { now: () => now }, log: () => {} }); await app.listen(0);
  host = await calendarAccount(db, f.a.id); client = await calendarAccount(db, f.a.id, 'client'); restricted = await calendarAccount(db, f.a.id, 'host', true);
  foreign = await calendarAccount(db, f.b.id); platform = await calendarPlatformAccount(db);
});
afterEach(() => { vi.restoreAllMocks(); now = calendarNow; });
afterAll(async () => { await app?.close(); await db?.close(); });
it('requires an unrestricted tenant host on calendar and both block mutations', async () => {
  for (const [cookie, status] of [['', 401], [client, 403], [restricted, 403], [foreign, 401], [platform, 401]] as const) {
    await get(f.listingA.id, cookie).expect(status); await block(f.listingA.id, undefined, cookie).expect(status); await remove(f.listingA.id, randomUUID(), cookie).expect(status);
  }
  await get(f.listingA.id).expect(200);
});
it('reports overlapping occupied nights, checkout boundaries, cancellation, and legacy blocks without losing booking information', async () => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
  const first = await db.admin.booking.create({ data: bookingData(f.a.id, listing.id) });
  const second = await db.admin.booking.create({ data: bookingData(f.a.id, listing.id, '2026-10-11', '2026-10-13', 'completed') });
  const cancelled = await db.admin.booking.create({ data: bookingData(f.a.id, listing.id, '2026-10-13', '2026-10-14', 'cancelled') });
  const legacy = await db.admin.blockedDay.create({ data: { tenantId: f.a.id, listingId: listing.id, date: new Date('2026-10-11'), reason: 'Legacy block' } });
  const response = await get(listing.id).expect(200);
  expect(HostCalendarSchema.safeParse(response.body).success).toBe(true); expect(response.body.today).toBe('2026-10-02');
  expect(response.body.days).toEqual([
    { date: '2026-10-09', status: 'available', bookingIds: [], block: null },
    { date: '2026-10-10', status: 'booked', bookingIds: [first.id], block: null },
    { date: '2026-10-11', status: 'booked', bookingIds: [first.id, second.id], block: { id: legacy.id, reason: 'Legacy block' } },
    { date: '2026-10-12', status: 'booked', bookingIds: [second.id], block: null },
    { date: '2026-10-13', status: 'available', bookingIds: [], block: null },
  ]);
  expect(response.body.bookings.map((b: { id: string }) => b.id)).toEqual([first.id, second.id, cancelled.id]);
});
it('blocks a free day with a private reason and immediately updates public availability and search', async () => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
  const result = await request(app.getHttpServer()).post(`${base(listing.id)}/blocks`).set(calendarCsrf).set('Cookie', host).send({ date: '2026-10-10', reason: ' Maintenance ' }).expect(201);
  expect(BlockViewSchema.safeParse(result.body).success).toBe(true); expect(result.body).toMatchObject({ date: '2026-10-10', reason: 'Maintenance', listingId: listing.id });
  const publicBase = `/api/v1/t/${f.a.slug}/listings`;
  expect((await request(app.getHttpServer()).get(`${publicBase}/${listing.id}/availability`).query({ from: '2026-10-10', to: '2026-10-11' }).expect(200)).body.days).toEqual([{ date: '2026-10-10', available: false }]);
  const blockedSearch = await request(app.getHttpServer()).get(publicBase).query({ from: '2026-10-10', to: '2026-10-11', pageSize: 50 }).expect(200);
  expect(blockedSearch.body.items.map((item: { id: string }) => item.id)).not.toContain(listing.id);
  expect((await get(listing.id)).body.days[1]).toEqual({ date: '2026-10-10', status: 'blocked', bookingIds: [], block: { id: result.body.id, reason: 'Maintenance' } });
  await remove(listing.id, result.body.id).expect(204);
  expect((await request(app.getHttpServer()).get(`${publicBase}/${listing.id}/availability`).query({ from: '2026-10-10', to: '2026-10-11' }).expect(200)).body.days[0].available).toBe(true);
  expect((await request(app.getHttpServer()).get(publicBase).query({ from: '2026-10-10', to: '2026-10-11', pageSize: 50 }).expect(200)).body.items.map((item: { id: string }) => item.id)).toContain(listing.id);
});
it('rejects past, occupied, duplicate and archived blocks while allowing cancelled nights and checkout dates', async () => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
  await db.admin.booking.createMany({ data: [bookingData(f.a.id, listing.id), bookingData(f.a.id, listing.id, '2026-10-13', '2026-10-15', 'cancelled')] });
  for (const [date, code] of [['2026-10-01', 'PAST_DATE'], ['2026-10-10', 'DATE_OCCUPIED'], ['2026-10-11', 'DATE_OCCUPIED']]) await block(listing.id, date).expect(409).expect(r => expect(r.body.code).toBe(code));
  await block(listing.id, '2026-10-02').expect(201); await block(listing.id, '2026-10-12').expect(201); await block(listing.id, '2026-10-13').expect(201);
  await block(listing.id, '2026-10-12').expect(409).expect(r => expect(r.body.code).toBe('DATE_BLOCKED'));
  await db.admin.listing.update({ where: { id: listing.id }, data: { archivedAt: calendarNow } });
  await get(listing.id).expect(200); await block(listing.id, '2026-10-20').expect(409).expect(r => expect(r.body.code).toBe('LISTING_ARCHIVED'));
});
it('allows removal of past and archived blocks without changing bookings', async () => {
  const listing = await db.admin.listing.create({ data: { ...listingData(f.a.id), archivedAt: calendarNow } });
  const booking = await db.admin.booking.create({ data: bookingData(f.a.id, listing.id, '2026-09-01', '2026-09-05') });
  const blocked = await db.admin.blockedDay.create({ data: { tenantId: f.a.id, listingId: listing.id, date: new Date('2026-09-02') } });
  await remove(listing.id, blocked.id).expect(204); await remove(listing.id, blocked.id).expect(404);
  expect(await db.admin.booking.findUniqueOrThrow({ where: { id: booking.id } })).toEqual(booking);
});
it('scopes listing and block UUIDs and requires both CSRF boundaries', async () => {
  const own = await db.admin.blockedDay.create({ data: { tenantId: f.a.id, listingId: f.listingA.id, date: new Date('2026-11-01') } });
  const other = await db.admin.blockedDay.create({ data: { tenantId: f.b.id, listingId: f.listingB.id, date: new Date('2026-11-01') } });
  await get(f.listingB.id).expect(404); await block(f.listingB.id).expect(404); await remove(f.listingA.id, other.id).expect(404); await remove(f.listingB.id, other.id).expect(404);
  const different = await db.admin.listing.create({ data: listingData(f.a.id) }); await remove(different.id, own.id).expect(404);
  for (const headers of [{}, { Origin: calendarCsrf.Origin }, { ...calendarCsrf, Origin: 'https://elsewhere.test' }]) {
    await request(app.getHttpServer()).post(`${base(f.listingA.id)}/blocks`).set(headers).set('Cookie', host).send({ date: '2026-10-20' }).expect(403);
    await request(app.getHttpServer()).delete(`${base(f.listingA.id)}/blocks/${own.id}`).set(headers).set('Cookie', host).expect(403);
  }
  expect(await db.admin.blockedDay.count({ where: { id: { in: [own.id, other.id] } } })).toBe(2);
});
it('strictly validates calendar ranges, single-day writes and block IDs', async () => {
  for (const query of [{ from: '2026-10-01' }, { from: '2026-10-01', to: '2026-10-01' }, { from: '2026-02-30', to: '2026-10-01' }, { from: '2026-01-01', to: '2028-01-01' }, { ...range, tenantId: f.b.id }]) await request(app.getHttpServer()).get(`${base(f.listingA.id)}/calendar`).set('Cookie', host).query(query).expect(400);
  for (const body of [{ date: '2026-02-30' }, { date: '2026-10-10', reason: '' }, { date: '2026-10-10', reason: 'x'.repeat(501) }, { date: '2026-10-10', tenantId: f.b.id }, { date: '2026-10-10', id: randomUUID() }]) await request(app.getHttpServer()).post(`${base(f.listingA.id)}/blocks`).set(calendarCsrf).set('Cookie', host).send(body).expect(400);
  await get('invalid').expect(400); await remove(f.listingA.id, 'invalid').expect(400);
});
it('serializes duplicate block submissions into one successful block', async () => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
  const results = await Promise.all([block(listing.id), block(listing.id)]);
  expect(results.map(r => r.status).sort()).toEqual([201, 409]); expect(results.find(r => r.status === 409)?.body.code).toBe('DATE_BLOCKED');
  expect(await db.admin.blockedDay.count({ where: { listingId: listing.id } })).toBe(1);
});
function holdFirstListingLock() {
  const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>(); const original = locks.lockListing;
  vi.spyOn(locks, 'lockListing').mockImplementationOnce(async (...args) => { const listing = await original(...args); entered.resolve(); await release.promise; return listing; });
  return { entered: entered.promise, release: release.resolve };
}
async function expectBlockedListingWriter() {
  await vi.waitFor(async () => { const result = await db.server.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1 AND usename = 'gs_app' AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'", [db.name]); expect(result.rows[0].count).toBeGreaterThan(0); }, { timeout: 2000, interval: 10 });
}
it.each([true, false])('coordinates archive and block ordering (archive first: %s)', async archiveFirst => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
  const archive = () => request(app.getHttpServer()).post(`${base(listing.id)}/archive`).set(calendarCsrf).set('Cookie', host).send({ version: 1 });
  const barrier = holdFirstListingLock(); const winner = (archiveFirst ? archive() : block(listing.id)).then(r => r); let waiter: Promise<request.Response> | undefined;
  try { await barrier.entered; waiter = (archiveFirst ? block(listing.id) : archive()).then(r => r); await expectBlockedListingWriter(); barrier.release();
    expect((await winner).status).toBe(archiveFirst ? 200 : 201); expect((await waiter).status).toBe(archiveFirst ? 409 : 200);
    expect(await db.admin.blockedDay.count({ where: { listingId: listing.id } })).toBe(archiveFirst ? 0 : 1);
  } finally { barrier.release(); await winner; await waiter; }
});
it('rechecks tenant deletion inside both mutations after the HTTP guard', async () => {
  for (const action of ['create', 'remove']) {
    const fixture = await inventoryFixture(db.admin); const cookie = await calendarAccount(db, fixture.a.id);
    const existing = await db.admin.blockedDay.create({ data: { tenantId: fixture.a.id, listingId: fixture.listingA.id, date: new Date('2026-11-01') } });
    const original = TenantDb.prototype.write;
    vi.spyOn(TenantDb.prototype, 'write').mockImplementationOnce(async function (this: TenantDb, tenantId, fn) { await db.admin.tenant.update({ where: { id: tenantId }, data: { deletedAt: calendarNow } }); return original.call(this, tenantId, fn); });
    const target = base(fixture.listingA.id, fixture.a.slug);
    if (action === 'create') await request(app.getHttpServer()).post(`${target}/blocks`).set(calendarCsrf).set('Cookie', cookie).send({ date: '2026-10-10' }).expect(404);
    else await request(app.getHttpServer()).delete(`${target}/blocks/${existing.id}`).set(calendarCsrf).set('Cookie', cookie).expect(404);
    expect(await db.admin.blockedDay.count({ where: { listingId: fixture.listingA.id } })).toBe(1); vi.restoreAllMocks();
  }
});
it('uses fresh tenant configuration rather than the timezone read by the HTTP guard', async () => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) }); const original = TenantDb.prototype.write;
  vi.spyOn(TenantDb.prototype, 'write').mockImplementationOnce(async function (this: TenantDb, tenantId, fn) { await db.admin.tenant.update({ where: { id: tenantId }, data: { timezone: 'Europe/Lisbon' } }); return original.call(this, tenantId, fn); });
  try { await block(listing.id, '2026-10-01').expect(201); } finally { await db.admin.tenant.update({ where: { id: f.a.id }, data: { timezone: 'Europe/Berlin' } }); }
});

it('rechecks today after a listing lock wait crosses the tenant midnight boundary', async () => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
  const barrier = holdFirstListingLock(); const result = block(listing.id, '2026-10-02').then(response => response);
  try {
    await barrier.entered; now = new Date('2026-10-02T22:30:00Z'); barrier.release();
    const response = await result; expect(response.status).toBe(409); expect(response.body.code).toBe('PAST_DATE');
    expect(await db.admin.blockedDay.count({ where: { listingId: listing.id } })).toBe(0);
  } finally { barrier.release(); await result; }
});
it('keeps historical archived calendars inspectable as supplied bookings age', async () => {
  const listing = await db.admin.listing.create({ data: { ...listingData(f.a.id), archivedAt: calendarNow } });
  const booking = await db.admin.booking.create({ data: bookingData(f.a.id, listing.id, '2025-06-01', '2025-06-03') });
  const response = await request(app.getHttpServer()).get(`${base(listing.id)}/calendar`).set('Cookie', host).query({ from: '2025-06-01', to: '2025-06-04' }).expect(200);
  expect(response.body.days.map((day: { status: string }) => day.status)).toEqual(['booked', 'booked', 'available']);
  expect(response.body.bookings[0]).toMatchObject({ id: booking.id, status: 'confirmed', checkOut: '2025-06-03' });
});

const blockRange = (id: string, action = 'block', from = '2026-10-09', to = '2026-10-14', cookie = host) => request(app.getHttpServer()).post(`${base(id)}/block-range`).set(calendarCsrf).set('Cookie', cookie).send({ from, to, action, ...(action === 'block' ? { reason: 'Maintenance' } : {}) });
it('applies ranges atomically, preserves existing reasons, and removes only manual blocks', async () => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
  const booking = await db.admin.booking.create({ data: bookingData(f.a.id, listing.id) });
  await blockRange(listing.id).expect(409);
  expect(await db.admin.blockedDay.count({ where: { listingId: listing.id } })).toBe(0);
  const existing = await db.admin.blockedDay.create({ data: { tenantId: f.a.id, listingId: listing.id, date: new Date('2026-10-13'), reason: 'Original' } });
  await blockRange(listing.id, 'block', '2026-10-12', '2026-10-15').expect(201).expect(r => expect(r.body.changed).toBe(2));
  expect((await db.admin.blockedDay.findUniqueOrThrow({ where: { id: existing.id } })).reason).toBe('Original');
  await blockRange(listing.id, 'block', '2026-10-12', '2026-10-15').expect(201).expect(r => expect(r.body.changed).toBe(0));
  await blockRange(listing.id, 'unblock', '2026-10-09', '2026-10-15').expect(201).expect(r => expect(r.body.changed).toBe(3));
  expect(await db.admin.booking.findUniqueOrThrow({ where: { id: booking.id } })).toEqual(booking);
});
it('bounds and scopes range mutations and retains existing permissions', async () => {
  await blockRange(f.listingB.id).expect(404);
  await blockRange(f.listingA.id, 'block', '2026-10-01', '2026-10-03').expect(409);
  await blockRange(f.listingA.id, 'block', '2026-10-01', '2026-12-03').expect(400);
  await blockRange(f.listingA.id, 'block', '2026-10-14', '2026-10-09').expect(400);
  await blockRange(f.listingA.id, 'block', '2026-10-09', '2026-10-14', client).expect(403);
});
it('returns bounded portfolio rows with tenant-scoped calendar states and literal filters', async () => {
  const listing = await db.admin.listing.create({ data: { ...listingData(f.a.id), title: 'Portfolio 100% unique', city: 'Porto' } });
  await db.admin.booking.create({ data: bookingData(f.a.id, listing.id) });
  const endpoint = `/api/v1/t/${f.a.slug}/host/calendar`;
  const response = await request(app.getHttpServer()).get(endpoint).set('Cookie', host).query({ ...range, search: '100%', city: 'porto', pageSize: 1 }).expect(200);
  expect(response.body.total).toBe(1); expect(response.body.items[0].listing.id).toBe(listing.id);
  expect(response.body.items[0].days.map((d: { status: string }) => d.status)).toEqual(['available', 'booked', 'booked', 'available', 'available']);
  await request(app.getHttpServer()).get(endpoint).set('Cookie', client).query(range).expect(403);
  await request(app.getHttpServer()).get(endpoint).set('Cookie', host).query({ from: '2026-01-01', to: '2026-03-01' }).expect(400);
});
it('serializes overlapping range submissions and protects archived and past legacy blocks', async () => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
  const results = await Promise.all([blockRange(listing.id), blockRange(listing.id)]);
  expect(results.map(r => r.status)).toEqual([201, 201]); expect(results.map(r => r.body.changed).sort()).toEqual([0, 5]);
  await db.admin.listing.update({ where: { id: listing.id }, data: { archivedAt: now } });
  await blockRange(listing.id, 'block', '2026-10-20', '2026-10-23').expect(409).expect(r => expect(r.body.code).toBe('LISTING_ARCHIVED'));
  await blockRange(listing.id, 'unblock').expect(201).expect(r => expect(r.body.changed).toBe(5));
  await request(app.getHttpServer()).post(`${base(listing.id)}/block-range`).set('Cookie', host).send({ ...range, action: 'block' }).expect(403);
});
it('checks range business dates after a lock wait crosses midnight', async () => {
  const listing = await db.admin.listing.create({ data: listingData(f.a.id) });
  const barrier = holdFirstListingLock(); const result = blockRange(listing.id, 'block', '2026-10-02', '2026-10-04').then(response => response);
  try { await barrier.entered; now = new Date('2026-10-02T22:30:00Z'); barrier.release();
    const response = await result; expect(response.status).toBe(409); expect(response.body.code).toBe('PAST_DATE');
    expect(await db.admin.blockedDay.count({ where: { listingId: listing.id } })).toBe(0);
  } finally { barrier.release(); await result; }
});

import { afterAll, beforeAll, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BookingsPageSchema } from '@greenstate/contracts';
import { createApp } from '../src/bootstrap.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture, listingData } from './fixtures.js';
import { bookingData, calendarAccount, calendarCsrf, calendarNow, calendarPlatformAccount } from './calendar-fixtures.js';
let db: TestDatabase; let app: INestApplication; let f: Awaited<ReturnType<typeof inventoryFixture>>;
let host: string; let client: string; let restricted: string; let foreign: string; let platform: string;
let archivedId: string;
const path = () => `/api/v1/t/${f.a.slug}/host/bookings`;
const get = (query = {}, cookie = host) => request(app.getHttpServer()).get(path()).set('Cookie', cookie).query(query);
beforeAll(async () => {
  db = await createTestDatabase(); f = await inventoryFixture(db.admin);
  const archived = await db.admin.listing.create({ data: { ...listingData(f.a.id), title: 'Archived stay', archivedAt: calendarNow } }); archivedId = archived.id;
  await db.admin.booking.createMany({ data: [
    bookingData(f.a.id, archived.id, '2026-09-01', '2026-09-05', 'confirmed'), bookingData(f.a.id, f.listingA.id, '2026-10-01', '2026-10-02', 'confirmed'),
    bookingData(f.a.id, f.listingA.id, '2026-10-01', '2026-10-03', 'completed'), bookingData(f.a.id, f.listingA.id, '2026-10-10', '2026-10-12', 'cancelled'),
    bookingData(f.b.id, f.listingB.id, '2026-10-10', '2026-10-12', 'confirmed'),
  ] });
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, clock: { now: () => calendarNow }, log: () => {} }); await app.init();
  host = await calendarAccount(db, f.a.id); client = await calendarAccount(db, f.a.id, 'client'); restricted = await calendarAccount(db, f.a.id, 'host', true); foreign = await calendarAccount(db, f.b.id); platform = await calendarPlatformAccount(db);
});
afterAll(async () => { await app?.close(); await db?.close(); });
it('requires host permission and a session for the current tenant', async () => {
  for (const [cookie, status] of [['', 401], [client, 403], [restricted, 403], [foreign, 401], [platform, 401]] as const) await get({}, cookie).expect(status);
  await get().expect(200);
});
it('returns all imported statuses and business today without hiding historical or archived stays', async () => {
  const response = await get().expect(200); expect(BookingsPageSchema.safeParse(response.body).success).toBe(true);
  expect(response.body.today).toBe('2026-10-02'); expect(response.body.total).toBe(4);
  expect(response.body.items.map((b: { checkIn: string }) => b.checkIn)).toEqual(['2026-10-10', '2026-10-01', '2026-10-01', '2026-09-01']);
  expect(response.body.items.find((b: { listingId: string }) => b.listingId === archivedId)).toMatchObject({ listingTitle: 'Archived stay', checkOut: '2026-09-05', status: 'confirmed', guests: 4 });
  expect(response.body.items.every((b: object) => !('tenantId' in b))).toBe(true);
});
it('scopes listing IDs and combines half-open date overlap with imported status filters', async () => {
  expect((await get({ listingId: f.listingB.id }).expect(200)).body).toMatchObject({ items: [], total: 0 });
  expect((await get({ listingId: archivedId }).expect(200)).body.total).toBe(1);
  const overlapping = await get({ from: '2026-10-02', to: '2026-10-10' }).expect(200);
  expect(overlapping.body.items).toHaveLength(1); expect(overlapping.body.items[0].status).toBe('completed');
  expect((await get({ status: 'cancelled', from: '2026-10-10', to: '2026-10-11', listingId: f.listingA.id }).expect(200)).body.total).toBe(1);
});
it('keeps rows and total deterministic across bounded pages and an empty out-of-range page', async () => {
  const first = await get({ pageSize: 2 }).expect(200); const second = await get({ pageSize: 2, page: 2 }).expect(200);
  expect(new Set([...first.body.items, ...second.body.items].map(b => b.id)).size).toBe(4);
  expect((await get({ pageSize: 2 }).expect(200)).body).toEqual(first.body);
  expect((await get({ pageSize: 2, page: 100 }).expect(200)).body).toMatchObject({ items: [], total: 4, page: 100, pageSize: 2 });
});
it('rejects malformed, unbounded and unknown filters', async () => {
  for (const query of [{ listingId: 'no' }, { status: 'upcoming' }, { page: 0 }, { pageSize: 51 }, { from: '2026-10-01' }, { from: '2026-10-01', to: '2026-10-01' }, { from: '2026-01-01', to: '2028-01-01' }, { tenantId: f.b.id }]) await get(query).expect(400);
});
it('exposes no booking mutation routes and preserves original records', async () => {
  const before = await db.admin.booking.findMany({ where: { tenantId: f.a.id }, orderBy: { id: 'asc' } });
  for (const method of ['post', 'put', 'patch', 'delete'] as const) for (const suffix of ['', `/${before[0]!.id}`]) await request(app.getHttpServer())[method](`${path()}${suffix}`).set(calendarCsrf).set('Cookie', host).send({ status: 'cancelled' }).expect(404);
  expect(await db.admin.booking.findMany({ where: { tenantId: f.a.id }, orderBy: { id: 'asc' } })).toEqual(before);
});
it('rejects deleted-tenant booking access', async () => {
  const fixture = await inventoryFixture(db.admin); const cookie = await calendarAccount(db, fixture.a.id);
  await db.admin.tenant.update({ where: { id: fixture.a.id }, data: { deletedAt: calendarNow } });
  await request(app.getHttpServer()).get(`/api/v1/t/${fixture.a.slug}/host/bookings`).set('Cookie', cookie).expect(404);
});

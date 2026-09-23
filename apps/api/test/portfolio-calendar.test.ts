import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PortfolioCalendarPageSchema } from '@greenstate/contracts';
import { createApp } from '../src/bootstrap.js';
import { TenantDb } from '../src/db/tenant-db.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture, listingData } from './fixtures.js';
import { bookingData, calendarAccount, calendarNow } from './calendar-fixtures.js';

let db: TestDatabase; let app: INestApplication;
const range = { from: '2026-10-09', to: '2026-10-14' };
beforeAll(async () => {
  db = await createTestDatabase();
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, clock: { now: () => calendarNow }, log: () => {} });
  await app.listen(0);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await app?.close(); await db?.close(); });

// Pause only after the real PostgreSQL query finishes. The transaction, isolation
// level, query results, and later reads all remain those of the real repository.
function pauseAfterListingRead(operation: 'count' | 'findMany') {
  const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
  const database = app.get(TenantDb); const run = database.run.bind(database);
  let paused = false;
  const spy = vi.spyOn(database, 'run').mockImplementation((tenantId, fn, isolationLevel) => run(tenantId, async tx => {
    const listing = new Proxy(tx.listing, { get(target, property, receiver) {
      const read = Reflect.get(target, property, receiver);
      if (property !== operation) return read;
      return async (...args: unknown[]) => {
        const result: unknown = await Reflect.apply(read, target, args);
        if (!paused) { paused = true; entered.resolve(); await release.promise; }
        return result;
      };
    } });
    return fn(new Proxy(tx, { get: (target, property, receiver) => property === 'listing' ? listing : Reflect.get(target, property, receiver) }));
  }, isolationLevel));
  return { entered: entered.promise, release: release.resolve, restore: () => spy.mockRestore() };
}

it.each(['count', 'findMany'] as const)('keeps portfolio count, rows and spans in one snapshot when a writer commits after %s', async boundary => {
  const f = await inventoryFixture(db.admin); const host = await calendarAccount(db, f.a.id);
  const search = `Snapshot-${randomUUID()}`;
  const first = await db.admin.listing.create({ data: { ...listingData(f.a.id), title: `${search} A` } });
  const second = await db.admin.listing.create({ data: { ...listingData(f.a.id), title: `${search} B` } });
  const stay = await db.admin.booking.create({ data: bookingData(f.a.id, first.id) });
  const block = await db.admin.blockedDay.create({ data: { tenantId: f.a.id, listingId: first.id, date: new Date('2026-10-12'), reason: 'Before commit' } });
  const read = () => request(app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/host/calendar`).set('Cookie', host).query({ ...range, search });
  const barrier = pauseAfterListingRead(boundary); const pending = read().then(response => response);
  try {
    await barrier.entered;
    await db.admin.$transaction(async tx => {
      await tx.listing.create({ data: { ...listingData(f.a.id), title: `${search} C` } });
      await tx.listing.update({ where: { id: first.id }, data: { title: `${search} A updated` } });
      await tx.booking.create({ data: bookingData(f.a.id, first.id, '2026-10-13', '2026-10-14', 'cancelled') });
      await tx.booking.create({ data: bookingData(f.a.id, second.id, '2026-10-11', '2026-10-13') });
      await tx.blockedDay.delete({ where: { id: block.id } });
      await tx.blockedDay.create({ data: { id: block.id, tenantId: f.a.id, listingId: first.id, date: new Date('2026-10-12'), reason: 'After commit' } });
      await tx.blockedDay.create({ data: { tenantId: f.a.id, listingId: second.id, date: new Date('2026-10-10') } });
    });
    barrier.release();
    const response = await pending; expect(response.status).toBe(200);
    const page = PortfolioCalendarPageSchema.parse(response.body);
    expect(page.total).toBe(2);
    expect(page.items.map(item => ({ id: item.listing.id, title: item.listing.title }))).toEqual([
      { id: first.id, title: `${search} A` }, { id: second.id, title: `${search} B` },
    ]);
    expect(page.items[0]!.bookings).toEqual([{ id: stay.id, listingId: first.id, checkIn: '2026-10-10', checkOut: '2026-10-12', guests: 4, status: 'confirmed' }]);
    expect(page.items[0]!.days).toEqual([
      { date: '2026-10-09', status: 'available', bookingIds: [], block: null },
      { date: '2026-10-10', status: 'booked', bookingIds: [stay.id], block: null },
      { date: '2026-10-11', status: 'booked', bookingIds: [stay.id], block: null },
      { date: '2026-10-12', status: 'blocked', bookingIds: [], block: { id: block.id, reason: 'Before commit' } },
      { date: '2026-10-13', status: 'available', bookingIds: [], block: null },
    ]);
    expect(page.items[1]!.bookings).toEqual([]);
    expect(page.items[1]!.days).toEqual([
      { date: '2026-10-09', status: 'available', bookingIds: [], block: null },
      { date: '2026-10-10', status: 'available', bookingIds: [], block: null },
      { date: '2026-10-11', status: 'available', bookingIds: [], block: null },
      { date: '2026-10-12', status: 'available', bookingIds: [], block: null },
      { date: '2026-10-13', status: 'available', bookingIds: [], block: null },
    ]);
    barrier.restore();
    const fresh = PortfolioCalendarPageSchema.parse((await read().expect(200)).body);
    expect(fresh.total).toBe(3); expect(fresh.items).toHaveLength(3);
    expect(fresh.items[0]!.listing.title).toBe(`${search} A updated`);
    expect(fresh.items[0]!.bookings.map(booking => booking.status)).toEqual(['confirmed', 'cancelled']);
    expect(fresh.items[0]!.days[3]!.block).toEqual({ id: block.id, reason: 'After commit' });
    expect(fresh.items[1]!.days.map(day => day.status)).toEqual(['available', 'blocked', 'booked', 'booked', 'available']);
  } finally { barrier.release(); barrier.restore(); await pending; }
});

it('preserves overlapping bookings and legacy blocks while cancelled stays leave portfolio nights free', async () => {
  const f = await inventoryFixture(db.admin); const host = await calendarAccount(db, f.a.id);
  const search = `Legacy-${randomUUID()}`;
  const listing = await db.admin.listing.create({ data: { ...listingData(f.a.id), title: search } });
  const foreign = await db.admin.listing.create({ data: { ...listingData(f.b.id), title: search } });
  const first = await db.admin.booking.create({ data: bookingData(f.a.id, listing.id) });
  const second = await db.admin.booking.create({ data: bookingData(f.a.id, listing.id, '2026-10-11', '2026-10-13', 'completed') });
  const cancelled = await db.admin.booking.create({ data: bookingData(f.a.id, listing.id, '2026-10-13', '2026-10-14', 'cancelled') });
  const legacy = await db.admin.blockedDay.create({ data: { tenantId: f.a.id, listingId: listing.id, date: new Date('2026-10-11'), reason: 'Legacy overlap' } });
  const manual = await db.admin.blockedDay.create({ data: { tenantId: f.a.id, listingId: listing.id, date: new Date('2026-10-09'), reason: 'Maintenance' } });
  await db.admin.booking.create({ data: bookingData(f.b.id, foreign.id, '2026-10-09', '2026-10-14') });
  await db.admin.blockedDay.create({ data: { tenantId: f.b.id, listingId: foreign.id, date: new Date('2026-10-13'), reason: 'Other tenant' } });
  const response = await request(app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/host/calendar`).set('Cookie', host).query({ ...range, search }).expect(200);
  const page = PortfolioCalendarPageSchema.parse(response.body);
  expect(page.total).toBe(1); expect(page.items).toHaveLength(1); expect(page.items[0]!.listing.id).toBe(listing.id);
  expect(page.items[0]!.bookings).toEqual([
    { id: first.id, listingId: listing.id, checkIn: '2026-10-10', checkOut: '2026-10-12', guests: 4, status: 'confirmed' },
    { id: second.id, listingId: listing.id, checkIn: '2026-10-11', checkOut: '2026-10-13', guests: 4, status: 'completed' },
    { id: cancelled.id, listingId: listing.id, checkIn: '2026-10-13', checkOut: '2026-10-14', guests: 4, status: 'cancelled' },
  ]);
  expect(page.items[0]!.days).toEqual([
    { date: '2026-10-09', status: 'blocked', bookingIds: [], block: { id: manual.id, reason: 'Maintenance' } },
    { date: '2026-10-10', status: 'booked', bookingIds: [first.id], block: null },
    { date: '2026-10-11', status: 'booked', bookingIds: [first.id, second.id], block: { id: legacy.id, reason: 'Legacy overlap' } },
    { date: '2026-10-12', status: 'booked', bookingIds: [second.id], block: null },
    { date: '2026-10-13', status: 'available', bookingIds: [], block: null },
  ]);
});

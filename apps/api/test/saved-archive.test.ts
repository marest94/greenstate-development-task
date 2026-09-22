import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { Passwords } from '../src/identity/passwords.js';
import * as locks from '../src/listings/listing-lock.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
let db: TestDatabase; let app: INestApplication; let hash: string;
let f: Awaited<ReturnType<typeof inventoryFixture>>; let clientCookie: string; let hostCookie: string;
const csrf = { Origin: 'http://localhost:5173', 'X-Requested-By': 'greenstate-web' }; const password = 'An archive race test password';
let now = new Date('2026-09-22T12:00:00Z');
const savePath = () => `/api/v1/t/${f.a.slug}/me/saved-listings`;
const hostPath = () => `/api/v1/t/${f.a.slug}/host/listings/${f.listingA.id}`;
const save = () => request(app.getHttpServer()).put(`${savePath()}/${f.listingA.id}`).set(csrf).set('Cookie', clientCookie);
const archive = (version = 1) => request(app.getHttpServer()).post(`${hostPath()}/archive`).set(csrf).set('Cookie', hostCookie).send({ version });
beforeAll(async () => {
  db = await createTestDatabase(); hash = await new Passwords().hash(password);
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, clock: { now: () => now }, log: () => {} }); await app.listen(0);
});
beforeEach(async () => {
  now = new Date(now.getTime() + 16 * 60000); f = await inventoryFixture(db.admin);
  async function account(role: string) {
    const user = await db.admin.tenantUser.create({ data: { tenantId: f.a.id, email: `${randomUUID()}@example.test`, passwordHash: hash, role } });
    const response = await request(app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/auth/login`).set(csrf).send({ email: user.email, password }).expect(200);
    return (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  }
  clientCookie = await account('client'); hostCookie = await account('host');
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await app?.close(); await db?.close(); });
function holdFirstListingLock() {
  const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>(); const original = locks.lockListing;
  vi.spyOn(locks, 'lockListing').mockImplementationOnce(async (...args) => { const listing = await original(...args); entered.resolve(); await release.promise; return listing; });
  return { entered: entered.promise, release: release.resolve };
}
async function expectBlockedListingWriter() {
  // Wait for an observed database lock, not for an assumed amount of transaction time.
  await vi.waitFor(async () => {
    const result = await db.server.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1 AND usename = 'gs_app' AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'", [db.name]);
    expect(result.rows[0].count).toBeGreaterThan(0);
  }, { timeout: 2000, interval: 10 });
}
it('rejects a save waiting behind a committed archive without inserting a new saved row', async () => {
  const barrier = holdFirstListingLock(); const winner = archive().then(r => r); let waiter: Promise<{ status: number }> | undefined;
  try {
    await barrier.entered; waiter = save().then(r => r); await expectBlockedListingWriter(); barrier.release();
    expect((await winner).status).toBe(200); expect((await waiter).status).toBe(404);
    expect(await db.admin.savedListing.count({ where: { listingId: f.listingA.id } })).toBe(0);
  } finally { barrier.release(); await winner; await waiter; }
});
it('allows a save that locks first, then archives the listing and retains an unavailable saved entry', async () => {
  const barrier = holdFirstListingLock(); const winner = save().then(r => r); let waiter: Promise<{ status: number }> | undefined;
  try {
    await barrier.entered; waiter = archive().then(r => r); await expectBlockedListingWriter(); barrier.release();
    expect((await winner).status).toBe(204); expect((await waiter).status).toBe(200);
    const response = await request(app.getHttpServer()).get(savePath()).set('Cookie', clientCookie).expect(200);
    expect(response.body.items).toEqual([{ listingId: f.listingA.id, savedAt: expect.any(String), listing: null }]);
  } finally { barrier.release(); await winner; await waiter; }
});
it('joins real save, archive, restore and unavailable removal endpoints without losing a retained save', async () => {
  await save().expect(204); const archived = await archive().expect(200);
  expect((await request(app.getHttpServer()).get(savePath()).set('Cookie', clientCookie).expect(200)).body.items[0].listing).toBeNull();
  const restored = await request(app.getHttpServer()).post(`${hostPath()}/restore`).set(csrf).set('Cookie', hostCookie).send({ version: archived.body.version }).expect(200);
  expect((await request(app.getHttpServer()).get(savePath()).set('Cookie', clientCookie).expect(200)).body.items[0].listing.id).toBe(f.listingA.id);
  await archive(restored.body.version).expect(200);
  await request(app.getHttpServer()).delete(`${savePath()}/${f.listingA.id}`).set(csrf).set('Cookie', clientCookie).expect(204);
  expect((await request(app.getHttpServer()).get(savePath()).set('Cookie', clientCookie).expect(200)).body.items).toEqual([]);
});

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';
import { TenantDb } from '../src/db/tenant-db.js';
import { AdminDb } from '../src/db/admin-db.js';
import { Passwords } from '../src/identity/passwords.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture, listingData } from './fixtures.js';
let db: TestDatabase; let app: INestApplication;
let f: Awaited<ReturnType<typeof inventoryFixture>>;
let users: Awaited<ReturnType<typeof account>>[];
const origin = 'http://localhost:5173'; const password = 'A sufficiently long test password';
const csrf = { Origin: origin, 'X-Requested-By': 'greenstate-web' };
let passwordHash: string; let now = new Date('2026-09-22T12:00:00Z');
async function account(tenantId: string, slug: string, role = 'client', mustChangePassword = false) {
  const user = await db.admin.tenantUser.create({ data: { tenantId, email: `${randomUUID()}@example.test`, passwordHash, role, mustChangePassword } });
  const login = await request(app.getHttpServer()).post(`/api/v1/t/${slug}/auth/login`).set(csrf).send({ email: user.email, password }).expect(200);
  return { ...user, cookie: (login.headers['set-cookie'] as unknown as string[]).map(v => v.split(';')[0]).join('; ') };
}
const path = (id = '', slug = f.a.slug) => `/api/v1/t/${slug}/me/saved-listings${id ? `/${id}` : ''}`;
const get = (owner = users[0]!) => request(app.getHttpServer()).get(path()).set('Cookie', owner.cookie);
const put = (id = f.listingA.id, owner = users[0]!) => request(app.getHttpServer()).put(path(id)).set(csrf).set('Cookie', owner.cookie);
const remove = (id = f.listingA.id, owner = users[0]!) => request(app.getHttpServer()).delete(path(id)).set(csrf).set('Cookie', owner.cookie);
beforeAll(async () => {
  db = await createTestDatabase(1); passwordHash = await new Passwords().hash(password);
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, config: loadConfig({ APP_ORIGIN: origin }), clock: { now: () => now }, log: () => {} }); await app.listen(0);
});
beforeEach(async () => {
  now = new Date(now.getTime() + 16 * 60 * 1000);
  f = await inventoryFixture(db.admin);
  users = await Promise.all([account(f.a.id, f.a.slug), account(f.a.id, f.a.slug), account(f.a.id, f.a.slug, 'host'), account(f.b.id, f.b.slug)]);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await app?.close(); await db?.close(); });
describe('Private saved listings HTTP', () => {
  it('saves idempotently and returns only the owner’s entries, including for hosts', async () => {
    await put().expect(204); const first = await get().expect(200); await put().expect(204);
    expect(first.body).toMatchObject({ total: 1, page: 1, pageSize: 20, items: [{ listingId: f.listingA.id, listing: { id: f.listingA.id, title: f.listingA.title } }] });
    expect((await get().expect(200)).body).toEqual(first.body);
    expect(first.headers['cache-control']).toBe('no-store');
    for (const other of [users[1]!, users[2]!]) { expect((await get(other).expect(200)).body.items).toEqual([]); await remove(f.listingA.id, other).expect(204); }
    expect((await get().expect(200)).body.total).toBe(1);
    await put(f.listingA.id, users[2]!).expect(204); expect((await get(users[2]!).expect(200)).body.total).toBe(1);
  });
  it('removes only its own entry and makes an absent removal idempotent', async () => {
    await put().expect(204); await remove().expect(204); await remove().expect(204);
    expect((await get().expect(200)).body.items).toEqual([]);
  });
  it('requires unrestricted sessions and the same-origin CSRF header', async () => {
    await request(app.getHttpServer()).get(path()).expect(401);
    await request(app.getHttpServer()).put(path(f.listingA.id)).set(csrf).expect(401);
    const restricted = await account(f.a.id, f.a.slug, 'host', true);
    for (const action of [() => get(restricted), () => put(f.listingA.id, restricted), () => remove(f.listingA.id, restricted)]) {
      const response = await action().expect(403); expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    await request(app.getHttpServer()).put(path(f.listingA.id)).set('Cookie', users[0]!.cookie).expect(403);
    await request(app.getHttpServer()).delete(path(f.listingA.id)).set('Cookie', users[0]!.cookie).set('Origin', 'https://other.example').set('X-Requested-By', 'greenstate-web').expect(403);
  });
  it('treats foreign, missing, and archived saves as the same not-found response', async () => {
    await db.admin.listing.update({ where: { id: f.listingA.id }, data: { archivedAt: new Date() } });
    for (const id of [f.listingA.id, f.listingB.id, randomUUID()]) {
      const response = await put(id).expect(404); expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
    }
    await get(users[3]!).expect(401);
    const cross = await request(app.getHttpServer()).get(path('', f.b.slug)).set('Cookie', users[3]!.cookie).expect(200);
    expect(cross.body.total).toBe(0);
  });
  it('retains an unavailable entry without archived facts, restores visibility, and permits removal', async () => {
    await put().expect(204); await db.admin.listing.update({ where: { id: f.listingA.id }, data: { archivedAt: new Date() } });
    const archived = (await get().expect(200)).body.items[0];
    expect(archived).toEqual({ listingId: f.listingA.id, savedAt: expect.any(String), listing: null });
    await db.admin.listing.update({ where: { id: f.listingA.id }, data: { archivedAt: null } });
    expect((await get().expect(200)).body.items[0].listing.id).toBe(f.listingA.id);
    await db.admin.listing.update({ where: { id: f.listingA.id }, data: { archivedAt: new Date() } }); await remove().expect(204);
    expect((await get().expect(200)).body.total).toBe(0);
  });
  it('paginates deterministically and filters up to 50 listing IDs in one owner-scoped request', async () => {
    const listings = await Promise.all(Array.from({ length: 3 }, () => db.admin.listing.create({ data: listingData(f.a.id) })));
    for (const listing of listings) await put(listing.id).expect(204);
    const all = (await get().expect(200)).body;
    const second = (await get().query({ page: 2, pageSize: 1 }).expect(200)).body;
    expect(second.total).toBe(3); expect(second.items).toEqual([all.items[1]]);
    expect((await get().query({ page: 5, pageSize: 1 }).expect(200)).body).toMatchObject({ total: 3, items: [] });
    const filtered = (await get().query({ listingIds: [listings[0]!.id, listings[2]!.id].join(',') }).expect(200)).body;
    expect(filtered.total).toBe(2); expect(filtered.items.map((item: { listingId: string }) => item.listingId).sort()).toEqual([listings[0]!.id, listings[2]!.id].sort());
    expect((await get(users[1]!).query({ listingIds: listings[0]!.id }).expect(200)).body.total).toBe(0);
  });
  it('rejects malformed filters, body fields and ownership injection', async () => {
    for (const query of [{ userId: users[1]!.id }, { tenantId: f.b.id }, { listingIds: 'invalid' }, { listingIds: Array.from({ length: 51 }, () => randomUUID()).join(',') }, { page: 0 }, { pageSize: 51 }]) await get().query(query).expect(400);
    for (const body of [{ userId: users[1]!.id }, { tenantId: f.b.id }, { role: 'host' }]) { await put().send(body).expect(400); await remove().send(body).expect(400); }
    await put('invalid').expect(400); await put().query({ userId: users[1]!.id }).expect(400);
  });
  it('blocks deleted tenants while retaining saved rows', async () => {
    await put().expect(204); await db.admin.tenant.update({ where: { id: f.a.id }, data: { deletedAt: new Date() } });
    await get().expect(404); await put().expect(404); await remove().expect(404);
    const rows = await db.admin.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_listings WHERE tenant_id = ${f.a.id}::uuid`;
    expect(rows[0]!.n).toBe(1);
  });
});

it.each(['PUT', 'DELETE'] as const)('rejects %s if tenant deletion commits between guard authorization and the saved mutation', async method => {
  await put().expect(204);
  const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
  const tenantDb = app.get(TenantDb); const original = tenantDb.runForUser.bind(tenantDb);
  vi.spyOn(tenantDb, 'runForUser').mockImplementationOnce(async (tenantId, userId, fn) => { entered.resolve(); await release.promise; return original(tenantId, userId, fn); });
  const pending = (method === 'PUT' ? put() : remove()).then(response => response);
  const privileged = new AdminDb(db.urls.admin);
  try {
    await entered.promise;
    await privileged.forTenant(f.a.id, 'exclusive', tx => tx.tenant.update({ where: { id: f.a.id }, data: { deletedAt: now } }));
    release.resolve(); expect((await pending).status).toBe(404);
    expect(await db.admin.savedListing.count({ where: { tenantId: f.a.id, userId: users[0]!.id } })).toBe(1);
  } finally { release.resolve(); await pending; await privileged.close(); }
});

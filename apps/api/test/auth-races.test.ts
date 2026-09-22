import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { Passwords } from '../src/identity/passwords.js';
import { SessionsRepository } from '../src/identity/sessions.repository.js';
import { AdminDb } from '../src/db/admin-db.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
let db: TestDatabase; let app: INestApplication; let admin: AdminDb;
let f: Awaited<ReturnType<typeof inventoryFixture>>;
let now = new Date('2026-10-01T12:00:00Z');
const password = 'The original password for race tests'; const changed = 'The replacement password for race tests'; const loser = 'The stale password must not replace the winner';
const csrf = { Origin: 'http://localhost:5173', 'X-Requested-By': 'greenstate-web' };
const cookie = (r: { headers: Record<string, unknown> }) => (r.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
const post = (path: string) => request(app.getHttpServer()).post(path).set(csrf);
beforeAll(async () => { db = await createTestDatabase(); admin = new AdminDb(db.urls.admin); f = await inventoryFixture(db.admin); app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, clock: { now: () => now }, log: () => {} }); await app.init(); });
beforeEach(() => { now = new Date(now.getTime() + 16 * 60000); });
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await app?.close(); await admin?.close(); await db?.close(); });
async function account(realm: 'tenant' | 'platform') {
  const data = { email: `race-${randomUUID()}@example.test`, passwordHash: await new Passwords().hash(password) };
  const user = realm === 'tenant' ? await db.admin.tenantUser.create({ data: { ...data, tenantId: f.a.id } }) : await db.admin.platformUser.create({ data });
  const base = realm === 'tenant' ? `/api/v1/t/${f.a.slug}/auth` : '/api/v1/admin/auth';
  const login = await post(`${base}/login`).send({ email: user.email, password }).expect(200);
  return { user, base, cookie: cookie(login) };
}
function pauseVerification() {
  const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>(); const passwords = app.get(Passwords); const original = passwords.verify.bind(passwords);
  vi.spyOn(passwords, 'verify').mockImplementationOnce(async (digest, input) => { const valid = await original(digest, input); entered.resolve(); await release.promise; return valid; });
  return { entered: entered.promise, release: release.resolve };
}
for (const realm of ['tenant', 'platform'] as const) describe(`${realm} credential races`, () => {
  it('rejects an old-password login verified before a password change commits', async () => {
    const a = await account(realm); const barrier = pauseVerification();
    const delayed = post(`${a.base}/login`).send({ email: a.user.email, password }).then(r => r);
    try {
      await barrier.entered;
      const winner = await post(`${a.base}/password`).set('Cookie', a.cookie).send({ currentPassword: password, newPassword: changed }).expect(200);
      barrier.release(); expect((await delayed).status).toBe(401);
      await request(app.getHttpServer()).get(`${a.base}/me`).set('Cookie', cookie(winner)).expect(200);
      const count = realm === 'tenant' ? await db.admin.tenantSession.count({ where: { userId: a.user.id } }) : await db.admin.platformSession.count({ where: { userId: a.user.id } }); expect(count).toBe(1);
    } finally { barrier.release(); await delayed; }
  });
  it('revokes a login that commits before the password change', async () => {
    const a = await account(realm); const login = await post(`${a.base}/login`).send({ email: a.user.email, password }).expect(200);
    await post(`${a.base}/password`).set('Cookie', a.cookie).send({ currentPassword: password, newPassword: changed }).expect(200);
    await request(app.getHttpServer()).get(`${a.base}/me`).set('Cookie', cookie(login)).expect(401);
  });
  it('does not let a concurrent stale password change overwrite the winner', async () => {
    const a = await account(realm); const barrier = pauseVerification();
    const delayed = post(`${a.base}/password`).set('Cookie', a.cookie).send({ currentPassword: password, newPassword: loser }).then(r => r);
    try {
      await barrier.entered;
      const winner = await post(`${a.base}/password`).set('Cookie', a.cookie).send({ currentPassword: password, newPassword: changed }).expect(200);
      barrier.release(); expect((await delayed).status).toBe(401);
      await request(app.getHttpServer()).get(`${a.base}/me`).set('Cookie', cookie(winner)).expect(200);
      await post(`${a.base}/login`).send({ email: a.user.email, password: changed }).expect(200);
      await post(`${a.base}/login`).send({ email: a.user.email, password: loser }).expect(401);
    } finally { barrier.release(); await delayed; }
  });
});
describe('Tenant deletion between authorization and identity writes', () => {
  it.each(['register', 'login', 'password', 'logout'])('rejects %s after tenant deletion commits', async action => {
    const fixture = await inventoryFixture(db.admin); const base = `/api/v1/t/${fixture.a.slug}/auth`;
    const address = `deletion-${randomUUID()}@example.test`; const initial = await post(`${base}/register`).send({ email: address, password }).expect(201);
    const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>(); const repository = app.get(SessionsRepository); const original = repository.write.bind(repository);
    vi.spyOn(repository, 'write').mockImplementationOnce(async (tenantId, fn) => { entered.resolve(); await release.promise; return original(tenantId, fn); });
    const body = action === 'password' ? { currentPassword: password, newPassword: changed } : { email: action === 'register' ? `second-${address}` : address, password };
    const delayed = post(`${base}/${action}`).set('Cookie', cookie(initial)).send(body).then(r => r);
    try {
      await entered.promise;
      await admin.forTenant(fixture.a.id, 'exclusive', tx => tx.tenant.update({ where: { id: fixture.a.id }, data: { deletedAt: now } }));
      release.resolve(); expect((await delayed).status).toBe(404);
    } finally { release.resolve(); await delayed; }
  });
});

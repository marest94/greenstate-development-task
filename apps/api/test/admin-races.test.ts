import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Passwords } from '../src/identity/passwords.js';
import { AdminDb } from '../src/db/admin-db.js';
import { adminHarness, cookie, csrf, password, temporaryPassword, type AdminHarness, type AdminFixture } from './admin-fixtures.js';
let h: AdminHarness; let f: AdminFixture;
beforeAll(async () => { h = await adminHarness(); }); beforeEach(async () => { f = await h.fixture(); }); afterEach(() => vi.restoreAllMocks()); afterAll(async () => { await h?.close(); });
const action = (name: string, id = name === 'promote-host' ? f.client.user.id : f.host.user.id) => request(h.app.getHttpServer()).post(`/api/v1/admin/tenants/${f.a.id}/accounts/${id}/${name}`).set(csrf).set('Cookie', f.admin.cookie).send(name === 'disable' || name === 'enable' ? {} : { temporaryPassword });
for (const name of ['password-reset', 'promote-host', 'disable']) it.each(['login', 'password'])(`rejects stale %s credentials validated before ${name} commits`, async method => {
  const target = name === 'promote-host' ? f.client : f.host; const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
  const passwords = h.app.get(Passwords); const verify = passwords.verify.bind(passwords);
  vi.spyOn(passwords, 'verify').mockImplementationOnce(async (hash, value) => { const valid = await verify(hash, value); entered.resolve(); await release.promise; return valid; });
  const delayed = request(h.app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/auth/${method}`).set(csrf).set('Cookie', target.cookie).send(method === 'login' ? { email: target.user.email, password } : { currentPassword: password, newPassword: 'A stale password which must not win' }).then(r => r);
  try { await entered.promise; await action(name).expect(204); release.resolve(); expect((await delayed).status).toBe(401); expect(await h.db.admin.tenantSession.count({ where: { userId: target.user.id } })).toBe(0); }
  finally { release.resolve(); await delayed; }
});
it('rejects a pending login after disabling and re-enabling while accepting a fresh login', async () => {
  const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>();
  const passwords = h.app.get(Passwords); const verify = passwords.verify.bind(passwords);
  vi.spyOn(passwords, 'verify').mockImplementationOnce(async (hash, value) => { const valid = await verify(hash, value); entered.resolve(); await release.promise; return valid; });
  const base = `/api/v1/t/${f.a.slug}/auth`;
  const login = () => request(h.app.getHttpServer()).post(`${base}/login`).set(csrf).send({ email: f.host.user.email, password });
  const delayed = login().then(r => r);
  try {
    await entered.promise;
    await action('disable').expect(204); await action('enable').expect(204);
    release.resolve();
    const stale = await delayed;
    expect(stale.status).toBe(401); expect(stale.body.code).toBe('INVALID_CREDENTIALS'); expect(stale.headers['set-cookie']).toBeUndefined();
    expect(await h.db.admin.tenantSession.count({ where: { userId: f.host.user.id } })).toBe(0);
    const fresh = await login().expect(200);
    await request(h.app.getHttpServer()).get(`${base}/me`).set('Cookie', cookie(fresh)).expect(200);
    await request(h.app.getHttpServer()).get(`${base}/me`).set('Cookie', f.host.cookie).expect(401);
  } finally { release.resolve(); await delayed; }
});
it.each(['password-reset', 'promote-host', 'disable'])('revokes a login that commits before %s', async name => {
  const target = name === 'promote-host' ? f.client : f.host;
  const login = await request(h.app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/auth/login`).set(csrf).send({ email: target.user.email, password }).expect(200);
  await action(name).expect(204); await request(h.app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/auth/me`).set('Cookie', cookie(login)).expect(401);
});
it.each(['create-host', 'password-reset', 'promote-host', 'enable'])('rejects %s after tenant deletion commits while its authorized transaction waits', async name => {
  if (name === 'enable') await action('disable').expect(204);
  const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>(); const db = h.app.get(AdminDb); const original = db.forTenant.bind(db);
  vi.spyOn(db, 'forTenant').mockImplementationOnce(async (tenantId, mode, fn) => { entered.resolve(); await release.promise; return original(tenantId, mode, fn); });
  const pending = (name === 'create-host' ? request(h.app.getHttpServer()).post(`/api/v1/admin/tenants/${f.a.id}/hosts`).set(csrf).set('Cookie', f.admin.cookie).send({ name: 'Delayed host', email: 'delayed@example.test', temporaryPassword }) : action(name)).then(r => r);
  try {
    await entered.promise; await request(h.app.getHttpServer()).delete(`/api/v1/admin/tenants/${f.a.id}`).set(csrf).set('Cookie', f.admin.cookie).expect(204);
    release.resolve(); expect((await pending).status).toBe(404); expect(await h.db.admin.tenantSession.count({ where: { tenantId: f.a.id } })).toBe(0);
    expect(await h.db.admin.tenantUser.count({ where: { tenantId: f.a.id } })).toBe(2);
  } finally { release.resolve(); await pending; }
});

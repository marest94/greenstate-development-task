import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Passwords } from '../src/identity/passwords.js';
import { adminHarness, cookie, csrf, password, temporaryPassword, type AdminHarness, type AdminFixture } from './admin-fixtures.js';
let h: AdminHarness; let f: AdminFixture;
const base = () => `/api/v1/admin/tenants/${f.a.id}`;
const action = (id: string, name: string) => request(h.app.getHttpServer()).post(`${base()}/accounts/${id}/${name}`).set(csrf).set('Cookie', f.admin.cookie);
const login = (email: string, input = password) => request(h.app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/auth/login`).set(csrf).send({ email, password: input });
const saved = (auth: string) => request(h.app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/me/saved-listings`).set('Cookie', auth);
beforeAll(async () => { h = await adminHarness(); }); beforeEach(async () => { f = await h.fixture(); }); afterEach(() => vi.restoreAllMocks()); afterAll(async () => { await h?.close(); });
it('exposes only tenant-scoped metadata with bounded pagination and role/email/state filters', async () => {
  const get = () => request(h.app.getHttpServer()).get(`${base()}/accounts`).set('Cookie', f.admin.cookie);
  const all = await get().expect(200); expect(all.body.total).toBe(2);
  expect(all.body.items.map((row: { id: string }) => row.id).sort()).toEqual([f.host.user.id, f.client.user.id].sort());
  expect(Object.keys(all.body.items[0]).sort()).toEqual(['createdAt', 'disabledAt', 'email', 'id', 'mustChangePassword', 'name', 'role', 'tenantId']);
  expect((await get().query({ role: 'client', email: f.client.user.email.toUpperCase() }).expect(200)).body.items[0].id).toBe(f.client.user.id);
  expect((await get().query({ page: 2, pageSize: 1 }).expect(200)).body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
  await action(f.host.user.id, 'disable').expect(204); expect((await get().query({ status: 'disabled' }).expect(200)).body.total).toBe(1);
  for (const query of [{ role: 'superadmin' }, { pageSize: 51 }, { userId: f.foreign.user.id }]) await get().query(query).expect(400);
});
it('requires platform credentials and CSRF for every account transition and never follows foreign user IDs', async () => {
  for (const name of ['disable', 'enable', 'password-reset', 'promote-host']) {
    const body = name === 'disable' || name === 'enable' ? {} : { temporaryPassword };
    for (const auth of ['', f.client.cookie, f.host.cookie]) await request(h.app.getHttpServer()).post(`${base()}/accounts/${f.host.user.id}/${name}`).set(csrf).set('Cookie', auth).send(body).expect(401);
    await request(h.app.getHttpServer()).post(`${base()}/accounts/${f.host.user.id}/${name}`).set('Cookie', f.admin.cookie).send(body).expect(403);
    await action(f.foreign.user.id, name).send(body).expect(404); await action(randomUUID(), name).send(body).expect(404);
  }
});
it('disables the entire host account, revokes sessions and preserves identity/saved data through re-enable', async () => {
  await h.db.admin.savedListing.create({ data: { tenantId: f.a.id, userId: f.host.user.id, listingId: f.listingA.id } });
  await action(f.host.user.id, 'disable').expect(204); const disabled = await h.db.admin.tenantUser.findUniqueOrThrow({ where: { id: f.host.user.id } });
  await action(f.host.user.id, 'disable').expect(204); expect((await h.db.admin.tenantUser.findUniqueOrThrow({ where: { id: f.host.user.id } })).disabledAt).toEqual(disabled.disabledAt);
  await saved(f.host.cookie).expect(401); await login(f.host.user.email).expect(401);
  expect(await h.db.admin.tenantSession.count({ where: { userId: f.host.user.id } })).toBe(0);
  await action(f.host.user.id, 'enable').expect(204); await action(f.host.user.id, 'enable').expect(204);
  await saved(f.host.cookie).expect(401); const renewed = await login(f.host.user.email).expect(200);
  expect((await saved(cookie(renewed)).expect(200)).body.total).toBe(1); expect(renewed.body).toMatchObject({ id: f.host.user.id, role: 'host', mustChangePassword: false });
});
it('does not disable clients or promote accounts which are already hosts', async () => {
  await action(f.client.user.id, 'disable').expect(400); await action(f.client.user.id, 'enable').expect(400);
  await action(f.host.user.id, 'promote-host').send({ temporaryPassword }).expect(409);
  expect((await h.db.admin.tenantUser.findUniqueOrThrow({ where: { id: f.client.user.id } })).role).toBe('client');
});
it.each(['client', 'host'] as const)('resets %s credentials, revokes all sessions and retains saves behind first-login restrictions', async role => {
  const a = f[role]; await h.db.admin.savedListing.create({ data: { tenantId: f.a.id, userId: a.user.id, listingId: f.listingA.id } });
  const second = await login(a.user.email).expect(200);
  const response = await action(a.user.id, 'password-reset').send({ temporaryPassword }).expect(204); expect(response.headers['set-cookie']).toBeUndefined(); expect(response.text).toBe('');
  await login(a.user.email).expect(401); await saved(a.cookie).expect(401); await saved(cookie(second)).expect(401);
  const forced = await login(a.user.email, temporaryPassword).expect(200); expect(forced.body.mustChangePassword).toBe(true);
  expect((await saved(cookie(forced)).expect(403)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  const changed = await request(h.app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/auth/password`).set(csrf).set('Cookie', cookie(forced)).send({ currentPassword: temporaryPassword, newPassword: 'The final chosen account password' }).expect(200);
  expect(changed.body).toMatchObject({ id: a.user.id, role, mustChangePassword: false }); expect((await saved(cookie(changed)).expect(200)).body.total).toBe(1);
  expect(h.logs.join('\n')).not.toContain(temporaryPassword);
});
it('explicitly promotes an existing client with a fresh temporary password and keeps its shortlist', async () => {
  await h.db.admin.savedListing.create({ data: { tenantId: f.a.id, userId: f.client.user.id, listingId: f.listingA.id } });
  await action(f.client.user.id, 'promote-host').send({ temporaryPassword }).expect(204);
  await login(f.client.user.email).expect(401); await saved(f.client.cookie).expect(401);
  const forced = await login(f.client.user.email, temporaryPassword).expect(200); expect(forced.body).toMatchObject({ id: f.client.user.id, role: 'host', mustChangePassword: true });
  await request(h.app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/host/listings`).set('Cookie', cookie(forced)).expect(403);
  const changed = await request(h.app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/auth/password`).set(csrf).set('Cookie', cookie(forced)).send({ currentPassword: temporaryPassword, newPassword: 'A promoted host personal password' }).expect(200);
  await request(h.app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/host/listings`).set('Cookie', cookie(changed)).expect(200); expect((await saved(cookie(changed)).expect(200)).body.total).toBe(1);
});
it('does not re-enable a disabled host during reset and retains the forced change after enabling', async () => {
  await action(f.host.user.id, 'disable').expect(204); await action(f.host.user.id, 'password-reset').send({ temporaryPassword }).expect(204);
  await login(f.host.user.email, temporaryPassword).expect(401); await action(f.host.user.id, 'enable').expect(204);
  const forced = await login(f.host.user.email, temporaryPassword).expect(200); expect(forced.body.mustChangePassword).toBe(true); await saved(cookie(forced)).expect(403);
});
it('rejects unexpected state/role/ownership fields in lifecycle input', async () => {
  for (const name of ['disable', 'enable']) await action(f.host.user.id, name).send({ disabledAt: null }).expect(400);
  for (const name of ['password-reset', 'promote-host']) for (const extra of [{ tenantId: f.b.id }, { userId: f.foreign.user.id }, { role: 'host' }, { mustChangePassword: false }, { temporaryPassword: 'short' }]) await action(f.client.user.id, name).send({ temporaryPassword, ...extra }).expect(400);
});
it.each(['create', 'password-reset', 'promote-host'])('limits %s before hashing excess requests', async name => {
  const hash = vi.spyOn(h.app.get(Passwords), 'hash');
  for (let n = 0; n < 10; n++) {
    if (name === 'create') await request(h.app.getHttpServer()).post(`${base()}/hosts`).set(csrf).set('Cookie', f.admin.cookie).send({ name: 'Host', email: `${randomUUID()}@example.test`, temporaryPassword }).expect(201);
    else await action(name === 'promote-host' ? f.client.user.id : f.host.user.id, name).send({ temporaryPassword }).expect(name === 'promote-host' && n > 0 ? 409 : 204);
  }
  const count = hash.mock.calls.length;
  const response = name === 'create' ? await request(h.app.getHttpServer()).post(`${base()}/hosts`).set(csrf).set('Cookie', f.admin.cookie).send({ name: 'Host', email: `${randomUUID()}@example.test`, temporaryPassword }).expect(429) : await action(f.host.user.id, name).send({ temporaryPassword }).expect(429);
  expect(hash).toHaveBeenCalledTimes(count); expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
});

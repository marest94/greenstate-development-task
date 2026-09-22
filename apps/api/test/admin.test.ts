import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import request from 'supertest';
import { adminHarness, csrf, password, temporaryPassword, type AdminHarness, type AdminFixture } from './admin-fixtures.js';
let h: AdminHarness; let f: AdminFixture;
const base = '/api/v1/admin/tenants';
const createBody = () => ({ name: 'New tenant', slug: `new-${randomUUID()}`, timezone: 'Europe/Berlin' });
const post = (path = base) => request(h.app.getHttpServer()).post(path).set(csrf).set('Cookie', f.admin.cookie);
const get = (path = base) => request(h.app.getHttpServer()).get(path).set('Cookie', f.admin.cookie);
beforeAll(async () => { h = await adminHarness(); }); beforeEach(async () => { f = await h.fixture(); }); afterAll(async () => { await h?.close(); });
it('requires platform permissions and rejects tenant or forced platform sessions', async () => {
  for (const auth of ['', f.host.cookie, f.client.cookie, f.foreign.cookie]) {
    await request(h.app.getHttpServer()).get(base).set('Cookie', auth).expect(401);
    await request(h.app.getHttpServer()).post(base).set(csrf).set('Cookie', auth).send(createBody()).expect(401);
  }
  const forced = await h.platformAccount(true);
  const response = await request(h.app.getHttpServer()).get(base).set('Cookie', forced.cookie).expect(403); expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
});
it('creates a tenant and exposes only safe registry metadata and a usable public portal', async () => {
  const input = { ...createBody(), primaryColor: '#234567', contactEmail: '  CONTACT@EXAMPLE.TEST  ' };
  const response = await post().send(input).expect(201);
  expect(response.body).toMatchObject({ name: input.name, slug: input.slug, timezone: input.timezone, primaryColor: '#234567', contactEmail: 'contact@example.test', currency: 'EUR', deletedAt: null });
  expect(Object.keys(response.body).sort()).toEqual(['contactEmail', 'createdAt', 'currency', 'deletedAt', 'id', 'name', 'primaryColor', 'slug', 'timezone']);
  await request(h.app.getHttpServer()).get(`/api/v1/t/${input.slug}`).expect(200);
  await get(`${base}/${response.body.id}`).expect(200);
});
it('rejects reserved/invalid/duplicate slugs and unexpected ownership/state fields', async () => {
  const input = createBody(); await post().send(input).expect(201);
  await post().send(input).expect(409);
  for (const extra of [{ slug: 'admin' }, { slug: 'api' }, { slug: 'assets' }, { slug: 'MixedCase' }, { slug: '-invalid' }, { id: randomUUID() }, { deletedAt: null }, { currency: 'USD' }, { role: 'host' }]) await post().send({ ...createBody(), ...extra }).expect(400);
});
it('validates named timezones, colours, email and bounded names', async () => {
  for (const extra of [{ timezone: 'Space/Moon' }, { timezone: '+01:00' }, { primaryColor: 'red; background:url(x)' }, { primaryColor: '#fff' }, { contactEmail: 'invalid' }, { name: ' ' }, { name: 'x'.repeat(121) }]) await post().send({ ...createBody(), ...extra }).expect(400);
  await post().send({ ...createBody(), timezone: 'UTC' }).expect(201);
});
it('updates tenant configuration partially while preserving immutable slug and unspecified fields', async () => {
  const created = await post().send({ ...createBody(), primaryColor: '#112233', contactEmail: 'hello@example.test' }).expect(201);
  const path = `${base}/${created.body.id}`;
  const changed = await request(h.app.getHttpServer()).patch(path).set(csrf).set('Cookie', f.admin.cookie).send({ timezone: 'Europe/Lisbon' }).expect(200);
  expect(changed.body).toMatchObject({ slug: created.body.slug, name: created.body.name, primaryColor: '#112233', contactEmail: 'hello@example.test', timezone: 'Europe/Lisbon' });
  for (const body of [{ slug: 'renamed' }, { deletedAt: new Date().toISOString() }, {}, { timezone: 'Unknown/Zone' }]) await request(h.app.getHttpServer()).patch(path).set(csrf).set('Cookie', f.admin.cookie).send(body).expect(400);
  const cleared = await request(h.app.getHttpServer()).patch(path).set(csrf).set('Cookie', f.admin.cookie).send({ primaryColor: null, contactEmail: null }).expect(200); expect(cleared.body).toMatchObject({ primaryColor: null, contactEmail: null });
});
it('paginates and filters live/deleted registry entries deterministically', async () => {
  const search = `Filter-${randomUUID()}`;
  const ids = []; for (let n = 0; n < 3; n++) ids.push((await post().send({ ...createBody(), name: `${search} ${n}` }).expect(201)).body.id);
  const second = await get().query({ search, page: 2, pageSize: 1 }).expect(200); expect(second.body).toMatchObject({ total: 3, page: 2, pageSize: 1, items: [{ id: ids[1] }] });
  await request(h.app.getHttpServer()).delete(`${base}/${ids[1]}`).set(csrf).set('Cookie', f.admin.cookie).expect(204);
  expect((await get().query({ search }).expect(200)).body.total).toBe(2);
  expect((await get().query({ search, status: 'deleted' }).expect(200)).body.items.map((row: { id: string }) => row.id)).toEqual([ids[1]]);
  expect((await get().query({ search, status: 'all', page: 5 }).expect(200)).body).toMatchObject({ total: 3, items: [] });
  for (const query of [{ pageSize: 51 }, { status: 'unknown' }, { tenantId: f.b.id }]) await get().query(query).expect(400);
});
it('soft-deletes a tenant, revokes sessions, preserves data and permanently reserves the slug', async () => {
  await h.db.admin.savedListing.create({ data: { tenantId: f.a.id, userId: f.client.user.id, listingId: f.listingA.id } });
  await request(h.app.getHttpServer()).delete(`${base}/${f.a.id}`).set(csrf).set('Cookie', f.admin.cookie).expect(204);
  await request(h.app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/auth/me`).set('Cookie', f.host.cookie).expect(404);
  await request(h.app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/auth/login`).set(csrf).send({ email: f.host.user.email, password }).expect(404);
  expect(await h.db.admin.tenantSession.count({ where: { tenantId: f.a.id } })).toBe(0);
  expect(await h.db.admin.listing.count({ where: { tenantId: f.a.id } })).toBe(1); expect(await h.db.admin.tenantUser.count({ where: { tenantId: f.a.id } })).toBe(2); expect(await h.db.admin.savedListing.count({ where: { tenantId: f.a.id } })).toBe(1);
  expect((await get(`${base}/${f.a.id}`).expect(200)).body.deletedAt).not.toBeNull();
  await post().send({ ...createBody(), slug: f.a.slug }).expect(409);
  await request(h.app.getHttpServer()).patch(`${base}/${f.a.id}`).set(csrf).set('Cookie', f.admin.cookie).send({ name: 'Resurrected' }).expect(404);
});
it('provisions a forced-change host without exposing temporary credentials and never silently promotes a client', async () => {
  const input = { name: 'New host', email: `host-${randomUUID()}@example.test`, temporaryPassword };
  const response = await post(`${base}/${f.a.id}/hosts`).send(input).expect(201);
  expect(response.body).toMatchObject({ name: 'New host', email: input.email, role: 'host', tenantId: f.a.id, mustChangePassword: true, disabledAt: null });
  expect(JSON.stringify(response.body)).not.toContain(temporaryPassword); expect(response.headers['set-cookie']).toBeUndefined();
  const login = await request(h.app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/auth/login`).set(csrf).send({ email: input.email, password: temporaryPassword }).expect(200); expect(login.body.mustChangePassword).toBe(true);
  const conflict = await post(`${base}/${f.a.id}/hosts`).send({ ...input, email: f.client.user.email }).expect(409); expect(conflict.body.code).toBe('ACCOUNT_EXISTS');
  expect((await h.db.admin.tenantUser.findUniqueOrThrow({ where: { id: f.client.user.id } })).role).toBe('client');
  for (const extra of [{ role: 'client' }, { tenantId: f.b.id }, { mustChangePassword: false }, { name: '' }]) await post(`${base}/${f.a.id}/hosts`).send({ ...input, email: `${randomUUID()}@example.test`, ...extra }).expect(400);
});
it('enforces CSRF and validates identifiers/unknown fields on administration mutations', async () => {
  for (const method of ['post', 'patch', 'delete'] as const) await request(h.app.getHttpServer())[method](method === 'post' ? base : `${base}/${f.a.id}`).set('Cookie', f.admin.cookie).send(createBody()).expect(403);
  await get(`${base}/bad-id`).expect(400); await get(`${base}/${randomUUID()}`).expect(404);
  await post(`${base}/${randomUUID()}/hosts`).send({ name: 'Host', email: `${randomUUID()}@example.test`, temporaryPassword }).expect(404);
  expect(h.logs.join('\n')).not.toContain(temporaryPassword);
});

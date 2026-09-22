import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { AdminDb } from '../src/db/admin-db.js';
import { TenantDb } from '../src/db/tenant-db.js';
import { adminHarness, csrf, password, temporaryPassword, type AdminFixture, type AdminHarness } from './admin-fixtures.js';
let h: AdminHarness; let f: AdminFixture;
beforeAll(async () => { h = await adminHarness(); }); beforeEach(async () => { f = await h.fixture(); }); afterEach(() => vi.restoreAllMocks()); afterAll(async () => { await h?.close(); });
const cases = ['register', 'login', 'save', 'unsave', 'create-listing', 'edit-listing', 'create-block', 'remove-block', 'create-host', 'password-reset', 'promote-host', 'enable'] as const;
const deletion = () => request(h.app.getHttpServer()).delete(`/api/v1/admin/tenants/${f.a.id}`).set(csrf).set('Cookie', f.admin.cookie);
async function operation(name: typeof cases[number]) {
 const tenantPath = `/api/v1/t/${f.a.slug}`; const adminPath = `/api/v1/admin/tenants/${f.a.id}`;
 const post = (path: string, body: object, platform = false) => request(h.app.getHttpServer()).post(path).set(csrf).set('Cookie', platform ? f.admin.cookie : f.host.cookie).send(body);
 let build: () => request.Test; let status = 204;
 if (name === 'register' || name === 'login') { const email = name === 'register' ? `${randomUUID()}@example.test` : f.host.user.email; build = () => post(`${tenantPath}/auth/${name}`, { email, password }); status = name === 'register' ? 201 : 200; }
 else if (name === 'save' || name === 'unsave') {
  if (name === 'unsave') await h.db.admin.savedListing.create({ data: { tenantId: f.a.id, userId: f.host.user.id, listingId: f.listingA.id } });
  build = () => request(h.app.getHttpServer())[name === 'save' ? 'put' : 'delete'](`${tenantPath}/me/saved-listings/${f.listingA.id}`).set(csrf).set('Cookie', f.host.cookie);
 } else if (name === 'create-listing' || name === 'edit-listing') {
  const body = { title: 'Concurrent listing update', description: null, city: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.4, propertyType: 'apartment', maxGuests: 4, bedrooms: 2, pricePerNightCents: 10000 };
  build = () => name === 'create-listing' ? post(`${tenantPath}/host/listings`, body) : request(h.app.getHttpServer()).patch(`${tenantPath}/host/listings/${f.listingA.id}`).set(csrf).set('Cookie', f.host.cookie).send({ ...body, version: 1 }); status = name === 'create-listing' ? 201 : 200;
 } else if (name === 'create-block' || name === 'remove-block') {
  const block = name === 'remove-block' ? await h.db.admin.blockedDay.create({ data: { tenantId: f.a.id, listingId: f.listingA.id, date: new Date('2027-01-05') } }) : null;
  build = () => name === 'create-block' ? post(`${tenantPath}/host/listings/${f.listingA.id}/blocks`, { date: '2027-01-05' }) : request(h.app.getHttpServer()).delete(`${tenantPath}/host/listings/${f.listingA.id}/blocks/${block!.id}`).set(csrf).set('Cookie', f.host.cookie); status = name === 'create-block' ? 201 : 204;
 } else if (name === 'create-host') { build = () => post(`${adminPath}/hosts`, { name: 'New concurrent host', email: `${randomUUID()}@example.test`, temporaryPassword }, true); status = 201; }
 else {
  const id = name === 'promote-host' ? f.client.user.id : f.host.user.id;
  if (name === 'enable') await post(`${adminPath}/accounts/${id}/disable`, {}, true).expect(204);
  build = () => post(`${adminPath}/accounts/${id}/${name}`, name === 'enable' ? {} : { temporaryPassword }, true);
 }
 return { build, status };
}
async function records() {
 const where = { tenantId: f.a.id };
 return { users: await h.db.admin.tenantUser.findMany({ where, orderBy: { id: 'asc' } }), listings: await h.db.admin.listing.findMany({ where, orderBy: { id: 'asc' } }), saves: await h.db.admin.savedListing.findMany({ where, orderBy: { listingId: 'asc' } }), blocks: await h.db.admin.blockedDay.findMany({ where, orderBy: { id: 'asc' } }) };
}
for (const name of cases) it.each(['deletion-first', 'write-first'])(`${name} observes %s under real HTTP tenant deletion`, async order => {
 const op = await operation(name); const before = await records(); const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>(); const deleteEntered = Promise.withResolvers<void>();
 const admin = h.app.get(AdminDb); const forTenant = admin.forTenant.bind(admin); const ordinary = h.app.get(TenantDb);
 const gate = async <T,>(fn: () => Promise<T>): Promise<T> => {
  if (order === 'deletion-first') { entered.resolve(); await release.promise; return fn(); }
  const result = await fn(); entered.resolve(); await release.promise; return result;
 };
 vi.spyOn(admin, 'forTenant').mockImplementation((id, mode, fn) => {
  if (mode === 'exclusive') { deleteEntered.resolve(); return forTenant(id, mode, fn); }
  return order === 'deletion-first' ? gate(() => forTenant(id, mode, fn)) : forTenant(id, mode, (tx, tenant) => gate(() => fn(tx, tenant)));
 });
 if (['save', 'unsave'].includes(name)) {
  const run = ordinary.runForUser.bind(ordinary);
  vi.spyOn(ordinary, 'runForUser').mockImplementationOnce((id, user, fn) => order === 'deletion-first' ? gate(() => run(id, user, fn)) : run(id, user, tx => gate(() => fn(tx))));
 } else if (!['create-host', 'password-reset', 'promote-host', 'enable'].includes(name)) {
  const write = ordinary.write.bind(ordinary);
  vi.spyOn(ordinary, 'write').mockImplementationOnce((id, fn) => order === 'deletion-first' ? gate(() => write(id, fn)) : write(id, (tx, tenant) => gate(() => fn(tx, tenant))));
 }
 const pending = op.build().then(result => result); let deleting: Promise<request.Response> | undefined;
 try {
  await entered.promise;
  if (order === 'deletion-first') { await deletion().expect(204); release.resolve(); expect((await pending).status).toBe(404); expect(await records()).toEqual(before); }
  else { deleting = deletion().then(result => result); await deleteEntered.promise; release.resolve(); expect((await pending).status).toBe(op.status); expect((await deleting).status).toBe(204); }
  await request(h.app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/auth/me`).set('Cookie', f.host.cookie).expect(404);
  expect(await h.db.admin.tenantSession.count({ where: { tenantId: f.a.id } })).toBe(0);
  expect(await h.db.admin.listing.count({ where: { tenantId: f.a.id } })).toBe(name === 'create-listing' && order === 'write-first' ? 2 : 1);
 } finally { release.resolve(); await pending; await deleting; }
});

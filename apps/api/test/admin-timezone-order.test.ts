import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { TenantDb } from '../src/db/tenant-db.js';
import { AdminDb } from '../src/db/admin-db.js';
import { adminHarness, csrf } from './admin-fixtures.js';
it.each(['configuration-first', 'block-first'])('orders timezone configuration and date-dependent calendar writes: %s', async order => {
 const h = await adminHarness(); const f = await h.fixture(); const entered = Promise.withResolvers<void>(); const release = Promise.withResolvers<void>(); const configEntered = Promise.withResolvers<void>();
 const db = h.app.get(TenantDb); const write = db.write.bind(db); const admin = h.app.get(AdminDb); const configure = admin.forTenant.bind(admin);
 vi.spyOn(admin, 'forTenant').mockImplementation((id, mode, fn) => { configEntered.resolve(); return configure(id, mode, fn); });
 vi.spyOn(db, 'write').mockImplementationOnce((id, fn) => order === 'configuration-first' ? (async () => { entered.resolve(); await release.promise; return write(id, fn); })() : write(id, async (tx, tenant) => { const result = await fn(tx, tenant); entered.resolve(); await release.promise; return result; }));
 const block = request(h.app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/host/listings/${f.listingA.id}/blocks`).set(csrf).set('Cookie', f.host.cookie).send({ date: '2026-09-22' }).then(r => r);
 const change = () => request(h.app.getHttpServer()).patch(`/api/v1/admin/tenants/${f.a.id}`).set(csrf).set('Cookie', f.admin.cookie).send({ timezone: 'Pacific/Kiritimati' });
 let changing: Promise<request.Response> | undefined;
 try {
  await entered.promise;
  if (order === 'configuration-first') { await change().expect(200); release.resolve(); const response = await block; expect(response.status).toBe(409); expect(response.body.code).toBe('PAST_DATE'); }
  else { changing = change().then(r => r); await configEntered.promise; release.resolve(); expect((await block).status).toBe(201); expect((await changing).status).toBe(200); }
  expect(await h.db.admin.blockedDay.count({ where: { tenantId: f.a.id } })).toBe(order === 'block-first' ? 1 : 0);
 } finally { release.resolve(); await block; await changing; vi.restoreAllMocks(); await h.close(); }
});

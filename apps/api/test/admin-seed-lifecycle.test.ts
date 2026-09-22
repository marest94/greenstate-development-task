import request from 'supertest';
import { expect, it } from 'vitest';
import { AdminDb } from '../src/db/admin-db.js';
import { runSeed, DEMO_TENANTS } from '../src/seed/seed.js';
import { runAccountSeed } from '../src/seed/accounts.js';
import { adminHarness, csrf, temporaryPassword } from './admin-fixtures.js';
it('preserves admin resets, promotion, host disabling and tenant deletion across both seed restarts', async () => {
 const h = await adminHarness();
 try {
  const db = h.app.get(AdminDb); await runSeed({ db, enabled: true }); await runAccountSeed({ db, enabled: true }); const admin = await h.platformAccount();
  const users = await h.db.admin.tenantUser.findMany(); const tenantId = DEMO_TENANTS[0].id; const host = users.find(u => u.tenantId === tenantId && u.role === 'host')!; const client = users.find(u => u.tenantId === tenantId && u.role === 'client')!;
  for (const [id, action] of [[host.id, 'disable'], [host.id, 'password-reset'], [client.id, 'promote-host']]) await request(h.app.getHttpServer()).post(`/api/v1/admin/tenants/${tenantId}/accounts/${id}/${action}`).set(csrf).set('Cookie', admin.cookie).send(action === 'disable' ? {} : { temporaryPassword }).expect(204);
  await request(h.app.getHttpServer()).delete(`/api/v1/admin/tenants/${DEMO_TENANTS[1].id}`).set(csrf).set('Cookie', admin.cookie).expect(204);
  const beforeUsers = await h.db.admin.tenantUser.findMany({ orderBy: { id: 'asc' } }); const beforeTenants = await h.db.admin.tenant.findMany({ orderBy: { id: 'asc' } });
  await runSeed({ db, enabled: true }); await runAccountSeed({ db, enabled: true });
  expect(await h.db.admin.tenantUser.findMany({ orderBy: { id: 'asc' } })).toEqual(beforeUsers); expect(await h.db.admin.tenant.findMany({ orderBy: { id: 'asc' } })).toEqual(beforeTenants);
  expect(beforeUsers.find(u => u.id === host.id)).toMatchObject({ disabledAt: expect.any(Date), mustChangePassword: true, credentialVersion: 2 }); expect(beforeUsers.find(u => u.id === client.id)).toMatchObject({ role: 'host', mustChangePassword: true, credentialVersion: 2 });
  expect(await h.db.admin.listing.count()).toBe(1000); expect(await h.db.admin.booking.count()).toBe(12757);
 } finally { await h.close(); }
});

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { Passwords } from '../src/identity/passwords.js';
import { createTestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
export const password = 'The administrative fixture password';
export const temporaryPassword = 'A replacement temporary password 2026!';
export const csrf = { Origin: 'http://localhost:5173', 'X-Requested-By': 'greenstate-web' };
export const cookie = (r: { headers: Record<string, unknown> }) => (r.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
export async function adminHarness() {
  const db = await createTestDatabase(); let now = new Date('2026-09-22T12:00:00Z'); const logs: string[] = [];
  const passwordHash = await new Passwords().hash(password);
  const app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, clock: { now: () => now }, log: line => logs.push(JSON.stringify(line)) }); await app.listen(0);
  async function tenantAccount(tenantId: string, slug: string, role = 'client', forced = false) {
    const user = await db.admin.tenantUser.create({ data: { tenantId, email: `${randomUUID()}@example.test`, passwordHash, role, mustChangePassword: forced } });
    const r = await request(app.getHttpServer()).post(`/api/v1/t/${slug}/auth/login`).set(csrf).send({ email: user.email, password }).expect(200);
    return { user, cookie: cookie(r) };
  }
  async function platformAccount(forced = false) {
    const user = await db.admin.platformUser.create({ data: { email: `${randomUUID()}@example.test`, passwordHash, mustChangePassword: forced } });
    const r = await request(app.getHttpServer()).post('/api/v1/admin/auth/login').set(csrf).send({ email: user.email, password }).expect(200);
    return { user, cookie: cookie(r) };
  }
  async function fixture() {
    now = new Date(now.getTime() + 16 * 60000);
    const f = await inventoryFixture(db.admin); const admin = await platformAccount();
    const [host, client, foreign] = await Promise.all([tenantAccount(f.a.id, f.a.slug, 'host'), tenantAccount(f.a.id, f.a.slug), tenantAccount(f.b.id, f.b.slug, 'host')]);
    return { ...f, admin, host, client, foreign };
  }
  return { db, app, logs, passwordHash, tenantAccount, platformAccount, fixture, advance: () => { now = new Date(now.getTime() + 16 * 60000); }, async close() { await app.close(); await db.close(); } };
}
export type AdminHarness = Awaited<ReturnType<typeof adminHarness>>;
export type AdminFixture = Awaited<ReturnType<AdminHarness['fixture']>>;

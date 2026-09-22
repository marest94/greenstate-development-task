import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { loadSecurityConfig, type SecurityConfig } from '../src/common/http/security-config.js';
import { Passwords } from '../src/identity/passwords.js';
import type { RequestLog } from '../src/common/http/request-id.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
let db: TestDatabase; let app: INestApplication; let f: Awaited<ReturnType<typeof inventoryFixture>>;
let now = new Date('2026-10-01T12:00:00Z'); const logs: RequestLog[] = [];
const password = 'The original security test password'; const changed = 'A different security test password';
const csrf = { Origin: 'http://localhost:5173', 'X-Requested-By': 'greenstate-web' };
const cookie = (r: { headers: Record<string, unknown> }) => (r.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
const post = (path: string) => request(app.getHttpServer()).post(path).set(csrf);
const tenantBase = () => `/api/v1/t/${f.a.slug}/auth`;
async function start(overrides: Partial<SecurityConfig> = {}) { if (app) await app.close(); app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, security: { ...loadSecurityConfig({}), ...overrides }, clock: { now: () => now }, log: record => logs.push(record) }); await app.init(); }
async function account(realm: 'tenant' | 'platform', extra: { disabledAt?: Date; mustChangePassword?: boolean; role?: string } = {}) {
  const data = { email: `security-${randomUUID()}@example.test`, passwordHash: await new Passwords().hash(password) };
  return realm === 'tenant' ? db.admin.tenantUser.create({ data: { ...data, ...extra, tenantId: f.a.id } }) : db.admin.platformUser.create({ data });
}
beforeAll(async () => { db = await createTestDatabase(); f = await inventoryFixture(db.admin); });
beforeEach(async () => { now = new Date(now.getTime() + 16 * 60000); logs.length = 0; await start(); });
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await app?.close(); await db?.close(); });
describe('Authentication abuse boundaries', () => {
  for (const realm of ['tenant', 'platform'] as const) {
    it(`${realm}: limits login by account and rejects spoofed forwarding headers as new IPs`, async () => {
      await start({ loginIpLimit: 3, loginAccountLimit: 1 }); const a = await account(realm); const b = await account(realm); const base = realm === 'tenant' ? tenantBase() : '/api/v1/admin/auth';
      await post(`${base}/login`).send({ email: a.email, password }).expect(200);
      const repeated = await post(`${base}/login`).set('X-Forwarded-For', '203.0.113.1').send({ email: a.email.toUpperCase(), password }).expect(429); expect(repeated.headers['retry-after']).toBe('900');
      await post(`${base}/login`).send({ email: b.email, password }).expect(200);
      await post(`${base}/login`).set('X-Forwarded-For', '203.0.113.2').send({ email: `unknown-${randomUUID()}@example.test`, password }).expect(429);
      now = new Date(now.getTime() + 900000); await post(`${base}/login`).send({ email: a.email, password }).expect(200);
    });
    it(`${realm}: performs dummy verification for unknown users and rejects oversized input before hashing`, async () => {
      const base = realm === 'tenant' ? tenantBase() : '/api/v1/admin/auth'; const passwords = app.get(Passwords); const verify = vi.spyOn(passwords, 'verify');
      await post(`${base}/login`).send({ email: `absent-${randomUUID()}@example.test`, password }).expect(401); expect(verify).toHaveBeenCalledTimes(1);
      verify.mockClear(); await post(`${base}/login`).send({ email: 'absent@example.test', password: 'x'.repeat(257) }).expect(400); expect(verify).not.toHaveBeenCalled();
    });
    it(`${realm}: limits password attempts before expensive verification`, async () => {
      await start({ passwordActorLimit: 1 }); const a = await account(realm); const base = realm === 'tenant' ? tenantBase() : '/api/v1/admin/auth';
      const login = await post(`${base}/login`).send({ email: a.email, password }).expect(200);
      await post(`${base}/password`).set('Cookie', cookie(login)).send({ currentPassword: 'wrong', newPassword: changed }).expect(400);
      const verify = vi.spyOn(app.get(Passwords), 'verify');
      const limit = await post(`${base}/password`).set('Cookie', cookie(login)).send({ currentPassword: password, newPassword: changed }).expect(429); expect(limit.headers['retry-after']).toBe('900'); expect(verify).not.toHaveBeenCalled();
    });
  }
  it('limits registration before password hashing and shares the IP budget across tenants', async () => {
    await start({ registrationIpLimit: 1 }); await post(`${tenantBase()}/register`).send({ email: `first-${randomUUID()}@example.test`, password }).expect(201);
    const hash = vi.spyOn(app.get(Passwords), 'hash'); await post(`/api/v1/t/${f.b.slug}/auth/register`).send({ email: `second-${randomUUID()}@example.test`, password }).expect(429); expect(hash).not.toHaveBeenCalled();
  });
  it('rejects disabled users and existing sessions with generic failures', async () => {
    const a = await account('tenant'); const login = await post(`${tenantBase()}/login`).send({ email: a.email, password }).expect(200);
    await db.admin.tenantUser.update({ where: { id: a.id }, data: { disabledAt: now } });
    await request(app.getHttpServer()).get(`${tenantBase()}/me`).set('Cookie', cookie(login)).expect(401);
    const result = await post(`${tenantBase()}/login`).send({ email: a.email, password }).expect(401); expect(result.body).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
  });
  it.each(['client', 'host'])('allows a restricted %s to inspect, replace its password and log out', async role => {
    const a = await account('tenant', { role, mustChangePassword: true }); const login = await post(`${tenantBase()}/login`).send({ email: a.email, password }).expect(200);
    expect(login.body.mustChangePassword).toBe(true);
    const me = await request(app.getHttpServer()).get(`${tenantBase()}/me`).set('Cookie', cookie(login)).expect(200); expect(me.body.mustChangePassword).toBe(true);
    const replacement = await post(`${tenantBase()}/password`).set('Cookie', cookie(login)).send({ currentPassword: password, newPassword: changed }).expect(200); expect(replacement.body.mustChangePassword).toBe(false);
    await post(`${tenantBase()}/logout`).set('Cookie', cookie(replacement)).expect(204);
  });
  it('does not accept ambiguous or malformed cookies', async () => {
    const a = await account('tenant'); const login = await post(`${tenantBase()}/login`).send({ email: a.email, password }).expect(200);
    for (const value of [`${cookie(login)}; ${cookie(login)}`, `gs_t_${f.a.id}=malformed`, `gs_t_${f.a.id}=${'a'.repeat(44)}`]) await request(app.getHttpServer()).get(`${tenantBase()}/me`).set('Cookie', value).expect(401);
  });
  it('keeps credential values, cookies and query strings out of logs and error responses', async () => {
    const a = await account('tenant'); const login = await post(`${tenantBase()}/login`).send({ email: a.email, password }).expect(200);
    const result = await post(`${tenantBase()}/password?private=${encodeURIComponent(a.email)}`).set('Cookie', cookie(login)).send({ currentPassword: password, newPassword: 'short' }).expect(400);
    const output = JSON.stringify({ logs, error: result.body });
    for (const secret of [password, a.email, a.passwordHash, cookie(login).split('=')[1]!]) expect(output).not.toContain(secret);
  });
});

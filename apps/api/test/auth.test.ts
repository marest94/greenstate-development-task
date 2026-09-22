import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
let db: TestDatabase; let app: INestApplication;
let f: Awaited<ReturnType<typeof inventoryFixture>>;
let now = new Date('2026-10-01T12:00:00Z');
const origin = 'http://localhost:5173';
const password = 'A long original passphrase 2026';
const changed = 'A different and long passphrase 2026';
const email = () => `client-${randomUUID()}@example.test`;
const endpoint = (slug: string) => `/api/v1/t/${slug}/auth`;
const cookie = (response: { headers: Record<string, unknown> }) => (response.headers['set-cookie'] as string[]).map(value => value.split(';')[0]).join('; ');
const csrf = { Origin: origin, 'X-Requested-By': 'greenstate-web' };
const post = (path: string) => request(app.getHttpServer()).post(path).set(csrf);
async function register(slug: string, address = email()) {
  const response = await post(`${endpoint(slug)}/register`).send({ email: address, password }).expect(201);
  return { response, cookie: cookie(response), email: address };
}
beforeAll(async () => {
  db = await createTestDatabase(); f = await inventoryFixture(db.admin);
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, config: loadConfig({ APP_ORIGIN: origin }), clock: { now: () => now }, log: () => {} });
  await app.init();
});
beforeEach(() => { now = new Date(now.getTime() + 16 * 60 * 1000); });
afterAll(async () => { await app?.close(); await db?.close(); });
describe('Tenant authentication HTTP boundary', () => {
  it('registers a tenant-local client and exposes only its safe principal', async () => {
    const user = await register(f.a.slug);
    expect(user.response.body).toMatchObject({ email: user.email, realm: 'tenant', tenantId: f.a.id, role: 'client', mustChangePassword: false, permissions: ['saved-listings:manage'] });
    expect(Object.keys(user.response.body).sort()).toEqual(['email', 'id', 'mustChangePassword', 'permissions', 'realm', 'role', 'tenantId']);
    expect(user.response.headers['cache-control']).toBe('no-store');
    expect(user.response.headers['set-cookie']![0]).toMatch(/HttpOnly/);
    expect(user.response.headers['set-cookie']![0]).toMatch(/SameSite=Lax/);
    expect(user.response.headers['set-cookie']![0]).toMatch(/Max-Age=604800/);
    const me = await request(app.getHttpServer()).get(`${endpoint(f.a.slug)}/me`).set('Cookie', user.cookie).expect(200);
    expect(me.body).toEqual(user.response.body); expect(me.headers['set-cookie']).toBeUndefined();
  });
  it('normalizes email without trimming or normalizing the password', async () => {
    const address = email();
    await post(`${endpoint(f.a.slug)}/register`).send({ email: `  ${address.toUpperCase()}  `, password }).expect(201);
    await post(`${endpoint(f.a.slug)}/login`).send({ email: address, password }).expect(200);
    await post(`${endpoint(f.a.slug)}/login`).send({ email: address, password: `${password} ` }).expect(401);
  });
  it('allows the same email in separate tenants and rejects duplicates within one tenant', async () => {
    const address = email(); const a = await register(f.a.slug, address); const b = await register(f.b.slug, address);
    expect(a.response.body.id).not.toBe(b.response.body.id);
    await post(`${endpoint(f.a.slug)}/register`).send({ email: address.toUpperCase(), password }).expect(409);
  });
  it('does not accept role, ownership or forced-password fields from registration', async () => {
    for (const extra of [{ role: 'host' }, { tenantId: f.b.id }, { mustChangePassword: false }, { permissions: ['tenants:manage'] }]) {
      const r = await post(`${endpoint(f.a.slug)}/register`).send({ email: email(), password, ...extra }).expect(400);
      expect(r.body.code).toBe('VALIDATION_FAILED');
    }
  });
  it('does not accept invalid or unbounded credentials', async () => {
    for (const body of [{ email: 'invalid', password }, { email: email(), password: 'too short' }, { email: email(), password: 'x'.repeat(129) }, { email: email(), password: 123456789012345 }]) {
      await post(`${endpoint(f.a.slug)}/register`).send(body).expect(400);
    }
  });
  it('uses indistinguishable failures for wrong and unknown credentials', async () => {
    const user = await register(f.a.slug);
    for (const address of [user.email, email()]) {
      const r = await post(`${endpoint(f.a.slug)}/login`).send({ email: address, password: changed }).expect(401);
      expect(r.body).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
    }
  });
  it('prevents cross-tenant and cross-realm session replay even if a cookie is renamed', async () => {
    const user = await register(f.a.slug);
    const other = await register(f.b.slug);
    await request(app.getHttpServer()).get(`${endpoint(f.b.slug)}/me`).set('Cookie', user.cookie).expect(401);
    const renamed = `${other.cookie.split('=')[0]}=${user.cookie.split('=')[1]}`;
    await request(app.getHttpServer()).get(`${endpoint(f.b.slug)}/me`).set('Cookie', renamed).expect(401);
    await request(app.getHttpServer()).get('/api/v1/admin/auth/me').set('Cookie', user.cookie).expect(401);
  });
  it('enforces fixed seven-day session expiry without extending it on reads', async () => {
    const user = await register(f.a.slug);
    now = new Date(now.getTime() + 7 * 86400000 - 1);
    await request(app.getHttpServer()).get(`${endpoint(f.a.slug)}/me`).set('Cookie', user.cookie).expect(200);
    now = new Date(now.getTime() + 1);
    await request(app.getHttpServer()).get(`${endpoint(f.a.slug)}/me`).set('Cookie', user.cookie).expect(401);
  });
  it('requires same-origin and custom-header CSRF checks before login, registration and logout', async () => {
    const user = await register(f.a.slug);
    for (const action of ['register', 'login', 'logout', 'password']) {
      for (const headers of [{}, { Origin: origin }, { Origin: 'https://other.example', 'X-Requested-By': 'greenstate-web' }, { Origin: 'null', 'X-Requested-By': 'greenstate-web' }]) {
        await request(app.getHttpServer()).post(`${endpoint(f.a.slug)}/${action}`).set(headers).set('Cookie', user.cookie).send({ email: email(), password }).expect(403);
      }
    }
  });
  it('logs out by revoking the session and clearing the cookie', async () => {
    const user = await register(f.a.slug);
    const response = await post(`${endpoint(f.a.slug)}/logout`).set('Cookie', user.cookie).send({}).expect(204);
    expect(response.headers['set-cookie']![0]).toMatch(/Expires=Thu, 01 Jan 1970/);
    await request(app.getHttpServer()).get(`${endpoint(f.a.slug)}/me`).set('Cookie', user.cookie).expect(401);
  });
  it('changes password, revokes all old sessions and issues a replacement', async () => {
    const user = await register(f.a.slug);
    const other = await post(`${endpoint(f.a.slug)}/login`).send({ email: user.email, password }).expect(200);
    const result = await post(`${endpoint(f.a.slug)}/password`).set('Cookie', user.cookie).send({ currentPassword: password, newPassword: changed }).expect(200);
    expect(cookie(result)).not.toBe(user.cookie);
    for (const old of [user.cookie, cookie(other)]) await request(app.getHttpServer()).get(`${endpoint(f.a.slug)}/me`).set('Cookie', old).expect(401);
    await request(app.getHttpServer()).get(`${endpoint(f.a.slug)}/me`).set('Cookie', cookie(result)).expect(200);
    await post(`${endpoint(f.a.slug)}/login`).send({ email: user.email, password }).expect(401);
    await post(`${endpoint(f.a.slug)}/login`).send({ email: user.email, password: changed }).expect(200);
  });
  it('requires the current password and rejects unchanged passwords', async () => {
    const user = await register(f.a.slug);
    await post(`${endpoint(f.a.slug)}/password`).set('Cookie', user.cookie).send({ currentPassword: changed, newPassword: changed }).expect(400);
    await post(`${endpoint(f.a.slug)}/password`).set('Cookie', user.cookie).send({ currentPassword: password, newPassword: password }).expect(400);
    await request(app.getHttpServer()).get(`${endpoint(f.a.slug)}/me`).set('Cookie', user.cookie).expect(200);
  });
  it('rejects sessions once the tenant is deleted', async () => {
    const fixture = await inventoryFixture(db.admin); const user = await register(fixture.a.slug);
    await db.admin.tenant.update({ where: { id: fixture.a.id }, data: { deletedAt: new Date() } });
    await request(app.getHttpServer()).get(`${endpoint(fixture.a.slug)}/me`).set('Cookie', user.cookie).expect(404);
    await post(`${endpoint(fixture.a.slug)}/login`).send({ email: user.email, password }).expect(404);
  });
  it('enforces tenant-user/session RLS and protected role/state/ownership fields with the actual runtime role', async () => {
    const user = await register(f.a.slug); const other = await register(f.b.slug);
    expect(await db.tenantDb.client.tenantUser.findMany()).toEqual([]);
    expect(await db.tenantDb.client.tenantSession.findMany()).toEqual([]);
    const visible = await db.tenantDb.run(f.a.id, tx => tx.tenantUser.findMany());
    expect(visible.some(row => row.id === user.response.body.id)).toBe(true);
    expect(visible.every(row => row.tenantId === f.a.id)).toBe(true);
    await expect(db.tenantDb.run(f.a.id, tx => tx.tenantUser.update({ where: { id: user.response.body.id }, data: { role: 'host' } }))).rejects.toThrow(/permission denied/);
    await expect(db.tenantDb.run(f.a.id, tx => tx.tenantUser.update({ where: { id: user.response.body.id }, data: { disabledAt: new Date() } }))).rejects.toThrow(/permission denied/);
    await expect(db.tenantDb.run(f.a.id, tx => tx.tenantUser.update({ where: { id: user.response.body.id }, data: { tenantId: f.b.id } }))).rejects.toThrow(/permission denied/);
    await expect(db.tenantDb.run(f.a.id, tx => tx.$executeRaw`INSERT INTO tenant_users (tenant_id, email, password_hash, role) VALUES (${f.a.id}::uuid, 'injected@example.test', ${'x'.repeat(60)}, 'host')`)).rejects.toThrow(/permission denied/);
    await expect(db.tenantDb.run(f.a.id, tx => tx.$executeRaw`INSERT INTO tenant_users (tenant_id, email, password_hash, disabled_at) VALUES (${f.a.id}::uuid, 'disabled-injection@example.test', ${'x'.repeat(60)}, NULL)`)).rejects.toThrow(/permission denied/);
    await expect(db.tenantDb.client.platformUser.findMany()).rejects.toThrow(/permission denied/);
    await expect(db.tenantDb.client.platformSession.findMany()).rejects.toThrow(/permission denied/);
    await expect(db.admin.tenantSession.create({ data: { tokenHash: 'a'.repeat(64), tenantId: f.a.id, userId: other.response.body.id, createdAt: now, expiresAt: new Date(now.getTime() + 7 * 86400000) } })).rejects.toThrow(/foreign key/i);
  });
  it('persists only Argon2id password hashes and SHA-256 token hashes', async () => {
    const user = await register(f.a.slug);
    const stored = await db.admin.tenantUser.findUniqueOrThrow({ where: { id: user.response.body.id } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/); expect(stored.passwordHash).not.toContain(password);
    const sessions = await db.admin.tenantSession.findMany({ where: { userId: stored.id } });
    expect(sessions).toHaveLength(1); expect(sessions[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(user.cookie).not.toContain(sessions[0]!.tokenHash);
    expect(user.cookie.split('=')[1]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

});

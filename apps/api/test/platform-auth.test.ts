import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';
import { Passwords } from '../src/identity/passwords.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
let db: TestDatabase; let app: INestApplication; let now = new Date('2026-10-01T12:00:00Z');
const password = 'A platform password with enough length';
const changed = 'A different platform password with enough length';
const origin = 'https://portal.example.test';
const csrf = { Origin: origin, 'X-Requested-By': 'greenstate-web' };
const base = '/api/v1/admin/auth';
const cookie = (response: { headers: Record<string, unknown> }) => (response.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
const post = (action: string) => request(app.getHttpServer()).post(`${base}/${action}`).set(csrf);
async function user(restricted = false) { return db.admin.platformUser.create({ data: { email: `admin-${randomUUID()}@example.test`, passwordHash: await new Passwords().hash(password), mustChangePassword: restricted } }); }
beforeAll(async () => {
  db = await createTestDatabase();
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, config: loadConfig({ APP_ORIGIN: origin }), clock: { now: () => now }, log: () => {} }); await app.init();
});
beforeEach(() => { now = new Date(now.getTime() + 16 * 60000); });
afterAll(async () => { await app?.close(); await db?.close(); });
describe('Separate platform identity', () => {
  it('signs in a platform principal with a secure, separately scoped cookie', async () => {
    const account = await user(); const response = await post('login').send({ email: account.email, password }).expect(200);
    expect(response.body).toEqual({ id: account.id, email: account.email, realm: 'platform', tenantId: null, role: 'superadmin', mustChangePassword: false, permissions: ['tenants:manage', 'accounts:manage'] });
    expect(response.headers['set-cookie']![0]).toMatch(/gs_platform=/); expect(response.headers['set-cookie']![0]).toMatch(/; Secure/); expect(response.headers['set-cookie']![0]).toMatch(/Path=\/api\/v1\/admin/);
    const me = await request(app.getHttpServer()).get(`${base}/me`).set('Cookie', cookie(response)).expect(200);
    expect(me.body).toEqual(response.body); expect(me.headers['set-cookie']).toBeUndefined();
    const stored = await db.admin.platformSession.findMany({ where: { userId: account.id } }); expect(stored).toHaveLength(1); expect(cookie(response)).not.toContain(stored[0]!.tokenHash);
  });
  it('never registers platform users publicly or accepts tenant tokens under a platform cookie name', async () => {
    await post('register').send({ email: 'attacker@example.test', password }).expect(404);
    const f = await inventoryFixture(db.admin);
    const tenant = await request(app.getHttpServer()).post(`/api/v1/t/${f.a.slug}/auth/register`).set(csrf).send({ email: `client-${randomUUID()}@example.test`, password }).expect(201);
    await request(app.getHttpServer()).get(`${base}/me`).set('Cookie', `gs_platform=${cookie(tenant).split('=')[1]}`).expect(401);
    const account = await user(); const admin = await post('login').send({ email: account.email, password }).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/t/${f.a.slug}/auth/me`).set('Cookie', `gs_t_${f.a.id}=${cookie(admin).split('=')[1]}`).expect(401);
  });
  it('uses generic login failures and requires CSRF on every platform mutation', async () => {
    const account = await user();
    for (const address of [account.email, 'unknown@example.test']) expect((await post('login').send({ email: address, password: changed }).expect(401)).body).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'The email or password is incorrect.' });
    for (const action of ['login', 'logout', 'password']) await request(app.getHttpServer()).post(`${base}/${action}`).send({ email: account.email, password }).expect(403);
  });
  it('changes a restricted password and invalidates every previous session', async () => {
    const account = await user(true); const one = await post('login').send({ email: account.email, password }).expect(200); const two = await post('login').send({ email: account.email, password }).expect(200);
    expect(one.body.mustChangePassword).toBe(true);
    const result = await post('password').set('Cookie', cookie(one)).send({ currentPassword: password, newPassword: changed }).expect(200); expect(result.body.mustChangePassword).toBe(false);
    for (const old of [one, two]) await request(app.getHttpServer()).get(`${base}/me`).set('Cookie', cookie(old)).expect(401);
    await post('login').send({ email: account.email, password }).expect(401);
    await post('login').send({ email: account.email, password: changed }).expect(200);
    await post('logout').set('Cookie', cookie(result)).expect(204);
    await request(app.getHttpServer()).get(`${base}/me`).set('Cookie', cookie(result)).expect(401);
  });
  it('expires platform sessions exactly seven days after issuance', async () => {
    const account = await user(); const result = await post('login').send({ email: account.email, password }).expect(200);
    now = new Date(now.getTime() + 7 * 86400000 - 1); await request(app.getHttpServer()).get(`${base}/me`).set('Cookie', cookie(result)).expect(200);
    now = new Date(now.getTime() + 1); await request(app.getHttpServer()).get(`${base}/me`).set('Cookie', cookie(result)).expect(401);
  });
});

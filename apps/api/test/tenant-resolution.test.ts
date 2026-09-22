import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { inventoryFixture } from './fixtures.js';
let db: TestDatabase; let app: INestApplication;
let fixture: Awaited<ReturnType<typeof inventoryFixture>>;
beforeAll(async () => {
  db = await createTestDatabase(); fixture = await inventoryFixture(db.admin);
  app = await createApp({ database: { ordinaryUrl: db.urls.app, privilegedUrl: db.urls.admin }, log: () => {} });
  await app.init();
});
afterAll(async () => { await app?.close(); await db?.close(); });
describe('Tenant registry HTTP boundary', () => {
  it('returns public configuration and database readiness', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/t/${fixture.a.slug}`).expect(200);
    expect(response.body).toMatchObject({ id: fixture.a.id, name: fixture.a.name, timezone: fixture.a.timezone, currency: 'EUR' });
    expect(response.body).not.toHaveProperty('deletedAt');
    await request(app.getHttpServer()).get('/api/health/ready').expect(200).expect({ status: 'ok' });
  });
  it('uses identical not-found errors for unknown and deleted tenants', async () => {
    await db.admin.tenant.update({ where: { id: fixture.b.id }, data: { deletedAt: new Date() } });
    for (const slug of ['unknown-tenant', fixture.b.slug]) {
      const response = await request(app.getHttpServer()).get(`/api/v1/t/${slug}`).expect(404);
      expect(response.body.code).toBe('TENANT_NOT_FOUND');
    }
  });
  it.each(['%00', 'INVALID', 'bad_slug', '-bad'])('rejects malformed slug %s before lookup', async slug => {
    const response = await request(app.getHttpServer()).get(`/api/v1/t/${slug}`).expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });
});

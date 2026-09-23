import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap.js';
let app: INestApplication;
let logs: Record<string, unknown>[];
beforeEach(async () => { logs = []; app = await createApp({ database: false, log: (record: Record<string, unknown>) => logs.push(record) }); await app.init(); });
afterEach(async () => { await app.close(); });
describe('HTTP boundary', () => {
  it('logs request metadata without bodies, cookies, or query-string credentials', async () => {
    await request(app.getHttpServer()).post('/api/missing?password=query-secret')
      .set('Cookie', 'session=cookie-secret').send({ password: 'body-secret' }).expect(404);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ method: 'POST', path: '[unmatched]', status: 404, requestId: expect.any(String) });
    expect(JSON.stringify(logs)).not.toContain('secret');
  });
  it('does not log credentials in an unmatched URL path', async () => {
    await request(app.getHttpServer()).get('/api/path-secret?password=query-secret').expect(404);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ path: '[unmatched]', status: 404 });
    expect(JSON.stringify(logs)).not.toContain('secret');
  });
  it('serves liveness through the version-independent API health path', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/live').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });
  it('returns a safe consistent error for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/missing?password=do-not-echo').expect(404);
    expect(response.body).toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND', requestId: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toContain('do-not-echo');
  });
  it('rejects malformed JSON without echoing its content', async () => {
    const response = await request(app.getHttpServer()).post('/api/missing').type('json').send('{"password":"secret"').expect(400);
    expect(response.body).toMatchObject({ status: 400, code: 'INVALID_JSON', requestId: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
  it('rejects bodies exceeding the configured 32 KiB request limit', async () => {
    const response = await request(app.getHttpServer()).post('/api/missing').send({ value: 'x'.repeat(40_000) }).expect(413);
    expect(response.body).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });
});

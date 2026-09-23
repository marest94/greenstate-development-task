import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../../bootstrap.js';
import { Prisma } from '../../generated/prisma/client.js';
import { TenantsRepository } from '../../tenants/tenants.repository.js';
import { AppError } from './errors.js';
import type { RequestLog } from './request-id.js';

let app: INestApplication;
let logs: RequestLog[];
beforeEach(async () => {
  logs = [];
  app = await createApp({ database: false, log: record => logs.push(record) });
  await app.init();
});
afterEach(async () => { vi.restoreAllMocks(); await app.close(); });

describe('safe API diagnostics', () => {
  it('correlates an unexpected failure with its response and completion log', async () => {
    vi.spyOn(app.get(TenantsRepository), 'findLiveBySlug').mockRejectedValue(new TypeError('private error detail'));
    const response = await request(app.getHttpServer()).get('/api/v1/t/demo').expect(500);

    expect(logs).toHaveLength(2);
    expect(logs[0]).toEqual({
      event: 'api_error', requestId: response.headers['x-request-id'],
      method: 'GET', path: '/api/v1/t/:slug', status: 500, errorClass: 'TypeError',
    });
    expect(logs[1]).toMatchObject({ requestId: response.body.requestId, path: '/api/v1/t/:slug', status: 500 });
    expect(response.body).toEqual({
      status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.',
      requestId: response.headers['x-request-id'],
    });
  });

  it('classifies known database failures without including database details', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('postgres://user:database-secret@localhost/db', {
      code: 'P2002', clientVersion: 'version-secret',
      meta: { sql: 'INSERT password=sql-secret', params: ['parameter-secret'], target: ['column-secret'] },
    });
    vi.spyOn(app.get(TenantsRepository), 'findLiveBySlug').mockRejectedValue(error);
    const response = await request(app.getHttpServer()).get('/api/v1/t/demo').expect(500);

    expect(logs[0]).toEqual({
      event: 'api_error', requestId: response.body.requestId,
      method: 'GET', path: '/api/v1/t/:slug', status: 500,
      errorClass: 'PrismaClientKnownRequestError', errorCode: 'P2002',
    });
    expect(JSON.stringify({ logs, body: response.body })).not.toContain('secret');
  });

  it('never copies credential-bearing error properties or request data into logs', async () => {
    const error = Object.assign(new Error('message-secret'), {
      name: 'name-secret', code: 'code-secret', stack: 'at stack-secret (https://user:stack-secret@host/source.ts:1:1)',
      cause: { password: 'cause-secret' }, credentials: 'property-secret',
      toJSON: () => ({ password: 'serialization-secret' }),
    });
    vi.spyOn(app.get(TenantsRepository), 'findLiveBySlug').mockRejectedValue(error);
    const response = await request(app.getHttpServer()).get('/api/v1/t/path-secret?password=query-secret')
      .set('X-Request-Id', 'request-id-secret').set('Authorization', 'Bearer header-secret')
      .set('Cookie', 'session=cookie-secret').send({ password: 'body-secret' }).expect(500);

    expect(logs[0]).toEqual({
      event: 'api_error', requestId: response.body.requestId,
      method: 'GET', path: '/api/v1/t/:slug', status: 500, errorClass: 'Error',
    });
    expect(JSON.stringify({ logs, body: response.body })).not.toContain('secret');
  });

  it.each(['P2002\npassword=code-secret', 'P9999'])('omits unrecognized database codes (%s)', async code => {
    const error = new Prisma.PrismaClientKnownRequestError('message-secret', { code, clientVersion: 'test' });
    vi.spyOn(app.get(TenantsRepository), 'findLiveBySlug').mockRejectedValue(error);
    await request(app.getHttpServer()).get('/api/v1/t/demo').expect(500);

    expect(logs[0]).toMatchObject({ event: 'api_error', errorClass: 'PrismaClientKnownRequestError' });
    expect(logs[0]).not.toHaveProperty('errorCode');
    expect(JSON.stringify(logs)).not.toContain(code);
  });

  it('does not trust the name or code of an arbitrary thrown value', async () => {
    vi.spyOn(app.get(TenantsRepository), 'findLiveBySlug').mockRejectedValue({
      name: 'PrismaClientKnownRequestError', code: 'P2002', password: 'object-secret',
    });
    const response = await request(app.getHttpServer()).get('/api/v1/t/demo').expect(500);

    expect(logs[0]).toEqual({
      event: 'api_error', requestId: response.body.requestId,
      method: 'GET', path: '/api/v1/t/:slug', status: 500, errorClass: 'UnknownThrownValue',
    });
    expect(JSON.stringify({ logs, body: response.body })).not.toContain('secret');
  });

  it.each([
    [new RangeError('message-secret'), 'RangeError'],
    [new ReferenceError('message-secret'), 'ReferenceError'],
    [new SyntaxError('message-secret'), 'SyntaxError'],
    [new URIError('message-secret'), 'URIError'],
    [new EvalError('message-secret'), 'EvalError'],
    [new Prisma.PrismaClientInitializationError('message-secret', 'version-secret', 'P1001'), 'PrismaClientInitializationError'],
    [new Prisma.PrismaClientUnknownRequestError('message-secret', { clientVersion: 'version-secret' }), 'PrismaClientUnknownRequestError'],
    [new Prisma.PrismaClientValidationError('message-secret', { clientVersion: 'version-secret' }), 'PrismaClientValidationError'],
    [new Prisma.PrismaClientRustPanicError('message-secret', 'version-secret'), 'PrismaClientRustPanicError'],
    [new HttpException('message-secret', 500), 'HttpException'],
    [new AppError(503, 'SERVICE_UNAVAILABLE', 'The rental service is currently unavailable.'), 'AppError'],
  ])('identifies the safe class of %s', async (error, errorClass) => {
    vi.spyOn(app.get(TenantsRepository), 'findLiveBySlug').mockRejectedValue(error);
    const response = await request(app.getHttpServer()).get('/api/v1/t/demo').expect(error instanceof AppError ? 503 : 500);

    expect(logs[0]).toMatchObject({ event: 'api_error', errorClass, requestId: response.body.requestId });
    if (error instanceof Prisma.PrismaClientInitializationError) expect(logs[0]).toHaveProperty('errorCode', 'P1001');
    expect(JSON.stringify({ logs, body: response.body })).not.toContain('secret');
  });

  it('does not evaluate database error accessors when collecting diagnostics', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('message-secret', { code: 'P2002', clientVersion: 'test' });
    Object.defineProperty(error, 'code', { get: () => { throw new Error('getter-secret'); } });
    vi.spyOn(app.get(TenantsRepository), 'findLiveBySlug').mockRejectedValue(error);
    const response = await request(app.getHttpServer()).get('/api/v1/t/demo').timeout({ deadline: 1000 }).expect(500);

    expect(logs[0]).toMatchObject({ event: 'api_error', errorClass: 'PrismaClientKnownRequestError' });
    expect(logs[0]).not.toHaveProperty('errorCode');
    expect(JSON.stringify({ logs, body: response.body })).not.toContain('secret');
  });

  it.each(['throw', 'reject'] as const)('preserves the response when the log sink fails (%s)', async mode => {
    await app.close();
    app = await createApp({ database: false, log: () => {
      if (mode === 'reject') return Promise.reject(new Error('sink-secret'));
      throw new Error('sink-secret');
    } });
    await app.init();
    vi.spyOn(app.get(TenantsRepository), 'findLiveBySlug').mockRejectedValue(new Error('message-secret'));

    const response = await request(app.getHttpServer()).get('/api/v1/t/demo').timeout({ deadline: 1000 }).expect(500);
    expect(response.body).toEqual({
      status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.',
      requestId: response.headers['x-request-id'],
    });
    await request(app.getHttpServer()).get('/api/health/live').expect(200, { status: 'ok' });
  });

  it('does not duplicate routine application failures with diagnostics', async () => {
    vi.spyOn(app.get(TenantsRepository), 'findLiveBySlug').mockRejectedValue(new AppError(404, 'TENANT_NOT_FOUND', 'This rental portal was not found.'));
    const response = await request(app.getHttpServer()).get('/api/v1/t/demo').expect(404);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 404, requestId: response.body.requestId, path: '/api/v1/t/:slug' });
    expect(response.body).toMatchObject({ code: 'TENANT_NOT_FOUND', message: 'This rental portal was not found.' });
  });
});

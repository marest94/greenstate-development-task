import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiProblem } from './api';
afterEach(() => vi.unstubAllGlobals());
it('uses same-origin requests and encodes filters while omitting absent values', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal('fetch', fetch);
  expect(await api.get('/t/demo/listings', { city: 'A & B', page: 2, from: undefined })).toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledWith('/api/v1/t/demo/listings?city=A+%26+B&page=2', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
});
it('preserves structured API errors and field messages', async () => {
  const problem = { status: 400, code: 'VALIDATION_FAILED', message: 'Check the fields.', requestId: 'r-1', fields: { city: ['Invalid city.'] } };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(problem), { status: 400 })));
  await expect(api.get('/t/demo/listings')).rejects.toMatchObject(problem);
  await expect(api.get('/t/demo/listings')).rejects.toBeInstanceOf(ApiProblem);
});
it('uses safe fallback text for non-JSON proxy errors and network failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>upstream internal detail</h1>', { status: 502 })));
  await expect(api.get('/t/demo')).rejects.toMatchObject({ status: 502, message: 'The rental service is currently unavailable. Please try again.' });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('internal connection details')));
  await expect(api.get('/t/demo')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
});
it('validates successful response data when a wire schema is supplied', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  await expect(api.get('/t/demo', undefined, { parse: () => { throw new Error('Missing public field'); } })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('sends JSON mutations once with CSRF headers and handles empty logout responses', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
  for (const method of ['post', 'put', 'patch', 'delete'] as const) {
    expect(await api[method]('/t/demo/auth/logout', {})).toBeUndefined();
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/t/demo/auth/logout', { method: method.toUpperCase(), credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-By': 'greenstate-web' }, body: '{}' });
  }
  expect(fetch).toHaveBeenCalledTimes(4);
});
it('carries an abort signal without disguising cancellation as a network failure', async () => {
  const controller = new AbortController(); const aborted = new DOMException('Aborted', 'AbortError');
  const fetch = vi.fn().mockRejectedValue(aborted); vi.stubGlobal('fetch', fetch);
  await expect(api.get('/t/demo/listings', undefined, undefined, controller.signal)).rejects.toBe(aborted);
  expect(fetch.mock.calls[0]![1].signal).toBe(controller.signal);
});
it('includes Retry-After in a structured rate-limit error without retrying', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 429, code: 'RATE_LIMITED', message: 'Try later.', requestId: 'r' }), { status: 429, headers: { 'Retry-After': '37' } })); vi.stubGlobal('fetch', fetch);
  await expect(api.post('/admin/auth/login', {})).rejects.toMatchObject({ status: 429, retryAfter: 37 }); expect(fetch).toHaveBeenCalledTimes(1);
});

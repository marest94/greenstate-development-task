import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter.js';
import { loadSecurityConfig } from './security-config.js';
describe('Bounded authentication rate limits', () => {
  it('limits each key and reports time remaining without extending the window', () => {
    let now = 1000;
    const limiter = new RateLimiter({ now: () => new Date(now) }, loadSecurityConfig({ AUTH_WINDOW_MS: '1000' }));
    expect(limiter.consume('a', 2)).toBe(0); expect(limiter.consume('a', 2)).toBe(0);
    now = 1500; expect(limiter.consume('a', 2)).toBe(1); expect(limiter.consume('b', 2)).toBe(0);
    now = 2000; expect(limiter.consume('a', 2)).toBe(0);
  });
  it('bounds memory and fails closed until an active slot expires', () => {
    let now = 1000;
    const limiter = new RateLimiter({ now: () => new Date(now) }, loadSecurityConfig({ AUTH_MAX_BUCKETS: '1', AUTH_WINDOW_MS: '1000' }));
    expect(limiter.consume('a', 3)).toBe(0); expect(limiter.consume('b', 3)).toBe(1);
    now = 2000; expect(limiter.consume('b', 3)).toBe(0);
  });
  it('rejects invalid security configuration', () => {
    for (const env of [{ AUTH_LOGIN_IP_LIMIT: '0' }, { AUTH_WINDOW_MS: '-1' }, { TRUST_PROXY_HOPS: '2' }, { AUTH_MAX_BUCKETS: 'Infinity' }]) expect(() => loadSecurityConfig(env)).toThrow('Invalid authentication configuration');
    expect(loadSecurityConfig({}).trustProxyHops).toBe(0);
  });
});

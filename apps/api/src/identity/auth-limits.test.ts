import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { AuthLimits } from './auth-limits.js';
import { RateLimiter } from '../common/http/rate-limiter.js';
import { loadSecurityConfig } from '../common/http/security-config.js';
const ip = (value: string) => ({ ip: value }) as Request;
const response = { setHeader: () => {} } as unknown as Response;
function limits() {
  const config = { ...loadSecurityConfig({}), maxBuckets: 8, loginIpLimit: 1, passwordActorLimit: 1 };
  return new AuthLimits(new RateLimiter({ now: () => new Date('2026-10-01') }, config), config);
}
describe('Rate-limit rejection does not exhaust unrelated accounts', () => {
  it('stops allocating account buckets when the IP is already blocked', () => {
    const auth = limits(); auth.login(ip('192.0.2.1'), response, 'tenant-a', 'first@example.test');
    for (let index = 0; index < 20; index++) expect(() => auth.login(ip('192.0.2.1'), response, 'tenant-a', `blocked-${index}@example.test`)).toThrow();
    expect(() => auth.login(ip('192.0.2.2'), response, 'tenant-a', 'fresh@example.test')).not.toThrow();
    expect(() => auth.register(ip('192.0.2.3'), response)).not.toThrow();
    expect(() => auth.password(response, 'tenant-a', 'fresh-actor')).not.toThrow();
  });
  it('stops allocating target buckets when the password actor is already blocked', () => {
    const auth = limits(); auth.password(response, 'tenant-a', 'blocked-actor', 'first-target');
    for (let index = 0; index < 20; index++) expect(() => auth.password(response, 'tenant-a', 'blocked-actor', `target-${index}`)).toThrow();
    expect(() => auth.password(response, 'tenant-a', 'fresh-actor', 'fresh-target')).not.toThrow();
  });
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
test('Compose forwards authentication limits while retaining its one trusted nginx hop', () => {
  const overrides = { AUTH_LOGIN_IP_LIMIT: '7', AUTH_LOGIN_ACCOUNT_LIMIT: '4', AUTH_REGISTRATION_IP_LIMIT: '3', AUTH_PASSWORD_ACTOR_LIMIT: '2', AUTH_WINDOW_MS: '10000', AUTH_MAX_BUCKETS: '64' };
  const rendered = JSON.parse(execFileSync('docker', ['compose', 'config', '--format', 'json'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', env: { ...process.env, ...overrides, TRUST_PROXY_HOPS: '0' } }));
  for (const [key, value] of Object.entries(overrides)) assert.equal(rendered.services.api.environment[key], value, `API must receive ${key}`);
  assert.equal(String(rendered.services.api.environment.TRUST_PROXY_HOPS), '1');
});

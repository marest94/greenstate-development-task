import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

test('nginx and API error paths do not log request secrets', async () => {
  const marker = `synthetic-secret-${randomUUID()}`;
  const baseUrl = process.env.STACK_BASE_URL ?? 'http://localhost:8080';
  const args = ['compose'];
  if (process.env.COMPOSE_PROJECT_NAME) args.push('-p', process.env.COMPOSE_PROJECT_NAME);
  for (const size of [40_000, 1_100_000]) {
    const response = await fetch(`${baseUrl}/api/missing?password=${marker}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `session=${marker}` },
      body: JSON.stringify({ password: marker, value: 'x'.repeat(size) }),
    });
    assert.equal(response.status, 413);
    await response.text();
  }
  const logs = execFileSync('docker', [...args, 'logs', '--no-color', 'api', 'web'], { encoding: 'utf8', maxBuffer: 2_000_000 });
  assert.ok(!logs.includes(marker), 'A proxy or API log contained the synthetic request credential');
});

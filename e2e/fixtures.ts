import { test as base, expect } from '@playwright/test';
import { observeBrowserErrors } from './browser-errors.js';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { hash, argon2id } from 'argon2';
// Test fixture setup only: these credentials are never imported by the web app. Browser
// journeys exercise the real login/password routes after provisioning a unique forced-change host.
export async function provisionHostFixture(tenantId: string) {
  const email = `browser-host-${randomUUID()}@example.test`;
  const password = `Temporary browser host ${randomUUID()}!`;
  const passwordHash = await hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const pool = new Pool({ connectionString: process.env.STACK_TEST_ADMIN_DATABASE_URL ?? 'postgresql://gs_admin:local-admin-only@127.0.0.1:54329/greenstate', max: 1 });
  try {
    await pool.query('INSERT INTO tenant_users (tenant_id, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, true)', [tenantId, email, passwordHash, 'host']);
  } finally { await pool.end(); }
  return { email, password };
}
export async function provisionPlatformFixture() {
  const email = `browser-admin-${randomUUID()}@example.test`;
  const password = `Temporary browser administrator ${randomUUID()}!`;
  const passwordHash = await hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const pool = new Pool({ connectionString: process.env.STACK_TEST_ADMIN_DATABASE_URL ?? 'postgresql://gs_admin:local-admin-only@127.0.0.1:54329/greenstate', max: 1 });
  try { await pool.query('INSERT INTO platform_users (email, password_hash, must_change_password) VALUES ($1, $2, true)', [email, passwordHash]); }
  finally { await pool.end(); }
  return { email, password };
}

export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = []; observeBrowserErrors(page, errors); await use(errors); expect(errors).toEqual([]);
  }, { auto: true }],
});

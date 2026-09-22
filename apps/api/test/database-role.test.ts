import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './setup.js';
import { createApp } from '../src/bootstrap.js';
import { createClient } from '../src/db/client.js';
import { assertRuntimeRole } from '../src/db/role-check.js';
let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db?.close(); });
describe('Database credential checks', () => {
  it('accepts the two intended runtime roles', async () => {
    await expect(assertRuntimeRole(db.tenantDb.client, 'ordinary')).resolves.toBeUndefined();
    await expect(assertRuntimeRole(db.admin, 'privileged')).resolves.toBeUndefined();
  });
  it('rejects a BYPASSRLS credential for the ordinary pool', async () => {
    await expect(createApp({ database: { ordinaryUrl: db.urls.admin, privilegedUrl: db.urls.admin } })).rejects.toThrow('Unsafe ordinary database role');
  });
  it.each(['ordinary', 'privileged'] as const)('rejects a superuser in the %s runtime pool', async realm => {
    await expect(createApp({ database: {
      ordinaryUrl: realm === 'ordinary' ? db.urls.superuser : db.urls.app,
      privilegedUrl: realm === 'privileged' ? db.urls.superuser : db.urls.admin,
    } })).rejects.toThrow(`Unsafe ${realm} database role`);
  });
  it('rejects an object owner even without superuser privileges', async () => {
    const owner = createClient(db.urls.owner);
    try { await expect(assertRuntimeRole(owner, 'ordinary')).rejects.toThrow('Unsafe ordinary database role'); }
    finally { await owner.$disconnect(); }
  });
});

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '../src/db/client.js';
import { TenantDb } from '../src/db/tenant-db.js';

export async function createTestDatabase(max = 10) {
  const serverUrl = new URL(process.env.TEST_DATABASE_SERVER_URL ?? 'postgresql://postgres:local-postgres-only@127.0.0.1:54329/postgres');
  const server = new pg.Pool({ connectionString: serverUrl.toString() });
  const name = `greenstate_test_${randomUUID().replaceAll('-', '')}`;
  // Database names are generated locally and contain only this prefix and hex digits.
  await server.query(`CREATE DATABASE "${name}"`);
  const urlFor = (user: string, password: string) => {
    const url = new URL(serverUrl); url.pathname = `/${name}`; url.username = user; url.password = password; return url.toString();
  };
  const urls = {
    owner: urlFor('gs_owner', 'local-owner-only'), app: urlFor('gs_app', 'local-app-only'),
    admin: urlFor('gs_admin', 'local-admin-only'), superuser: urlFor(serverUrl.username, serverUrl.password),
  };
  try {
    const bootstrap = new pg.Pool({ connectionString: urls.superuser });
    try { await bootstrap.query(await readFile(new URL('../../../infra/db/roles.sql', import.meta.url), 'utf8')); }
    finally { await bootstrap.end(); }
    execFileSync(process.execPath, [fileURLToPath(new URL('../../../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, MIGRATION_DATABASE_URL: urls.owner }, stdio: 'pipe',
    });
    const tenantDb = new TenantDb(urls.app, max);
    const admin = createClient(urls.admin);
    return { name, urls, server, tenantDb, admin, async close() {
      await Promise.all([tenantDb.onApplicationShutdown(), admin.$disconnect()]);
      await server.query(`DROP DATABASE "${name}" WITH (FORCE)`); await server.end();
    } };
  } catch (error) {
    await server.query(`DROP DATABASE "${name}" WITH (FORCE)`); await server.end(); throw error;
  }
}
export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

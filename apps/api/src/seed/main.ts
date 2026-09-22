import { loadDatabaseConfig } from '../config.js';
import { AdminDb } from '../db/admin-db.js';
import { assertRuntimeRole } from '../db/role-check.js';
import { runSeed } from './seed.js';
if (process.env.SEED_DEMO_DATA !== 'true') {
  process.stdout.write('Demo seed skipped. Set SEED_DEMO_DATA=true to import the challenge data.\n');
} else {
  const db = new AdminDb(loadDatabaseConfig().privilegedUrl);
  try {
    await assertRuntimeRole(db.client, 'privileged');
    process.stdout.write(`${JSON.stringify(await runSeed({ db, enabled: true }))}\n`);
  } catch {
    process.stderr.write('Demo seed failed. Check input files, database access, and conflicting existing data.\n');
    process.exitCode = 1;
  } finally { await db.close(); }
}

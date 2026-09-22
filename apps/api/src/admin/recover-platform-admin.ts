import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmailSchema, PasswordSchema } from '@greenstate/contracts';
import { AdminDb } from '../db/admin-db.js';
import { Passwords } from '../identity/passwords.js';
import { readHiddenPassword } from './password-prompt.js';

export async function recoverPlatformAdmin(url: string, email: string, password: string): Promise<void> {
  const normalizedEmail = EmailSchema.parse(email);
  PasswordSchema.parse(password);
  if (!url) throw new Error('Administrative credentials are required.');
  const db = new AdminDb(url);
  try {
    const roles = await db.client.$queryRaw<{ allowed: boolean }[]>`
      SELECT (rolsuper OR pg_has_role(current_user, 'gs_owner', 'MEMBER')) AS allowed
      FROM pg_roles WHERE rolname = current_user`;
    if (!roles[0]?.allowed) throw new Error('Administrative database ownership is required.');
    const passwordHash = await new Passwords().hash(password);
    await db.transaction(async tx => {
      const users = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM platform_users WHERE email = ${normalizedEmail} FOR UPDATE`;
      const user = users[0];
      if (!user) throw new Error('The account does not exist.');
      await tx.platformUser.update({ where: { id: user.id }, data: { passwordHash, credentialVersion: { increment: 1 }, mustChangePassword: false } });
      await tx.platformSession.deleteMany({ where: { userId: user.id } });
    });
  } finally { await db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--email' || !args[1] || !process.env.RECOVERY_DATABASE_URL) throw new Error('Invalid recovery invocation.');
    const password = await readHiddenPassword(process.stdin, process.stderr);
    await recoverPlatformAdmin(process.env.RECOVERY_DATABASE_URL, args[1], password);
    process.stdout.write('Password recovered.\n');
  } catch {
    process.stderr.write('Recovery failed. Check account, input, and administrative database access.\n');
    process.exitCode = 1;
  }
}

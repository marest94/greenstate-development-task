import type { PrismaClient } from '../generated/prisma/client.js';
export async function assertRuntimeRole(client: PrismaClient, realm: 'ordinary' | 'privileged') {
  const rows = await client.$queryRaw<{ superuser: boolean; bypass: boolean; elevated: boolean; ddl: boolean; owns: boolean }[]>`
    SELECT r.rolsuper AS superuser,
      EXISTS (SELECT 1 FROM pg_roles p WHERE p.rolbypassrls AND pg_has_role(current_user, p.oid, 'MEMBER')) AS bypass,
      EXISTS (SELECT 1 FROM pg_roles p WHERE (p.rolsuper OR p.rolcreatedb OR p.rolcreaterole) AND pg_has_role(current_user, p.oid, 'MEMBER')) AS elevated,
      has_schema_privilege(current_user, 'public', 'CREATE') AS ddl,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND pg_has_role(current_user, c.relowner, 'MEMBER')) AS owns
    FROM pg_roles r WHERE r.rolname = current_user`;
  const role = rows[0];
  if (!role || role.superuser || role.elevated || role.ddl || role.owns || (realm === 'ordinary' && role.bypass)) {
    throw new Error(`Unsafe ${realm} database role`);
  }
}

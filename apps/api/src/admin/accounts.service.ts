import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AccountsPage, AccountsQuery, HostCreate, TenantAccount } from '@greenstate/contracts';
import { Prisma, type TenantUser } from '../generated/prisma/client.js';
import { AdminDb } from '../db/admin-db.js';
import { AppError } from '../common/http/errors.js';
import { Passwords } from '../identity/passwords.js';
import { Clock } from '../common/time/clock.js';
type AccountRecord = Pick<TenantUser, 'id' | 'tenantId' | 'name' | 'email' | 'role' | 'mustChangePassword'> & { createdAt: Date | string; disabledAt: Date | string | null };
function toAccount(row: AccountRecord): TenantAccount { return { id: row.id, tenantId: row.tenantId, name: row.name, email: row.email, role: row.role === 'host' ? 'host' : 'client', mustChangePassword: row.mustChangePassword, createdAt: new Date(row.createdAt).toISOString(), disabledAt: row.disabledAt ? new Date(row.disabledAt).toISOString() : null }; }
const notFound = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.');
@Injectable()
export class AccountsService {
  constructor(@Inject(AdminDb) private readonly database: AdminDb | null, @Inject(Passwords) private readonly passwords: Passwords, @Inject(Clock) private readonly clock: Clock) {}
  private db() { if (!this.database) throw new ServiceUnavailableException(); return this.database; }
  list(tenantId: string, query: AccountsQuery): Promise<AccountsPage> {
    const conditions = [Prisma.sql`tenant_id = ${tenantId}::uuid`];
    if (query.email) conditions.push(Prisma.sql`position(${query.email.toLowerCase()} in email) > 0`);
    if (query.role) conditions.push(Prisma.sql`role = ${query.role}`);
    if (query.status !== 'all') conditions.push(query.status === 'disabled' ? Prisma.sql`disabled_at IS NOT NULL` : Prisma.sql`disabled_at IS NULL`);
    return this.db().forTenant(tenantId, 'shared', async tx => {
      const [result] = await tx.$queryRaw<{ total: number; items: AccountRecord[] }[]>(Prisma.sql`WITH matching AS MATERIALIZED (
        SELECT id, tenant_id AS "tenantId", name, email, role, must_change_password AS "mustChangePassword", created_at AS "createdAt", disabled_at AS "disabledAt"
        FROM tenant_users WHERE ${Prisma.join(conditions, ' AND ')}
      ) SELECT (SELECT count(*)::int FROM matching) AS total,
        COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT * FROM matching ORDER BY email COLLATE "C", id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}) p), '[]'::jsonb) AS items`);
      return { total: result!.total, items: result!.items.map(toAccount), page: query.page, pageSize: query.pageSize };
    });
  }
  async createHost(tenantId: string, input: HostCreate) {
    const passwordHash = await this.passwords.hash(input.temporaryPassword);
    try {
      return await this.db().forTenant(tenantId, 'shared', async tx => toAccount(await tx.tenantUser.create({ data: { tenantId, name: input.name, email: input.email, passwordHash, role: 'host', mustChangePassword: true } })));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with this email already exists. Promote an existing client explicitly instead.');
      throw error;
    }
  }
  private async lock(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
    await tx.$queryRaw`SELECT id FROM tenant_users WHERE tenant_id = ${tenantId}::uuid AND id = ${userId}::uuid FOR UPDATE`;
    const user = await tx.tenantUser.findUnique({ where: { id: userId, tenantId } }); if (!user) throw notFound(); return user;
  }
  setDisabled(tenantId: string, userId: string, disabled: boolean) {
    return this.db().forTenant(tenantId, 'shared', async tx => {
      const user = await this.lock(tx, tenantId, userId);
      if (user.role !== 'host') throw new AppError(400, 'HOST_REQUIRED', 'Only host accounts can be disabled or re-enabled.');
      await tx.tenantUser.update({ where: { id: userId, tenantId }, data: { disabledAt: disabled ? user.disabledAt ?? this.clock.now() : null, ...(disabled ? { credentialVersion: { increment: 1 } } : {}) } });
      if (disabled) await tx.tenantSession.deleteMany({ where: { tenantId, userId } });
    });
  }
  async reset(tenantId: string, userId: string, temporaryPassword: string, promote: boolean) {
    const passwordHash = await this.passwords.hash(temporaryPassword);
    await this.db().forTenant(tenantId, 'shared', async tx => {
      const user = await this.lock(tx, tenantId, userId);
      if (promote && user.role !== 'client') throw new AppError(409, 'CLIENT_REQUIRED', 'Only an existing client can be promoted to host.');
      await tx.tenantUser.update({ where: { id: userId, tenantId }, data: { passwordHash, credentialVersion: { increment: 1 }, mustChangePassword: true, ...(promote ? { role: 'host' } : {}) } });
      await tx.tenantSession.deleteMany({ where: { tenantId, userId } });
    });
  }
}

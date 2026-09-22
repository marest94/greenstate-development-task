import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TenantDb } from '../db/tenant-db.js';
import type { Prisma } from '../generated/prisma/client.js';
@Injectable()
export class SessionsRepository {
  constructor(@Inject(TenantDb) private readonly database: TenantDb | null) {}
  private db() { if (!this.database) throw new ServiceUnavailableException(); return this.database; }
  read<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) { return this.db().run(tenantId, fn); }
  write<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) { return this.db().write(tenantId, fn); }
  async lock(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
    await tx.$queryRaw`SELECT id FROM tenant_users WHERE tenant_id = ${tenantId}::uuid AND id = ${userId}::uuid FOR UPDATE`;
    return tx.tenantUser.findUnique({ where: { id: userId, tenantId } });
  }
}

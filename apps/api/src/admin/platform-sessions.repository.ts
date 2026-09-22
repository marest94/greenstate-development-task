import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AdminDb } from '../db/admin-db.js';
import type { Prisma } from '../generated/prisma/client.js';
@Injectable()
export class PlatformSessionsRepository {
  constructor(@Inject(AdminDb) private readonly database: AdminDb | null) {}
  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) { if (!this.database) throw new ServiceUnavailableException(); return this.database.transaction(fn); }
  async lock(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM platform_users WHERE id = ${userId}::uuid FOR UPDATE`;
    return tx.platformUser.findUnique({ where: { id: userId } });
  }
}

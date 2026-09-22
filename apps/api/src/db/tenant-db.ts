import { createClient } from './client.js';
import { lockLiveTenant } from './tenant-lock.js';
import { Prisma } from '../generated/prisma/client.js';
export class TenantDb {
  readonly client;
  constructor(url: string, max = 10) { this.client = createClient(url, max); }
  run<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.client.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
  write<T>(tenantId: string, fn: (tx: Prisma.TransactionClient, tenant: Awaited<ReturnType<typeof lockLiveTenant>>) => Promise<T>) {
    return this.run(tenantId, async tx => fn(tx, await lockLiveTenant(tx, tenantId, 'shared')));
  }
  async onApplicationShutdown() { await this.client.$disconnect(); }
}

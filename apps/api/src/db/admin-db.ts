import { createClient } from './client.js';
import { Prisma } from '../generated/prisma/client.js';
import { lockLiveTenant } from './tenant-lock.js';

// This pool is deliberately absent from ordinary feature-module providers. Administration,
// platform identity, seed and local recovery are its only application consumers.
export class AdminDb {
  readonly client;
  constructor(url: string) { this.client = createClient(url); }
  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.client.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
  forTenant<T>(tenantId: string, mode: 'shared' | 'exclusive', fn: (tx: Prisma.TransactionClient, tenant: Awaited<ReturnType<typeof lockLiveTenant>>) => Promise<T>) {
    return this.transaction(async tx => fn(tx, await lockLiveTenant(tx, tenantId, mode)));
  }
  async close() { await this.client.$disconnect(); }
}

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
export function createClient(connectionString: string, max = 10) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max, connectionTimeoutMillis: 5000 }) });
}

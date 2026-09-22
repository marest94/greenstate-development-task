import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../common/http/errors.js';
// Call only after shared live-tenant coordination. Saving, archiving, capacity changes and
// calendar writes lock this same row before reading their current preconditions.
export async function lockListing(tx: Prisma.TransactionClient, tenantId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM listings WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  const listing = await tx.listing.findFirst({ where: { id, tenantId } });
  if (!listing) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The requested resource was not found.');
  return listing;
}

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../src/generated/prisma/client.js';
export const listingData = (tenantId: string) => ({
  id: randomUUID(), tenantId, title: 'Quiet apartment', city: 'Berlin', country: 'DE',
  latitude: 52.52, longitude: 13.4, propertyType: 'apartment', maxGuests: 4, bedrooms: 2,
  pricePerNightCents: 12000, currency: 'EUR', rating: null, reviewCount: 0, createdAt: new Date('2026-01-01'),
});
export async function inventoryFixture(admin: PrismaClient) {
  const a = await admin.tenant.create({ data: { name: 'Tenant A', slug: `tenant-a-${randomUUID()}`, timezone: 'Europe/Berlin' } });
  const b = await admin.tenant.create({ data: { name: 'Tenant B', slug: `tenant-b-${randomUUID()}`, timezone: 'Europe/Lisbon' } });
  const listingA = await admin.listing.create({ data: listingData(a.id) });
  const listingB = await admin.listing.create({ data: listingData(b.id) });
  return { a, b, listingA, listingB };
}

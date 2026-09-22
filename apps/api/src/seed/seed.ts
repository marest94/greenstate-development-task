import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { AdminDb } from '../db/admin-db.js';
import { mapData } from './map-data.js';
import { toDbDate } from '../common/time/dates.js';

const SeedCountsSchema = z.object({ listings: z.number().int(), bookings: z.number().int(), tenants: z.number().int() });
export type SeedCounts = z.infer<typeof SeedCountsSchema>;
export type SeedOptions = { db: AdminDb; enabled: boolean; listingsCsv?: string; bookingsCsv?: string };
export const DEMO_TENANTS = [
  { id: '11111111-1111-4111-8111-111111111111', slug: 'greenstate', name: 'GreenState Stays', timezone: 'Europe/Berlin', primaryColor: '#173d32' },
  { id: '22222222-2222-4222-8222-222222222222', slug: 'citystays', name: 'City Stays', timezone: 'Europe/Lisbon', primaryColor: '#39446f' },
] as const;
export async function runSeed(options: SeedOptions): Promise<SeedCounts> {
  if (!options.enabled) throw new Error('Explicit demo-data opt-in is required.');
  const [listingsCsv, bookingsCsv] = await Promise.all([
    options.listingsCsv ?? readFile(new URL('../../../../data/listings.csv', import.meta.url), 'utf8'),
    options.bookingsCsv ?? readFile(new URL('../../../../data/bookings.csv', import.meta.url), 'utf8'),
  ]);
  // Validate all source rows before starting any transaction or writing a completion marker.
  const data = mapData(listingsCsv, bookingsCsv);
  const checksum = createHash('sha256').update(listingsCsv).update('\0').update(bookingsCsv).digest('hex');
  const sorted = [...data.listings].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const tenantByListing = new Map(sorted.map((row, index) => [row.id, DEMO_TENANTS[index % DEMO_TENANTS.length]!.id]));
  return options.db.transaction(async tx => {
    // Namespace 7102 is independent of per-tenant lifecycle locks; key 1 serializes inventory import.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7102, 1)`;
    const previous = await tx.seedRun.findUnique({ where: { key: 'inventory' } });
    if (previous) {
      if (previous.version !== 1 || previous.checksum !== checksum) throw new Error('Seed inputs differ from previously imported inventory.');
      return SeedCountsSchema.parse(previous.counts);
    }
    await tx.tenant.createMany({ data: [...DEMO_TENANTS] });
    await tx.listing.createMany({ data: sorted.map(row => ({ ...row, tenantId: tenantByListing.get(row.id)!, createdAt: toDbDate(row.createdAt) })) });
    for (let offset = 0; offset < data.bookings.length; offset += 1000) {
      await tx.booking.createMany({ data: data.bookings.slice(offset, offset + 1000).map(row => ({
        ...row, tenantId: tenantByListing.get(row.listingId)!, checkIn: toDbDate(row.checkIn), checkOut: toDbDate(row.checkOut),
      })) });
    }
    const counts = { listings: data.listings.length, bookings: data.bookings.length, tenants: DEMO_TENANTS.length };
    await tx.seedRun.create({ data: { key: 'inventory', version: 1, checksum, counts } });
    return counts;
  }, { timeout: 60_000 });
}

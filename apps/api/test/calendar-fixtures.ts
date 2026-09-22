import { randomUUID } from 'node:crypto';
import type { TestDatabase } from './setup.js';
import { Passwords } from '../src/identity/passwords.js';
const fixtureHash = new Passwords().hash('A calendar integration fixture passphrase');
import { newSession } from '../src/identity/session-token.js';
export const calendarNow = new Date('2026-10-01T22:30:00Z');
export const calendarCsrf = { Origin: 'http://localhost:5173', 'X-Requested-By': 'greenstate-web' };
export async function calendarAccount(db: TestDatabase, tenantId: string, role = 'host', mustChangePassword = false) {
  const user = await db.admin.tenantUser.create({ data: { tenantId, role, mustChangePassword, email: `${randomUUID()}@example.test`, passwordHash: await fixtureHash } });
  const session = newSession(calendarNow);
  await db.admin.tenantSession.create({ data: { ...session.record, tenantId, userId: user.id } });
  return `gs_t_${tenantId}=${session.token}`;
}
export async function calendarPlatformAccount(db: TestDatabase) {
  const user = await db.admin.platformUser.create({ data: { email: `${randomUUID()}@example.test`, passwordHash: await fixtureHash } });
  const session = newSession(calendarNow);
  await db.admin.platformSession.create({ data: { ...session.record, userId: user.id } });
  return `gs_platform=${session.token}`;
}
export const bookingData = (tenantId: string, listingId: string, checkIn = '2026-10-10', checkOut = '2026-10-12', status = 'confirmed') => ({ id: randomUUID(), tenantId, listingId, checkIn: new Date(checkIn), checkOut: new Date(checkOut), guests: 4, status });

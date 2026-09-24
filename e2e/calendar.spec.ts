import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect } from '@playwright/test';
import { BookingsPageSchema, ListingPageSchema } from '@greenstate/contracts';
import { test, provisionHostFixture } from './fixtures.js';
const shiftDate = (date: string, days: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
const readableDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
async function provisionBookingHistory(tenantId: string, listingId: string, today: string) {
  // Isolated imported-stay fixtures for this new listing; the application has no booking writes.
  const stays = [
    { id: randomUUID(), from: shiftDate(today, -10), to: shiftDate(today, -8), guests: 4, status: 'confirmed' },
    { id: randomUUID(), from: shiftDate(today, -1), to: shiftDate(today, 1), guests: 2, status: 'confirmed' },
    { id: randomUUID(), from: shiftDate(today, 7), to: shiftDate(today, 9), guests: 3, status: 'confirmed' },
    { id: randomUUID(), from: shiftDate(today, 12), to: shiftDate(today, 14), guests: 1, status: 'cancelled' },
  ];
  const pool = new Pool({ connectionString: process.env.STACK_TEST_ADMIN_DATABASE_URL ?? 'postgresql://gs_admin:local-admin-only@127.0.0.1:54329/greenstate', max: 1 });
  try {
    for (const stay of stays) await pool.query('INSERT INTO bookings (id, tenant_id, listing_id, check_in, check_out, guests, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [stay.id, tenantId, listingId, stay.from, stay.to, stay.guests, stay.status]);
  } finally { await pool.end(); }
  return stays;
}
test('host manages calendar blocks and inspects archived booking history without changing imported stays', async ({ page }, testInfo) => {
  const tenant = await (await page.request.get('/api/v1/t/greenstate')).json();
  const host = await provisionHostFixture(tenant.id); const title = `000 Calendar home ${randomUUID()}`;
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/greenstate/login'); await page.getByLabel('Email', { exact: true }).fill(host.email); await page.getByLabel('Password', { exact: true }).fill(host.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/greenstate\/password/);
  await page.goto('/greenstate/host/bookings'); await expect(page).toHaveURL(/\/greenstate\/password/);
  await expect(page.getByRole('heading', { name: 'Booking history', exact: true })).not.toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill(host.password); await page.getByLabel('New password', { exact: true }).fill(`Changed calendar host ${randomUUID()}!`);
  await page.getByRole('button', { name: 'Change password', exact: true }).click(); await expect(page).toHaveURL(/\/greenstate\/host\/bookings$/);
  await page.getByRole('link', { name: 'Host workspace', exact: true }).click(); await page.getByRole('link', { name: 'Create listing', exact: true }).click();
  for (const [label, value] of Object.entries({ Title: title, Description: 'A calendar journey home.', City: 'Berlin', 'Country code': 'DE', Latitude: '52.52', Longitude: '13.4', 'Maximum guests': '4', Bedrooms: '2', 'Price per night (€)': '123.45' })) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Create listing', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Your inventory', exact: true })).toBeVisible();
  await expect(page).toHaveTitle(/Inventory/); expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('status').getByRole('link', { name: `Edit ${title}`, exact: true }).click(); await expect(page.getByRole('heading', { name: 'Edit listing', exact: true })).toBeVisible();
  const listingId = new URL(page.url()).pathname.split('/').at(-1)!;
  const today = ListingPageSchema.parse(await (await page.request.get('/api/v1/t/greenstate/listings?pageSize=1')).json()).today;
  const stays = await provisionBookingHistory(tenant.id, listingId, today); const freeDay = shiftDate(today, 2); const checkout = shiftDate(freeDay, 1);
  const publicAvailability = `/api/v1/t/greenstate/listings/${listingId}/availability?from=${freeDay}&to=${checkout}`;
  expect((await (await page.request.get(publicAvailability)).json()).days).toEqual([{ date: freeDay, available: true }]);
  await page.getByRole('link', { name: 'Calendar', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Listing calendar', exact: true })).toBeVisible();
  await page.getByLabel('Calendar month', { exact: true }).fill(freeDay.slice(0, 7));
  await page.getByRole('button', { name: `${readableDate(freeDay)}, available`, exact: true }).press('Enter');
  await page.getByLabel('Reason (optional)', { exact: true }).focus(); await page.keyboard.insertText('Prepare the courtyard for guests.'); await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Block day', exact: true })).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: `${readableDate(freeDay)}, blocked`, exact: true })).toBeVisible();
  await expect(page.getByText('Prepare the courtyard for guests.', { exact: true })).toBeVisible();
  expect((await (await page.request.get(publicAvailability)).json()).days).toEqual([{ date: freeDay, available: false }]);
  await expect(page.getByText(new RegExp(`Tenant business date: ${readableDate(today)}`))).toContainText(tenant.timezone);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('host-calendar.png'), fullPage: true });
  await page.getByRole('button', { name: 'Remove block', exact: true }).press('Enter'); await expect(page.getByRole('button', { name: `${readableDate(freeDay)}, available`, exact: true })).toBeVisible();
  expect((await (await page.request.get(publicAvailability)).json()).days).toEqual([{ date: freeDay, available: true }]);
  await page.getByRole('link', { name: 'Edit listing', exact: true }).click(); await page.getByRole('button', { name: 'Archive listing', exact: true }).click(); await page.getByRole('button', { name: 'Confirm archive', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore listing', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Booking history', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/greenstate/host/bookings\\?listingId=${listingId}$`));
  await page.goto(`/greenstate/host/bookings?listingId=${listingId}&pageSize=2`);
  const table = page.getByRole('table', { name: 'Booking history', exact: true });
  await expect(table.getByRole('row')).toHaveCount(3); await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await expect(table.getByText('Cancelled', { exact: true })).toBeVisible(); await expect(table.getByText('Future', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  await expect(table.getByText('Past', { exact: true })).toBeVisible(); await expect(table.getByText('Current', { exact: true })).toBeVisible();
  await expect(table.getByRole('button')).toHaveCount(0); await expect(table.getByRole('textbox')).toHaveCount(0);
  await page.getByLabel('Imported status', { exact: true }).selectOption('confirmed'); await page.getByLabel('From date', { exact: true }).fill(shiftDate(today, -11)); await page.getByLabel('To date (exclusive)', { exact: true }).fill(shiftDate(today, -7));
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await expect(page.getByText('1 booking', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Next page', exact: true })).not.toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(2); await expect(table.getByText('Confirmed', { exact: true })).toBeVisible(); await expect(table.getByText('Past', { exact: true })).toBeVisible(); await expect(table.getByText(readableDate(stays[0]!.to), { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Imported status', { exact: true })).toHaveValue('confirmed'); await expect(table.getByRole('row')).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get('pageSize')).toBe('2'); expect(new URL(page.url()).searchParams.get('page')).toBe('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('host-booking-history.png'), fullPage: true });
  await table.getByRole('link', { name: title, exact: true }).click(); await expect(page.getByRole('button', { name: 'Restore listing', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Calendar', exact: true }).click(); await page.getByLabel('Calendar month', { exact: true }).fill(stays[0]!.from.slice(0, 7));
  await page.getByRole('button', { name: `${readableDate(stays[0]!.from)}, booked, past`, exact: true }).press('Enter');
  await expect(page.getByText('4 guests', { exact: true })).toBeVisible(); await expect(page.getByText('Past', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Block day', exact: true })).not.toBeVisible();
  const response = await page.request.get(`/api/v1/t/greenstate/host/bookings?listingId=${listingId}&pageSize=50`); expect(response.status()).toBe(200);
  const history = BookingsPageSchema.parse(await response.json()); expect(history.total).toBe(4);
  expect(history.items.map(item => ({ id: item.id, from: item.checkIn, to: item.checkOut, guests: item.guests, status: item.status })).sort((a, b) => a.id.localeCompare(b.id))).toEqual([...stays].sort((a, b) => a.id.localeCompare(b.id)));
  expect(pageErrors).toEqual([]);
});

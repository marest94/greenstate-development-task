import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { test, provisionHostFixture } from './fixtures.js';
import { administrator, changePassword, login, register } from './auth-helpers.js';
import { observeBrowserErrors } from './browser-errors.js';
const password = 'A private security journey password 2026!';

async function activateTab(page: Page) {
 await page.bringToFront();
 // Playwright keeps headless Chromium tabs focused. Deliver the activation event
 // explicitly; the application still checks its real cookie against the real API.
 await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test('anonymous and client access stays within tenant and role boundaries', async ({ page, baseURL }) => {
 for (const path of ['/greenstate/saved', '/greenstate/host/listings', '/admin/tenants']) { await page.goto(path); await expect(page).toHaveURL(/\/login(?:\?|$)/); }
 await register(page, `security-client-${randomUUID()}@example.test`, password); await page.goto('/greenstate/host/listings'); await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
 const headers = { Origin: new URL(baseURL!).origin, 'X-Requested-By': 'greenstate-web' };
 expect((await page.request.get('/api/v1/t/greenstate/host/listings')).status()).toBe(403);
 expect((await page.request.get('/api/v1/admin/tenants')).status()).toBe(401);
 expect((await page.request.get('/api/v1/t/citystays/me/saved-listings')).status()).toBe(401);
 const foreign = (await (await page.request.get('/api/v1/t/citystays/listings?pageSize=1')).json()).items[0];
 expect((await page.request.get(`/api/v1/t/greenstate/listings/${foreign.id}`)).status()).toBe(404);
 expect((await page.request.put(`/api/v1/t/greenstate/me/saved-listings/${foreign.id}`, { headers })).status()).toBe(404);
 const listing = (await (await page.request.get('/api/v1/t/greenstate/listings?pageSize=1')).json()).items[0];
 expect((await page.request.put(`/api/v1/t/greenstate/me/saved-listings/${listing.id}`, { headers, data: { userId: randomUUID() } })).status()).toBe(400);
 expect((await page.request.put(`/api/v1/t/greenstate/me/saved-listings/${listing.id}`)).status()).toBe(403);
 expect((await page.request.post('/api/v1/t/greenstate/auth/register', { headers, data: { email: `injected-${randomUUID()}@example.test`, password, role: 'host' } })).status()).toBe(400);
 const injection = await page.request.get('/api/v1/t/greenstate/listings', { params: { city: "Berlin' OR 1=1 --" } }); expect(injection.status()).toBe(200); expect((await injection.json()).total).toBe(0);
 const crossTenantRequests: string[] = []; page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/v1/t/citystays/')) crossTenantRequests.push(req.url()); });
 await page.goto(`/greenstate/listings/..%2F..%2Fcitystays%2Flistings%2F${foreign.id}`); await expect(page.getByRole('heading', { name: 'Page unavailable', exact: true })).toBeVisible();
 await expect(page.getByRole('heading', { name: foreign.title, exact: true })).not.toBeVisible(); expect(crossTenantRequests).toEqual([]);

});

test('another tab observes logout and cannot display the previous account’s shortlist after account switching', async ({ page, context, browserErrors }) => {
 await register(page, `tab-owner-${randomUUID()}@example.test`, password); const listing = (await (await page.request.get('/api/v1/t/greenstate/listings?pageSize=1')).json()).items[0];
 await page.goto(`/greenstate/listings/${listing.id}`); await page.getByRole('button', { name: `Save ${listing.title}`, exact: true }).click(); await expect(page.getByRole('button', { name: `Remove ${listing.title} from saved listings`, exact: true })).toBeVisible();
 const second = await context.newPage(); observeBrowserErrors(second, browserErrors); await second.goto('/greenstate/saved'); await expect(second.getByRole('link', { name: listing.title, exact: true })).toBeVisible();
 await activateTab(page); await page.goto('/greenstate/account'); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/greenstate\/login/);
 await activateTab(second); await expect(second).toHaveURL(/\/greenstate\/login/); await expect(second.getByRole('link', { name: listing.title, exact: true })).not.toBeVisible();
 await activateTab(page); await register(page, `tab-other-${randomUUID()}@example.test`, password); await activateTab(second); await second.goto('/greenstate/saved'); await expect(second.getByRole('heading', { name: 'Your shortlist starts here', exact: true })).toBeVisible();
 expect((await (await second.request.get('/api/v1/t/greenstate/me/saved-listings')).json()).items).toEqual([]);
 await second.close();
});

test('host tabs revoke access on admin disable and reset while retaining data and escaping listing text', async ({ page, context, browser, baseURL, browserErrors }) => {
 test.setTimeout(90000); const tenant = await (await page.request.get('/api/v1/t/greenstate')).json(); const host = await provisionHostFixture(tenant.id); const changed = `Changed secure host ${randomUUID()}!`; const temporary = `Reset secure host ${randomUUID()}!`;
 await login(page, 'greenstate', host.email, host.password); await changePassword(page, host.password, changed, 'greenstate'); const principal = await (await page.request.get('/api/v1/t/greenstate/auth/me')).json(); const headers = { Origin: new URL(baseURL!).origin, 'X-Requested-By': 'greenstate-web' };
 const title = `<img src=x onerror=window.injected=true> ${randomUUID()}`;
 const response = await page.request.post('/api/v1/t/greenstate/host/listings', { headers, data: { title, description: '<script>window.injected=true</script>', city: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.4, propertyType: 'apartment', maxGuests: 2, bedrooms: 1, pricePerNightCents: 10000 } }); expect(response.status()).toBe(201); const listing = await response.json();
 await page.goto(`/greenstate/listings/${listing.id}`); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); await expect(page.getByText('<script>window.injected=true</script>', { exact: true })).toBeVisible(); expect(await page.locator('img[src="x"]').count()).toBe(0); expect(await page.evaluate(() => Object.hasOwn(window, 'injected'))).toBe(false);
 await page.getByRole('button', { name: `Save ${title}`, exact: true }).click(); await expect(page.getByRole('button', { name: `Remove ${title} from saved listings`, exact: true })).toBeVisible();
 const second = await context.newPage(); observeBrowserErrors(second, browserErrors); await second.goto('/greenstate/saved'); await expect(second.getByRole('link', { name: title, exact: true })).toBeVisible();
 const adminContext = await browser.newContext({ baseURL, viewport: page.viewportSize() }); const admin = await adminContext.newPage(); observeBrowserErrors(admin, browserErrors);
 try {
  await administrator(admin); const path = `/api/v1/admin/tenants/${tenant.id}/accounts/${principal.id}`;
  expect((await admin.request.post(`${path}/disable`, { headers })).status()).toBe(204); await activateTab(second); await expect(second).toHaveURL(/\/greenstate\/login/); await expect(second.getByRole('link', { name: title, exact: true })).not.toBeVisible();
  expect((await admin.request.post(`${path}/enable`, { headers })).status()).toBe(204); expect((await second.request.get('/api/v1/t/greenstate/auth/me')).status()).toBe(401);
  await activateTab(page); await login(page, 'greenstate', host.email, changed); await expect(page).toHaveURL(/\/greenstate\/account$/); await second.goto('/greenstate/saved'); await expect(second.getByRole('link', { name: title, exact: true })).toBeVisible();
  await activateTab(admin); expect((await admin.request.post(`${path}/password-reset`, { headers, data: { temporaryPassword: temporary } })).status()).toBe(204); await activateTab(second); await expect(second).toHaveURL(/\/greenstate\/login/);
  await activateTab(page); await login(page, 'greenstate', host.email, temporary); await expect(page).toHaveURL(/\/greenstate\/password/); await activateTab(second); await expect(second).toHaveURL(/\/greenstate\/password/); await expect(second.getByRole('link', { name: title, exact: true })).not.toBeVisible();
  await activateTab(page); await changePassword(page, temporary, `Recovered secure host ${randomUUID()}!`, 'greenstate'); await activateTab(second); await second.goto('/greenstate/saved'); await expect(second.getByRole('link', { name: title, exact: true })).toBeVisible();
 } finally { await second.close(); await adminContext.close(); }
});

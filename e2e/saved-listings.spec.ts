import { test } from './fixtures.js';
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
const password = 'A saved-list browser password 2026!';
async function register(page: Page, email: string) {
  await page.goto('/greenstate/register'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(page).toHaveURL(/\/greenstate\/account$/);
}
async function logout(page: Page) {
  await page.goto('/greenstate/account'); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/greenstate\/login(?:\?|$)/);
}
test('save, reload, retain a private shortlist per account, and remove from listing details', async ({ page }, testInfo) => {
  const firstEmail = `saved-${randomUUID()}@example.test`; const secondEmail = `saved-other-${randomUUID()}@example.test`;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await register(page, firstEmail); await page.goto('/greenstate');
  const card = page.locator('.listing-card').first(); const title = await card.getByRole('heading').innerText();
  await card.getByRole('button', { name: `Save ${title}`, exact: true }).click();
  await expect(card.getByRole('button', { name: `Remove ${title} from saved listings`, exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator('.listing-card').first().getByRole('button', { name: `Remove ${title} from saved listings`, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Saved listings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved listings', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('saved-listings.png'), fullPage: true });
  await logout(page); await register(page, secondEmail); await page.goto('/greenstate/saved');
  await expect(page.getByRole('heading', { name: 'Your shortlist starts here', exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/v1/t/greenstate/me/saved-listings')).json()).items).toEqual([]);
  await logout(page); await page.getByLabel('Email', { exact: true }).fill(firstEmail); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/greenstate\/account$/); await page.goto('/greenstate/saved');
  await page.getByRole('link', { name: title, exact: true }).click();
  await page.getByRole('button', { name: `Remove ${title} from saved listings`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Save ${title}`, exact: true })).toBeVisible();
  await page.goto('/greenstate/saved'); await expect(page.getByRole('heading', { name: 'Your shortlist starts here', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});

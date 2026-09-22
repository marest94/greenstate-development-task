import { test } from './fixtures.js';
import { expect } from '@playwright/test';
import { ListingPageSchema } from '@greenstate/contracts';

test('illustrated cards retain search context and the gallery supports keyboard and touch navigation', async ({ page, request }, testInfo) => {
  const response = await request.get('/api/v1/t/greenstate/listings?city=Berlin&page=2');
  const listing = ListingPageSchema.parse(await response.json()).items[0]!;
  await page.goto('/greenstate?city=Berlin&page=2');
  const link = page.getByRole('link', { name: listing.title, exact: true });
  await link.click();
  await expect(page.getByRole('heading', { name: listing.title, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByText(/These images do not depict this stay/)).toBeVisible();
  const open = page.getByRole('button', { name: 'View all illustrations', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Stay inspiration' });
  await expect(dialog).toBeVisible();
  const initialImage = await dialog.getByRole('img').getAttribute('src');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('img')).not.toHaveAttribute('src', initialImage!);
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('img')).toHaveAttribute('src', initialImage!);
  await dialog.locator('figure').dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 250 }] });
  await dialog.locator('figure').dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 100 }] });
  await expect(dialog.getByRole('img')).not.toHaveAttribute('src', initialImage!);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await page.getByRole('button', { name: 'Close gallery', exact: true }).click();
  await expect(open).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('property-detail.png'), fullPage: true });
  await page.getByRole('link', { name: 'Back to listings', exact: true }).click();
  await expect(page).toHaveURL(/\/greenstate\?city=Berlin&page=2$/);
  await expect(page.getByRole('combobox', { name: 'City', exact: true })).toHaveValue('Berlin');
});

test('a failed tile provider leaves the property location and external map link usable', async ({ page, request }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 404, body: '' }));
  const response = await request.get('/api/v1/t/greenstate/listings?pageSize=1');
  const listing = ListingPageSchema.parse(await response.json()).items[0]!;
  await page.goto(`/greenstate/listings/${listing.id}`);
  const region = page.getByRole('region', { name: 'Property location', exact: true });
  await region.scrollIntoViewIfNeeded();
  await expect(region.getByRole('status')).toContainText('Map tiles could not be loaded');
  await expect(region.getByRole('link', { name: 'Open in OpenStreetMap', exact: true })).toHaveAttribute('href', `https://www.openstreetmap.org/?mlat=${listing.latitude}&mlon=${listing.longitude}#map=14/${listing.latitude}/${listing.longitude}`);
  await expect(page.getByRole('heading', { name: listing.title, exact: true })).toBeAttached();
});

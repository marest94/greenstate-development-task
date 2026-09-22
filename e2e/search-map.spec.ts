import { test } from './fixtures.js';
import { expect } from '@playwright/test';
import { ListingPageSchema } from '@greenstate/contracts';

test('map pins and cards stay synchronized through selection, pagination and filter removal', async ({ page, request }, testInfo) => {
  // Exercise fallback deterministically; visual QA separately checks live map tiles.
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 404, body: '' }));
  const firstResponse = await request.get('/api/v1/t/greenstate/listings?city=Berlin&pageSize=2');
  const firstPage = ListingPageSchema.parse(await firstResponse.json());
  const first = firstPage.items[0]!;
  await page.goto('/greenstate?city=Berlin&pageSize=2&view=map');
  await expect(page.getByRole('button', { name: 'Hide map', exact: true })).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Search results map' });
  await expect(panel).toContainText(`2 of ${firstPage.total} stays · Page 1`);
  const pin = panel.getByRole('button', { name: `Show ${first.title} on map`, exact: true });
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('link', { name: first.title, exact: true })).toBeVisible();
  await expect(page.locator('.listing-map-item.is-highlighted').getByRole('heading')).toHaveText(first.title);
  await page.getByRole('button', { name: `Locate ${firstPage.items[1]!.title} on map`, exact: true }).click();
  await expect(panel.getByRole('button', { name: `Show ${firstPage.items[1]!.title} on map`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(panel).toContainText('Page 2');
  await expect(panel.getByRole('button', { name: `Show ${first.title} on map`, exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('view')).toBe('map');
  await page.getByRole('button', { name: 'Remove city filter: Berlin', exact: true }).click();
  await expect(panel).toContainText('Page 1');
  expect(new URL(page.url()).searchParams.has('city')).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('search-map.png'), fullPage: true });
  await page.getByRole('button', { name: 'Hide map', exact: true }).click();
  await expect(panel).toHaveCount(0);
});

test('coincident property coordinates expose each stay under their shared pin', async ({ page, request }) => {
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ status: 404, body: '' }));
  const response = await request.get('/api/v1/t/greenstate/listings?pageSize=2');
  const data = ListingPageSchema.parse(await response.json());
  data.items[1] = { ...data.items[1]!, latitude: data.items[0]!.latitude, longitude: data.items[0]!.longitude };
  await page.route('**/api/v1/t/greenstate/listings?*', route => route.fulfill({ json: data }));
  await page.goto('/greenstate?pageSize=2&view=map');
  const panel = page.getByRole('complementary', { name: 'Search results map' });
  await panel.getByRole('button', { name: 'Show 2 stays at this location', exact: true }).click();
  await panel.getByRole('button', { name: new RegExp(data.items[1]!.title) }).click();
  await expect(panel.getByRole('link', { name: data.items[1]!.title, exact: true })).toBeVisible();
});

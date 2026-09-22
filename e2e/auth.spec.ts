import { test } from './fixtures.js';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
test('register, change password, sign in with a return path and keep portal accounts separate', async ({ page }, testInfo) => {
  const email = `browser-${randomUUID()}@example.test`;
  const password = 'A browser account password 2026!'; const changed = 'A replacement browser password 2026!';
  await page.goto('/greenstate/register');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/greenstate\/account$/); await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  const first = await (await page.request.get('/api/v1/t/greenstate/auth/me')).json();
  await page.getByRole('link', { name: 'Change password', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill(password); await page.getByLabel('New password', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/v1/t/greenstate/auth/me')).status()).toBe(401);
  const returnTo = '/greenstate?city=Berlin'; await page.goto(`/greenstate/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace('?', '\\?')}$`));
  await expect(page.getByRole('combobox', { name: 'City', exact: true })).toHaveValue('Berlin');
  await page.goto('/citystays/account'); await expect(page).toHaveURL(/\/citystays\/login/);
  await page.goto('/citystays/register'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(page).toHaveURL(/\/citystays\/account$/);
  const other = await (await page.request.get('/api/v1/t/citystays/auth/me')).json(); expect(other.id).not.toBe(first.id); expect(other.tenantId).not.toBe(first.tenantId);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/v1/t/citystays/auth/me')).status()).toBe(401);
  await page.goto('/greenstate/account'); await expect(page.getByText(email, { exact: true })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth })); expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]); expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('account.png'), fullPage: true });
});
test('routes provisioned host and platform accounts to forced password change', async ({ page }) => {
  for (const [base, email, password] of [['/greenstate', 'host@example.test', 'GreenState demo host 2026!'], ['/admin', 'admin@example.test', 'GreenState demo admin 2026!']]) {
    await page.goto(`${base}/login`); await page.getByLabel('Email', { exact: true }).fill(email!); await page.getByLabel('Password', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`${base}/password`));
    await expect(page.getByRole('heading', { name: 'Change your password', exact: true })).toBeVisible();
    await page.goto(`${base}/account`); await expect(page).toHaveURL(new RegExp(`${base}/password`));
    await expect(page.getByRole('heading', { name: 'Your account', exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  }
});

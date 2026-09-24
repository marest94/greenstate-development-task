import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { provisionPlatformFixture } from './fixtures.js';
export async function login(page: Page, scope: string, email: string, password: string) {
 await page.goto(`/${scope}/login`); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
export async function changePassword(page: Page, current: string, replacement: string, scope: string, expectedPath = scope === 'admin' ? '/admin/tenants' : `/${scope}/host/listings`) {
 await expect(page).toHaveURL(new RegExp(`/${scope}/password`)); await page.getByLabel('Current password', { exact: true }).fill(current); await page.getByLabel('New password', { exact: true }).fill(replacement); await page.getByRole('button', { name: 'Change password', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`${expectedPath}$`));
}
export async function administrator(page: Page) {
 const account = await provisionPlatformFixture(); await login(page, 'admin', account.email, account.password); await changePassword(page, account.password, `Changed administrator ${randomUUID()}!`, 'admin'); await page.getByRole('link', { name: 'Administration', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Tenants', exact: true })).toBeVisible();
}
export async function register(page: Page, email: string, password: string) {
 await page.goto('/greenstate/register'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(page).toHaveURL(/\/greenstate\/account$/);
}

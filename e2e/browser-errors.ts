import type { Page } from '@playwright/test';
export function observeBrowserErrors(page: Page, errors: string[]) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    // Journeys deliberately exercise validation/auth/not-found responses. Keep arbitrary
    // console errors and server failures visible instead of suppressing all resource errors.
    if (/^Failed to load resource: the server responded with a status of (400|401|403|404|409|429)\b/.test(message.text())) return;
    errors.push(message.text());
  });
}

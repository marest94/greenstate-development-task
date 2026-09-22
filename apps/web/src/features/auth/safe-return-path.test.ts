import { expect, it } from 'vitest';
import { safeReturnPath } from './safe-return-path';
it.each([
  ['/greenstate', '/greenstate'],
  ['/greenstate/listings/abc?from=2026-10-01&to=2026-10-04#availability', '/greenstate/listings/abc?from=2026-10-01&to=2026-10-04#availability'],
  ['/greenstate?city=New%20York', '/greenstate?city=New%20York'],
  ['/greenstate/account', '/greenstate/account'],
])('preserves the same-portal destination %s', (value, expected) => {
  expect(safeReturnPath(value, '/greenstate')).toBe(expected);
});
it.each([null, '', 'https://evil.test', '//evil.test', '/citystays/account', '/greenstate-other', '/admin/account',
  '/greenstate/../admin/account', '/greenstate/./login', '/greenstate/%2e%2e/admin', '/greenstate/%252e%252e/admin',
  '/greenstate/%2f%2fevil.test', '/greenstate/%5cevil.test', '/greenstate/%6cogin', '/greenstate/login',
  '/greenstate/register?returnTo=/greenstate/login', '/greenstate/password', '/greenstate/login/', '/greenstate/login/extra', '/greenstate/LOGIN', '/greenstate/Register/', '/greenstate/Password',
  '/greenstate\\evil.test', '/greenstate/\nadmin', ' /greenstate', '/greenstate/%zz',
])('falls back safely for %s', value => {
  expect(safeReturnPath(value, '/greenstate')).toBe('/greenstate/account');
});
it('keeps platform return destinations inside the platform realm', () => {
  expect(safeReturnPath('/admin/tenants?page=2', '/admin')).toBe('/admin/tenants?page=2');
  expect(safeReturnPath('/greenstate/account', '/admin')).toBe('/admin/account');
  expect(safeReturnPath('/admin/login?returnTo=/admin', '/admin')).toBe('/admin/account');
});

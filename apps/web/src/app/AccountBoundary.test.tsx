import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AuthProvider } from '../features/auth/AuthProvider';
import { ForcePasswordChange } from './AccountBoundary';
function mount(restricted: boolean, realm: 'tenant' | 'platform') {
  const platform = realm === 'platform'; const base = platform ? '/admin' : '/greenstate';
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const principal = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'example@example.test', realm, tenantId: platform ? null : tenantId, role: platform ? 'superadmin' : 'client', mustChangePassword: restricted, permissions: platform ? ['tenants:manage', 'accounts:manage'] : ['saved-listings:manage'] };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(principal))));
  const router = createMemoryRouter([{ path: base, element: <AuthProvider scope={platform ? { realm } : { realm, tenantId, slug: 'greenstate' }}><ForcePasswordChange><Outlet /></ForcePasswordChange></AuthProvider>, children: [{ index: true, element: <h1>Public portal</h1> }, { path: 'password', element: <h1>Password form fixture</h1> }] }], { initialEntries: [base] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>); return router;
}
it.each(['tenant', 'platform'] as const)('routes every restricted %s account to password change', async realm => {
  const router = mount(true, realm); expect(await screen.findByRole('heading', { name: 'Password form fixture' })).toBeVisible();
  expect(router.state.location.pathname).toBe(realm === 'tenant' ? '/greenstate/password' : '/admin/password');
  expect(screen.queryByRole('heading', { name: 'Public portal' })).not.toBeInTheDocument();
});
it('preserves public navigation for unrestricted accounts', async () => { mount(false, 'tenant'); expect(await screen.findByRole('heading', { name: 'Public portal' })).toBeVisible(); });

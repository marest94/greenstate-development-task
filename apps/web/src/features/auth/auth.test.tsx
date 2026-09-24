import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import type { Principal } from '@greenstate/contracts';
import { AuthProvider, type AuthScope } from './AuthProvider';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { AccountPage } from './AccountPage';
import { PasswordPage } from './PasswordPage';
import { RequirePermission } from './RequirePermission';
import { AuthNavigation } from './AuthNavigation';
const tenantId = '11111111-1111-4111-8111-111111111111';
const client: Principal = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId, realm: 'tenant', role: 'client', email: 'client@example.test', mustChangePassword: false, permissions: ['saved-listings:manage'] };
const host: Principal = { ...client, role: 'host', permissions: ['saved-listings:manage', 'listings:manage', 'calendar:manage', 'bookings:read'] };
const platform: Principal = { ...client, tenantId: null, realm: 'platform', role: 'superadmin', permissions: ['tenants:manage', 'accounts:manage'] };
const password = 'A long account password 2026';
const json = (body: unknown) => new Response(JSON.stringify(body));
const problem = (status: number, message: string, fields?: Record<string, string[]>, headers?: HeadersInit) => new Response(JSON.stringify({ status, code: 'TEST_FAILURE', message, requestId: 'r', ...(fields ? { fields } : {}) }), { status, headers });
function intercept(principal: Principal | null = null, mutation?: (url: string, options: RequestInit) => Response | Promise<Response>) {
  const requests: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (!options?.method || options.method === 'GET') return principal ? json(principal) : problem(401, 'Please sign in.');
    requests.push({ url, body: options.body ? JSON.parse(options.body as string) : undefined });
    return mutation ? mutation(url, options) : url.endsWith('/logout') ? new Response(null, { status: 204 }) : json(client);
  }));
  return requests;
}
function mount(path = '/greenstate/login', scope: AuthScope = { realm: 'tenant', tenantId, slug: 'greenstate' }) {
  const base = scope.realm === 'tenant' ? `/${scope.slug}` : '/admin';
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ element: <AuthProvider scope={scope}><nav aria-label="Account navigation"><AuthNavigation /></nav><Outlet /></AuthProvider>, children: [
    { path: `${base}/login`, element: <LoginPage /> }, { path: `${base}/register`, element: <RegisterPage /> },
    { path: `${base}/account`, element: <RequirePermission><AccountPage /></RequirePermission> },
    { path: `${base}/password`, element: <PasswordPage /> },
    { path: `${base}/protected`, element: <RequirePermission permission="listings:manage"><h1>Protected host content</h1></RequirePermission> },
    { path: `${base}/host/listings`, element: <h1>Your inventory</h1> }, { path: `${base}/tenants`, element: <h1>Tenants</h1> },
    { path: base, element: <h1>Explore stays</h1> },
  ] }], { initialEntries: [path] });
  render(<QueryClientProvider client={cache}><RouterProvider router={router} /></QueryClientProvider>);
  return { router, cache };
}
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }
function submit(label: string) { fireEvent.submit(screen.getByRole('button', { name: label }).closest('form')!); }
async function credentials(button: string) {
  await screen.findByRole('button', { name: button }); fill('Email', client.email); fill('Password', password); submit(button);
}
it('signs in once and restores a same-portal return destination', async () => {
  let resolve!: (response: Response) => void;
  const requests = intercept(null, () => new Promise<Response>(done => { resolve = done; }));
  const { router } = mount('/greenstate/login?returnTo=%2Fgreenstate%3Fcity%3DBerlin');
  await credentials('Sign in'); submit('Sign in');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled(); expect(requests).toHaveLength(1);
  expect(requests[0]).toEqual({ url: '/api/v1/t/greenstate/auth/login', body: { email: client.email, password } });
  await act(async () => resolve(json(client)));
  expect(await screen.findByRole('heading', { name: 'Explore stays' })).toBeVisible(); expect(router.state.location.search).toBe('?city=Berlin');
});
it('discards an unsafe return URL after registration and shows the account identity', async () => {
  const requests = intercept(); mount('/greenstate/register?returnTo=https%3A%2F%2Fevil.test'); await credentials('Create account');
  expect(await screen.findByRole('heading', { name: 'Your account' })).toBeVisible(); expect(screen.getByText(client.email)).toBeVisible();
  expect(requests[0]?.url).toBe('/api/v1/t/greenstate/auth/register');
  expect(screen.getByRole('link', { name: 'Change password' })).toHaveAttribute('href', '/greenstate/password');
});
it('validates registration fields before posting and focuses the accessible error feedback', async () => {
  const requests = intercept(); mount('/greenstate/register');
  await screen.findByRole('button', { name: 'Create account' }); fill('Email', 'invalid'); fill('Password', 'short'); submit('Create account');
  expect(await screen.findByRole('alert')).toHaveFocus(); expect(screen.getByLabelText('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAccessibleDescription(/15 to 128/); expect(requests).toHaveLength(0);
});
it('attaches API field errors to their inputs and clears the failed password', async () => {
  intercept(null, () => problem(409, 'This account could not be created.', { email: ['This email is already registered.'] })); mount('/greenstate/register'); await credentials('Create account');
  expect(await screen.findByRole('alert')).toHaveTextContent('This account could not be created.');
  expect(screen.getByLabelText('Email', { exact: true })).toHaveAccessibleDescription('This email is already registered.');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
});
it('shows a generic sign-in failure without retaining the failed password', async () => {
  intercept(null, () => problem(401, 'The email or password is incorrect.')); mount(); await credentials('Sign in');
  expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue(''); expect(screen.getByLabelText('Email', { exact: true })).toHaveValue(client.email);
});
it('shows the server retry delay after a throttled submission without automatically resubmitting', async () => {
  const requests = intercept(null, () => problem(429, 'Too many attempts.', undefined, { 'Retry-After': '60' })); mount(); await credentials('Sign in');
  expect(await screen.findByRole('alert')).toHaveTextContent(/60 seconds/); expect(requests).toHaveLength(1);
});
it('provides correct password-manager hints without persisting credentials', async () => {
  intercept(); mount('/greenstate/register'); await screen.findByRole('button', { name: 'Create account' });
  expect(screen.getByLabelText('Email', { exact: true })).toHaveAttribute('autocomplete', 'username');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
  await credentials('Create account'); await screen.findByRole('heading', { name: 'Your account' });
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
});
it('allows an unrestricted host into a real guard’s test-owned protected route', async () => {
  intercept(host); mount('/greenstate/protected'); expect(await screen.findByRole('heading', { name: 'Protected host content' })).toBeVisible();
});
it.each([host, client])('sends a restricted $role to the actual password screen before revealing protected content', async principal => {
  intercept({ ...principal, mustChangePassword: true }); mount('/greenstate/protected');
  expect(await screen.findByRole('heading', { name: 'Change your password' })).toBeVisible(); expect(screen.queryByText('Protected host content')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
});
it('denies an unrestricted account without the required permission', async () => {
  intercept(client); mount('/greenstate/protected'); expect(await screen.findByRole('alert')).toHaveTextContent(/permission/i); expect(screen.queryByText('Protected host content')).not.toBeInTheDocument();
});
it('redirects a missing protected session to sign-in with a safe return path', async () => {
  intercept(); const { router } = mount('/greenstate/protected'); await screen.findByRole('heading', { name: 'Sign in' });
  expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/greenstate/protected');
});
it('prioritizes required password change over the sign-in return path', async () => {
  intercept(null, () => json({ ...host, mustChangePassword: true })); mount('/greenstate/login?returnTo=/greenstate/protected'); await credentials('Sign in');
  expect(await screen.findByRole('heading', { name: 'Change your password' })).toBeVisible(); expect(screen.queryByText('Protected host content')).not.toBeInTheDocument();
});
it('changes a temporary client password and returns to the portal', async () => {
  const requests = intercept({ ...client, mustChangePassword: true }); mount('/greenstate/password');
  await screen.findByRole('heading', { name: 'Change your password' }); fill('Current password', password); fill('New password', 'A different account password 2026'); submit('Change password');
  expect(await screen.findByRole('heading', { name: 'Explore stays' })).toBeVisible();
  expect(requests[0]).toEqual({ url: '/api/v1/t/greenstate/auth/password', body: { currentPassword: password, newPassword: 'A different account password 2026' } });
});
it('offers sign-out from temporary password change and clears private cached data', async () => {
  intercept({ ...host, mustChangePassword: true }); const { cache } = mount('/greenstate/password'); await screen.findByRole('heading', { name: 'Change your password' });
  cache.setQueryData(['private', 'tenant', tenantId, host.id, 'saved'], ['private']); fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible(); expect(cache.getQueriesData({ queryKey: ['private'] })).toEqual([]);
});
it('resets the password screen to sign-in when its session expires during a mutation', async () => {
  intercept(client, () => problem(401, 'Please sign in.')); mount('/greenstate/password');
  await screen.findByRole('heading', { name: 'Change your password' }); fill('Current password', password); fill('New password', 'A different account password 2026'); submit('Change password');
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible(); expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
});
it('renders platform sign-in without registration and keeps platform account links in that realm', async () => {
  intercept(null, () => json(platform)); mount('/admin/login', { realm: 'platform' });
  await screen.findByRole('heading', { name: 'Sign in' }); expect(screen.queryByRole('link', { name: 'Create account' })).not.toBeInTheDocument();
  await credentials('Sign in'); expect(await screen.findByRole('heading', { name: 'Tenants' })).toBeVisible();
  fireEvent.click(screen.getByRole('link', { name: 'Account' })); await screen.findByRole('heading', { name: 'Your account' });
  expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/admin/account');
  expect(screen.getByRole('link', { name: 'Change password' })).toHaveAttribute('href', '/admin/password');
});
it('does not offer a registration form in the platform realm', async () => {
  const requests = intercept(); mount('/admin/register', { realm: 'platform' }); await screen.findByRole('heading', { name: 'Sign in' });
  expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument(); expect(requests).toHaveLength(0);
});
it('keeps an account lookup failure visible with a retry action', async () => {
  let failed = true; vi.stubGlobal('fetch', vi.fn(async () => failed ? problem(503, 'Account lookup is unavailable.') : json(client)));
  mount('/greenstate/account'); expect(await screen.findByRole('alert')).toHaveTextContent('Account lookup is unavailable.');
  failed = false; fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Your account' })).toBeVisible());
});

it('withholds sign-in until the initial session lookup settles', async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  mount(); expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(/account/i);
  await act(async () => resolve(problem(401, 'Please sign in.')));
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeEnabled();
});
it('keeps the account visible and surfaces a failed sign-out for retry', async () => {
  intercept(client, () => problem(503, 'Sign-out is temporarily unavailable.')); mount('/greenstate/account');
  await screen.findByRole('heading', { name: 'Your account' }); fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign-out is temporarily unavailable.'); expect(screen.getByText(client.email)).toBeVisible();
});

it.each([[host, '/greenstate', 'Your inventory'], [client, '/greenstate', 'Explore stays'], [platform, '/admin', 'Tenants']] as const)('lands $0.role in its workspace after login', async (principal, base, heading) => {
 intercept(null, () => json(principal)); mount(`${base}/login`, principal.realm === 'platform' ? { realm: 'platform' } : { realm: 'tenant', tenantId, slug: 'greenstate' });
 await credentials('Sign in'); expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
});
it.each([[host, '/greenstate', 'Your inventory'], [platform, '/admin', 'Tenants']] as const)('lands $0.role in its workspace after changing its password', async (principal, base, heading) => {
 intercept({ ...principal, mustChangePassword: true }, () => json(principal)); mount(`${base}/password`, principal.realm === 'platform' ? { realm: 'platform' } : { realm: 'tenant', tenantId, slug: 'greenstate' });
 await screen.findByRole('heading', { name: 'Change your password' }); fill('Current password', password); fill('New password', 'A different account password 2026'); submit('Change password');
 expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
});
it('preserves a safe return destination through required password change', async () => {
 let changed = false;
 intercept(null, url => { if (url.endsWith('/password')) changed = true; return json({ ...host, mustChangePassword: !changed }); });
 mount('/greenstate/login?returnTo=/greenstate/protected'); await credentials('Sign in');
 await screen.findByRole('heading', { name: 'Change your password' }); fill('Current password', password); fill('New password', 'A different account password 2026'); submit('Change password');
 expect(await screen.findByRole('heading', { name: 'Protected host content' })).toBeVisible();
});

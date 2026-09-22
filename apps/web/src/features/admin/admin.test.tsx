import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import type { Principal, TenantAccount } from '@greenstate/contracts';
import { AuthProvider } from '../auth/AuthProvider';
import { SignOutButton } from '../auth/AuthForm';
import { AdminLayout } from './AdminLayout';
import { TenantsPage } from './TenantsPage';
import { TenantForm } from './TenantForm';
import { AccountsPage } from './AccountsPage';
const tenant = { id: '22222222-2222-4222-8222-222222222222', slug: 'greenstate', name: 'GreenState', timezone: 'Europe/Berlin', primaryColor: '#123456', contactEmail: 'help@example.test', currency: 'EUR', createdAt: '2026-01-01T00:00:00.000Z', deletedAt: null };
const principal: Principal = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId: null, realm: 'platform', role: 'superadmin', email: 'admin@example.test', mustChangePassword: false, permissions: ['tenants:manage', 'accounts:manage'] };
const client: TenantAccount = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', tenantId: tenant.id, email: 'client@example.test', name: null, role: 'client', disabledAt: null, mustChangePassword: false, createdAt: tenant.createdAt };
const host: TenantAccount = { ...client, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'A host', email: 'host@example.test', role: 'host' };
const base = '/api/v1/admin/tenants'; const detail = `${base}/${tenant.id}`; const temp = 'A private temporary password';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function intercept(handle?: (url: URL, init: RequestInit) => Response | Promise<Response> | undefined, user = principal) {
 const requests: { url: URL; init: RequestInit; body: Record<string, unknown> | null }[] = [];
 vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
  const url = new URL(input, 'http://localhost'); requests.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : null }); const response = handle?.(url, init); if (response !== undefined) return response;
  if (url.pathname === `${detail}/summary`) return json({ ...tenant, counts: { activeListings: 2, archivedListings: 1, accounts: 4, enabledHosts: 1 } });
  if (url.pathname.endsWith('/auth/me')) return json(user);
  if (url.pathname.endsWith('/auth/logout')) return new Response(null, { status: 204 });
  if (url.pathname === base) return json({ items: [{ ...tenant, counts: { activeListings: 2, archivedListings: 1, accounts: 4, enabledHosts: 1 } }], total: 41, page: Number(url.searchParams.get('page') ?? 1), pageSize: 20 });
  if (url.pathname === detail) return json(tenant);
  if (url.pathname === `${detail}/accounts`) return json({ items: [client, host], total: 2, page: 1, pageSize: 20 });
  return new Response(null, { status: 204 });
 }); return requests;
}
function mount(path = '/admin/tenants') {
 const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
 const router = createMemoryRouter([{ path: '/admin', element: <AuthProvider scope={{ realm: 'platform' }}><SignOutButton /><Outlet /></AuthProvider>, children: [
  { element: <AdminLayout />, children: [{ path: 'tenants', element: <TenantsPage /> }, { path: 'tenants/new', element: <TenantForm mode="create" /> }, { path: 'tenants/:tenantId', element: <TenantForm mode="edit" /> }, { path: 'tenants/:tenantId/accounts', element: <AccountsPage /> }] },
  { path: 'login', element: <h1>Sign in</h1> }, { path: 'password', element: <h1>Change your password</h1> }
 ] }], { initialEntries: [path] });
 render(<QueryClientProvider client={cache}><RouterProvider router={router} /></QueryClientProvider>); return { cache, router };
}
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }
function submit(label: string) { fireEvent.submit(screen.getByRole('button', { name: label }).closest('form')!); }
it('lists tenants with URL filters, paging, account links and back navigation', async () => {
 const requests = intercept(); const { router } = mount('/admin/tenants?status=all&page=2'); await screen.findByRole('link', { name: 'GreenState' });
 expect(screen.getByLabelText('Tenant status')).toHaveValue('all'); expect(screen.getByText('Page 2 of 3')).toBeVisible(); fill('Search tenants', 'City'); submit('Apply filters');
 await waitFor(() => expect(router.state.location.search).toContain('search=City')); expect(new URLSearchParams(router.state.location.search).get('page')).toBe('1');
 expect(requests.at(-1)?.url.searchParams.get('search')).toBe('City'); await act(() => router.navigate(-1)); expect(screen.getByLabelText('Tenant status')).toHaveValue('all');
});
it('creates a tenant with only editable configuration and keeps slug immutable on edit', async () => {
 let loadTenant!: (response: Response) => void; const detailResponse = new Promise<Response>(resolve => { loadTenant = resolve; });
 const requests = intercept((url, init) => url.pathname === base && init.method === 'POST' ? json(tenant, 201) : url.pathname === detail && (!init.method || init.method === 'GET') ? detailResponse : undefined); const { router } = mount('/admin/tenants/new'); await screen.findByLabelText('Tenant name');
 fill('Tenant name', 'GreenState'); fill('Portal slug', 'greenstate'); fill('Business time zone', 'Europe/Berlin'); fill('Brand colour', '#123456'); fill('Contact email', 'help@example.test'); submit('Create tenant');
 await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/tenants/${tenant.id}`)); await screen.findByText('Loading tenant…'); await act(async () => loadTenant(json(tenant))); expect(await screen.findByLabelText('Portal slug')).toHaveAttribute('readonly');
 expect(requests.find(r => r.init.method === 'POST')?.body).toEqual({ name: 'GreenState', slug: 'greenstate', timezone: 'Europe/Berlin', primaryColor: '#123456', contactEmail: 'help@example.test' });
 fill('Tenant name', 'Renamed'); submit('Save configuration'); await waitFor(() => expect(requests.some(r => r.init.method === 'PATCH')).toBe(true)); expect(requests.find(r => r.init.method === 'PATCH')?.body).not.toHaveProperty('slug');
});
it('validates tenant configuration before a request and requires named deletion confirmation', async () => {
 const requests = intercept((url, init) => url.pathname === detail && init.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined); const { router } = mount(`/admin/tenants/${tenant.id}`); await screen.findByLabelText('Tenant name');
 fill('Business time zone', 'Mars/City'); submit('Save configuration'); expect(await screen.findByRole('alert')).toBeVisible(); expect(requests.some(r => r.init.method === 'PATCH')).toBe(false);
 await userEvent.click(screen.getByRole('button', { name: 'Delete tenant' })); const confirmation = screen.getByRole('group', { name: 'Confirm tenant deletion' }); expect(confirmation).toHaveTextContent('GreenState'); expect(confirmation).toHaveTextContent(/records are retained/i); expect(requests.some(r => r.init.method === 'DELETE')).toBe(false);
 await userEvent.click(within(confirmation).getByRole('button', { name: 'Confirm deletion' })); await waitFor(() => expect(router.state.location.pathname).toBe('/admin/tenants'));
});
it('offers an explicit promotion after an existing client conflict without resending the creation password', async () => {
 const requests = intercept((url, init) => url.pathname.endsWith('/hosts') && init.method === 'POST' ? json({ status: 409, code: 'ACCOUNT_EXISTS', message: 'This account already exists.', requestId: '' }, 409) : undefined); mount(`/admin/tenants/${tenant.id}/accounts`); await screen.findByText(client.email);
 await userEvent.click(screen.getByRole('button', { name: 'Create host' })); fill('Host name', 'A host'); fill('Email address', client.email); fill('Temporary password', temp); await userEvent.click(screen.getByLabelText(/I verified.*identity/)); submit('Create host account');
 expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/); await userEvent.click(screen.getByRole('button', { name: 'Find existing account' }));
 const row = screen.getByRole('row', { name: new RegExp(client.email) }); await userEvent.click(within(row).getByRole('button', { name: 'Promote to host' })); expect(screen.getByLabelText('Temporary password')).toHaveValue('');
 expect(requests.some(r => r.url.pathname.endsWith('/promote-host'))).toBe(false); fill('Temporary password', temp); await userEvent.click(screen.getByLabelText(/I verified.*identity/)); submit('Confirm promotion');
 await waitFor(() => expect(requests.some(r => r.url.pathname.endsWith('/promote-host'))).toBe(true)); expect(requests.find(r => r.url.pathname.endsWith('/promote-host'))?.body).toEqual({ temporaryPassword: temp }); await waitFor(() => expect(screen.queryByLabelText('Temporary password')).not.toBeInTheDocument());
});
it('requires identity confirmation for reset, explains disabled state, and clears secrets on success', async () => {
 const requests = intercept(); const { router } = mount(`/admin/tenants/${tenant.id}/accounts`); await screen.findByText(client.email); const row = screen.getByRole('row', { name: new RegExp(client.email) }); await userEvent.click(within(row).getByRole('button', { name: 'Reset password' }));
 fill('Temporary password', temp); submit('Confirm password reset'); expect(requests.some(r => r.url.pathname.endsWith('/password-reset'))).toBe(false); expect(await screen.findByRole('alert')).toHaveTextContent(/identity/);
 await userEvent.click(screen.getByLabelText(/I verified.*identity/)); submit('Confirm password reset'); await screen.findByText(/Password reset.*sessions revoked/i); expect(screen.queryByLabelText('Temporary password')).not.toBeInTheDocument(); expect(router.state.location.search).not.toContain('password'); expect(JSON.stringify(localStorage)).not.toContain(temp);
});
it('confirms disabling a host and allows re-enabling without offering client disable controls', async () => {
 const requests = intercept(); mount(`/admin/tenants/${tenant.id}/accounts`); await screen.findByText(client.email); expect(within(screen.getByRole('row', { name: new RegExp(client.email) })).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
 await userEvent.click(within(screen.getByRole('row', { name: /host@example.test/ })).getByRole('button', { name: 'Disable' })); expect(requests.some(r => r.url.pathname.endsWith('/disable'))).toBe(false); await userEvent.click(screen.getByRole('button', { name: 'Confirm disable' })); await screen.findByText(/Host disabled.*sessions revoked/i);
});
it('withholds admin data from restricted sessions', async () => { const requests = intercept(undefined, { ...principal, mustChangePassword: true }); mount(); expect(await screen.findByRole('heading', { name: 'Change your password' })).toBeVisible(); expect(requests.some(r => r.url.pathname.startsWith(base))).toBe(false); });
it('aborts a pending credential action on sign-out and ignores its late completion', async () => {
 let release!: (response: Response) => void; const pending = new Promise<Response>(resolve => { release = resolve; });
 const requests = intercept((url, init) => url.pathname.endsWith('/password-reset') && init.method === 'POST' ? pending : undefined); const { cache } = mount(`/admin/tenants/${tenant.id}/accounts`); await screen.findByText(client.email); await userEvent.click(within(screen.getByRole('row', { name: new RegExp(client.email) })).getByRole('button', { name: 'Reset password' })); fill('Temporary password', temp); await userEvent.click(screen.getByLabelText(/I verified.*identity/)); submit('Confirm password reset'); await waitFor(() => expect(requests.some(r => r.url.pathname.endsWith('/password-reset'))).toBe(true));
 await userEvent.click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByRole('heading', { name: 'Sign in' }); expect(requests.find(r => r.url.pathname.endsWith('/password-reset'))?.init.signal?.aborted).toBe(true); await act(async () => { release(new Response(null, { status: 204 })); }); expect(cache.getQueryCache().getAll().some(q => q.queryKey[0] === 'private')).toBe(false); expect(screen.queryByText(/Password reset.*sessions revoked/i)).not.toBeInTheDocument();
});

it('opens account actions in a focused dialog with tenant context', async () => {
 intercept(); mount(`/admin/tenants/${tenant.id}/accounts`); await screen.findByText(host.email);
 const trigger = within(screen.getByRole('row', { name: /host@example.test/ })).getByRole('button', { name: 'Reset password' });
 await userEvent.click(trigger);
 const dialog = screen.getByRole('dialog', { name: 'Reset password' });
 expect(within(dialog).getByText('GreenState · greenstate')).toBeVisible();
 await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
 expect(trigger).toHaveFocus();
});

it('keeps focus on the accounts heading when a successful action removes its row', async () => {
 let disabled = false;
 intercept((url, init) => {
   if (url.pathname.endsWith('/disable') && init.method === 'POST') { disabled = true; return new Response(null, { status: 204 }); }
   if (url.pathname === `${detail}/accounts`) return json({ items: disabled ? [client] : [client, host], total: disabled ? 1 : 2, page: 1, pageSize: 20 });
 });
 mount(`/admin/tenants/${tenant.id}/accounts?status=enabled`); await screen.findByText(host.email);
 await userEvent.click(within(screen.getByRole('row', { name: /host@example.test/ })).getByRole('button', { name: 'Disable' }));
 await userEvent.click(screen.getByRole('button', { name: 'Confirm disable' }));
 await waitFor(() => expect(screen.queryByRole('row', { name: /host@example.test/ })).not.toBeInTheDocument());
 expect(screen.getByRole('heading', { name: 'GreenState accounts' })).toHaveFocus();
});

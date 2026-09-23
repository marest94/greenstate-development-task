import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import type { AdminTenant, Principal, TenantAccount } from '@greenstate/contracts';
import { AuthProvider } from '../auth/AuthProvider';
import { AccountsPage } from './AccountsPage';

const tenant: AdminTenant = { id: '22222222-2222-4222-8222-222222222222', slug: 'greenstate', name: 'GreenState', timezone: 'Europe/Berlin', primaryColor: '#123456', contactEmail: 'help@example.test', currency: 'EUR', createdAt: '2026-01-01T00:00:00.000Z', deletedAt: null };
const principal: Principal = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId: null, realm: 'platform', role: 'superadmin', email: 'admin@example.test', mustChangePassword: false, permissions: ['tenants:manage', 'accounts:manage'] };
const host: TenantAccount = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', tenantId: tenant.id, email: 'host-a@example.test', name: 'Host A', role: 'host', disabledAt: null, mustChangePassword: false, createdAt: tenant.createdAt };
const client: TenantAccount = { ...host, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'client-b@example.test', name: 'Client B', role: 'client' };
const otherHost: TenantAccount = { ...host, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'host-c@example.test', name: 'Host C' };
const disabledHost: TenantAccount = { ...host, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', email: 'host-d@example.test', name: 'Host D', disabledAt: '2026-02-01T00:00:00.000Z' };
const detail = `/api/v1/admin/tenants/${tenant.id}`;
const failureMessage = 'Host A access service is unavailable.';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const unavailable = () => json({ status: 503, code: 'SERVICE_UNAVAILABLE', message: failureMessage, requestId: '' }, 503);

function mount(disable: (init: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname === '/api/v1/admin/auth/me') return json(principal);
    if (url.pathname === detail) return json(tenant);
    if (url.pathname === `${detail}/accounts`) return json({ items: [host, client, otherHost, disabledHost], total: 4, page: 1, pageSize: 20 });
    if (url.pathname === `${detail}/accounts/${host.id}/disable` && init.method === 'POST') return disable(init);
    throw new Error(`Unexpected request: ${init.method ?? 'GET'} ${url.pathname}`);
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter([{ path: '/admin/tenants/:tenantId/accounts', element: <AuthProvider scope={{ realm: 'platform' }}><AccountsPage /></AuthProvider> }], { initialEntries: [`/admin/tenants/${tenant.id}/accounts`] });
  render(<QueryClientProvider client={cache}><RouterProvider router={router} /></QueryClientProvider>);
}

function accountAction(account: TenantAccount, name: string) {
  return within(screen.getByRole('row', { name: new RegExp(account.email) })).getByRole('button', { name });
}

it.each([
  { name: 'resetting another account', account: client, button: 'Reset password', title: 'Reset password' },
  { name: 'promoting another account', account: client, button: 'Promote to host', title: 'Promote to host' },
  { name: 'disabling another host', account: otherHost, button: 'Disable', title: 'Disable host' },
  { name: 're-enabling another host', account: disabledHost, button: 'Re-enable', title: 'Re-enable host' },
  { name: 'reopening the same action', account: host, button: 'Disable', title: 'Disable host' },
  { name: 'creating a host', account: null, button: 'Create host', title: 'Create host' },
])('clears a cancelled disable failure before $name', async ({ account, button, title }) => {
  mount(unavailable);
  await screen.findByText(host.email);
  await userEvent.click(accountAction(host, 'Disable'));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm disable' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(failureMessage);
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  await userEvent.click(account ? accountAction(account, button) : screen.getByRole('button', { name: button }));
  const dialog = screen.getByRole('dialog', { name: title });
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Applying account change…')).not.toBeInTheDocument();
});

it('keeps the active disable pending until it completes and prevents cancelling it', async () => {
  let release!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { release = resolve; });
  let signal: AbortSignal | null | undefined;
  mount(init => { signal = init.signal; return response; });
  await screen.findByText(host.email);
  await userEvent.click(accountAction(host, 'Disable'));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm disable' }));

  const dialog = screen.getByRole('dialog', { name: 'Disable host' });
  expect(within(dialog).getByRole('status')).toHaveTextContent('Applying account change…');
  expect(within(dialog).getByRole('button', { name: 'Confirm disable' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(dialog).toBeVisible();
  expect(signal?.aborted).toBe(false);

  await act(async () => { release(new Response(null, { status: 204 })); });
  expect(await screen.findByText('Host disabled. All sessions revoked.')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each(['success', 'failure'] as const)('aborts a replaced action and ignores its late $0', async outcome => {
  let release!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { release = resolve; });
  let signal: AbortSignal | null | undefined;
  mount(init => { signal = init.signal; return response; });
  await screen.findByText(host.email);
  await userEvent.click(accountAction(host, 'Disable'));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm disable' }));
  await waitFor(() => expect(signal).toBeDefined());

  // Exercise selection replacement directly; native modal inertness is covered in browser tests.
  fireEvent.click(accountAction(client, 'Reset password'));
  const dialog = screen.getByRole('dialog', { name: 'Reset password' });
  expect(signal?.aborted).toBe(true);
  expect(within(dialog).queryByText('Applying account change…')).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Temporary password'), { target: { value: 'A new private password for B' } });

  await act(async () => { release(outcome === 'success' ? new Response(null, { status: 204 }) : unavailable()); });
  expect(dialog).toBeVisible();
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  expect(within(dialog).getByLabelText('Temporary password')).toHaveValue('A new private password for B');
  expect(screen.queryByText('Host disabled. All sessions revoked.')).not.toBeInTheDocument();
});

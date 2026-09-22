import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import type { Principal } from '@greenstate/contracts';
import { AuthProvider, useAuth } from './AuthProvider';
import { api } from '../../lib/api';
const tenantId = '11111111-1111-4111-8111-111111111111';
const first: Principal = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId, realm: 'tenant', role: 'host', email: 'host@example.test', mustChangePassword: false, permissions: ['saved-listings:manage', 'listings:manage', 'calendar:manage', 'bookings:read'] };
const second = { ...first, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'other@example.test' };
const unauthorized = () => new Response(JSON.stringify({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in.', requestId: 'r' }), { status: 401 });
const json = (value: unknown) => new Response(JSON.stringify(value));
function Probe() {
  const auth = useAuth();
  return <><h1>{auth.isLoading ? 'Loading account' : auth.principal?.email ?? 'Signed out'}</h1><p>{auth.error?.message}</p>
    <button onClick={() => { void auth.logout(); }}>Log out</button><button onClick={() => { void auth.login({ email: second.email, password: 'A second account password' }).catch(() => {}); }}>Other account</button>
    <button onClick={() => { void auth.changePassword({ currentPassword: 'A current account password', newPassword: 'A replacement account password' }).catch(() => {}); }}>Change password</button>
    <span data-testid="key">{JSON.stringify(auth.privateKey)}</span></>;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (realm: 'tenant' | 'platform') => <QueryClientProvider client={client}><AuthProvider scope={realm === 'tenant' ? { realm, tenantId, slug: 'greenstate' } : { realm }}><Probe /></AuthProvider></QueryClientProvider>;
  const result = render(tree('tenant')); return { client, switchRealm: () => result.rerender(tree('platform')) };
}
it('loads the current principal and scopes private keys by realm, tenant and account', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json(first)))); mount();
  expect(await screen.findByRole('heading', { name: first.email })).toBeVisible();
  expect(screen.getByTestId('key')).toHaveTextContent(JSON.stringify(['private', 'tenant', tenantId, first.id]));
});
it('treats a missing session as signed out and does not expose a private cache key', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(unauthorized()))); mount();
  expect(await screen.findByRole('heading', { name: 'Signed out' })).toBeVisible(); expect(screen.getByTestId('key')).toHaveTextContent('null');
});
it('clears old private data on logout and prevents a late response from repopulating it', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => options?.method === 'POST' ? new Response(null, { status: 204 }) : json(first)));
  const { client } = mount(); await screen.findByRole('heading', { name: first.email });
  const key = ['private', 'tenant', tenantId, first.id, 'saved']; client.setQueryData(key, ['private listing']); client.setQueryData(['listings', tenantId], ['public listing']);
  let release!: (value: string[]) => void; const late = client.fetchQuery({ queryKey: [...key, 'late'], queryFn: () => new Promise<string[]>(resolve => { release = resolve; }) }).catch(() => undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Log out' })); await screen.findByRole('heading', { name: 'Signed out' });
  await act(async () => { release(['old private result']); await late; });
  expect(client.getQueriesData({ queryKey: ['private', 'tenant', tenantId] })).toEqual([]); expect(client.getQueryData(['listings', tenantId])).toEqual(['public listing']);
});
it('clears the current account after a private request returns 401', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/me') ? json(first) : unauthorized())); const { client } = mount(); await screen.findByRole('heading', { name: first.email });
  client.setQueryData(['private', 'tenant', tenantId, first.id, 'saved'], ['secret']);
  await act(async () => { await api.get('/t/greenstate/saved-listings').catch(() => {}); });
  expect(await screen.findByRole('heading', { name: 'Signed out' })).toBeVisible(); expect(client.getQueriesData({ queryKey: ['private'] })).toEqual([]);
});
it('ignores a stale 401 from a previous principal and removes that principal’s cached data', async () => {
  let release!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/me') ? json(first) : url.endsWith('/auth/login') ? json(second) : new Promise<Response>(resolve => { release = resolve; })));
  const { client } = mount(); await screen.findByRole('heading', { name: first.email }); client.setQueryData(['private', 'tenant', tenantId, first.id], ['secret']);
  const late = api.get('/t/greenstate/saved-listings').catch(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Other account' })); await screen.findByRole('heading', { name: second.email });
  await act(async () => { release(unauthorized()); await late; });
  expect(screen.getByRole('heading', { name: second.email })).toBeVisible(); expect(client.getQueriesData({ queryKey: ['private', 'tenant', tenantId, first.id] })).toEqual([]);
});
it('clears the previous realm on navigation and loads the platform principal separately', async () => {
  const platform = { ...first, realm: 'platform', tenantId: null, role: 'superadmin', email: 'admin@example.test', permissions: ['tenants:manage', 'accounts:manage'] };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url.includes('/admin/') ? platform : first)));
  const { client, switchRealm } = mount(); await screen.findByRole('heading', { name: first.email }); client.setQueryData(['private', 'tenant', tenantId, first.id], ['secret']);
  switchRealm(); await screen.findByRole('heading', { name: platform.email });
  await waitFor(() => expect(client.getQueriesData({ queryKey: ['private', 'tenant', tenantId] })).toEqual([])); expect(screen.getByTestId('key')).toHaveTextContent('platform');
});
it('does not expose a private key for a forced-password session', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...first, mustChangePassword: true }))); mount();
  await screen.findByRole('heading', { name: first.email }); expect(screen.getByTestId('key')).toHaveTextContent('null');
});
it('rejects an account response from another tenant', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...first, tenantId: '22222222-2222-4222-8222-222222222222' }))); mount();
  await screen.findByRole('heading', { name: 'Signed out' }); expect(screen.getByText('The account response does not match this portal.')).toBeVisible(); expect(screen.getByTestId('key')).toHaveTextContent('null');
});

it('lets an explicit login supersede a delayed initial session lookup', async () => {
  let resolveMe!: (response: Response) => void; let resolveLogin!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn((url: string) => new Promise<Response>(resolve => { if (url.endsWith('/auth/me')) resolveMe = resolve; else resolveLogin = resolve; })));
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Other account' }));
  await act(async () => { resolveMe(unauthorized()); });
  await act(async () => { resolveLogin(json(second)); });
  expect(await screen.findByRole('heading', { name: second.email })).toBeVisible();
});
it('settles initial loading when a submitted login fails after cancelling session lookup', async () => {
  let resolveMe!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/auth/me') ? new Promise<Response>(resolve => { resolveMe = resolve; }) : Promise.resolve(unauthorized())));
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Other account' }));
  expect(await screen.findByRole('heading', { name: 'Signed out' })).toBeVisible();
  await act(async () => { resolveMe(unauthorized()); });
});

it('ignores a private 401 from before a password transition while accepting its replacement session', async () => {
  let resolvePrivate!: (response: Response) => void; let resolvePassword!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/auth/me') ? Promise.resolve(json(first)) : new Promise<Response>(resolve => { if (url.endsWith('/auth/password')) resolvePassword = resolve; else resolvePrivate = resolve; })));
  const { client } = mount(); await screen.findByRole('heading', { name: first.email });
  client.setQueryData(['private', 'tenant', tenantId, first.id, 'saved'], ['old private data']);
  const pendingPrivate = api.get('/t/greenstate/saved-listings').catch(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(screen.getByTestId('key')).toHaveTextContent('null');
  expect(client.getQueriesData({ queryKey: ['private'] })).toEqual([]);
  await act(async () => { resolvePrivate(unauthorized()); await pendingPrivate; });
  await act(async () => { resolvePassword(json(first)); });
  expect(await screen.findByRole('heading', { name: first.email })).toBeVisible();
  expect(client.getQueriesData({ queryKey: ['private'] })).toEqual([]);
});

it('refreshes the current account on window focus and discards another account’s private cache', async () => {
  let current = first; vi.stubGlobal('fetch', vi.fn(async () => json(current))); const { client } = mount(); await screen.findByRole('heading', { name: first.email });
  client.setQueryData(['private', 'tenant', tenantId, first.id, 'saved'], ['First account only']); current = second;
  fireEvent(window, new Event('focus')); expect(await screen.findByRole('heading', { name: second.email })).toBeVisible(); expect(client.getQueriesData({ queryKey: ['private', 'tenant', tenantId, first.id] })).toEqual([]);
});
it('clears revoked sessions on returning to a visible tab', async () => {
  let revoked = false; vi.stubGlobal('fetch', vi.fn(async () => revoked ? unauthorized() : json(first))); const { client } = mount(); await screen.findByRole('heading', { name: first.email }); client.setQueryData(['private', 'tenant', tenantId, first.id, 'saved'], ['private']); revoked = true;
  fireEvent(document, new Event('visibilitychange')); expect(await screen.findByRole('heading', { name: 'Signed out' })).toBeVisible(); expect(screen.getByTestId('key')).toHaveTextContent('null'); expect(client.getQueriesData({ queryKey: ['private'] })).toEqual([]);
});
it('refreshes a forced-password session on focus and withdraws private access', async () => {
  let forced = false; vi.stubGlobal('fetch', vi.fn(async () => json({ ...first, mustChangePassword: forced }))); const { client } = mount(); await screen.findByRole('heading', { name: first.email }); client.setQueryData(['private', 'tenant', tenantId, first.id, 'saved'], ['private']); forced = true;
  fireEvent(window, new Event('focus')); await waitFor(() => expect(screen.getByTestId('key')).toHaveTextContent('null')); expect(client.getQueriesData({ queryKey: ['private'] })).toEqual([]);
});
it.each(['Other account', 'Change password', 'Log out'])('does not start a focus lookup while %s is pending', async action => {
  let release!: (response: Response) => void; const fetcher = vi.fn((url: string) => url.endsWith('/me') ? Promise.resolve(json(first)) : new Promise<Response>(resolve => { release = resolve; })); vi.stubGlobal('fetch', fetcher); mount(); await screen.findByRole('heading', { name: first.email });
  fireEvent.click(screen.getByRole('button', { name: action })); fireEvent(window, new Event('focus')); fireEvent(document, new Event('visibilitychange'));
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/me'))).toHaveLength(1);
  await act(async () => { release(action === 'Log out' ? new Response(null, { status: 204 }) : json(action === 'Other account' ? second : first)); });
  expect(await screen.findByRole('heading', { name: action === 'Log out' ? 'Signed out' : action === 'Other account' ? second.email : first.email })).toBeVisible();
});
it('ignores a delayed focus response superseded by an explicit account change', async () => {
  let resolveFocus!: (response: Response) => void; let lookups = 0; let focusSignal: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => url.endsWith('/login') ? Promise.resolve(json(second)) : ++lookups === 1 ? Promise.resolve(json(first)) : new Promise<Response>(resolve => { resolveFocus = resolve; focusSignal = init.signal; })));
  mount(); await screen.findByRole('heading', { name: first.email }); fireEvent(window, new Event('focus')); await waitFor(() => expect(lookups).toBe(2)); fireEvent.click(screen.getByRole('button', { name: 'Other account' })); await screen.findByRole('heading', { name: second.email }); expect(focusSignal?.aborted).toBe(true);
  await act(async () => { resolveFocus(unauthorized()); }); expect(screen.getByRole('heading', { name: second.email })).toBeVisible();
});
it('withholds private data when a focus lookup fails and can recover on a later focus', async () => {
  let failing = false; vi.stubGlobal('fetch', vi.fn(async () => { if (failing) throw new Error('network unavailable'); return json(first); })); const { client } = mount(); await screen.findByRole('heading', { name: first.email }); client.setQueryData(['private', 'tenant', tenantId, first.id, 'saved'], ['private']); failing = true;
  fireEvent(window, new Event('focus')); await waitFor(() => expect(screen.getByTestId('key')).toHaveTextContent('null')); expect(client.getQueriesData({ queryKey: ['private'] })).toEqual([]);
  failing = false; fireEvent(window, new Event('focus')); await waitFor(() => expect(screen.getByTestId('key')).toHaveTextContent(first.id));
});
it('does not request account data for a hidden tab', async () => {
  const fetcher = vi.fn(async () => json(first)); vi.stubGlobal('fetch', fetcher); mount(); await screen.findByRole('heading', { name: first.email }); const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); try { fireEvent(document, new Event('visibilitychange')); fireEvent(window, new Event('focus')); expect(fetcher).toHaveBeenCalledTimes(1); } finally { visibility.mockRestore(); }
});
it('preserves existing private views when focus confirms the same account', async () => {
  const fetcher = vi.fn(async () => json(first)); vi.stubGlobal('fetch', fetcher); const { client } = mount(); await screen.findByRole('heading', { name: first.email }); const key = ['private', 'tenant', tenantId, first.id, 'editor']; client.setQueryData(key, { title: 'The loaded listing' });
  await act(async () => { fireEvent(window, new Event('focus')); }); expect(fetcher).toHaveBeenCalledTimes(2); expect(client.getQueryData(key)).toEqual({ title: 'The loaded listing' });
});
it('still handles an in-flight private 401 after focus confirms an unchanged principal', async () => {
  let release!: (response: Response) => void; vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/me') ? Promise.resolve(json(first)) : new Promise<Response>(resolve => { release = resolve; })));
  mount(); await screen.findByRole('heading', { name: first.email }); const pending = api.get('/t/greenstate/me/saved-listings').catch(() => {}); await act(async () => { fireEvent(window, new Event('focus')); }); await act(async () => { release(unauthorized()); await pending; }); expect(await screen.findByRole('heading', { name: 'Signed out' })).toBeVisible();
});

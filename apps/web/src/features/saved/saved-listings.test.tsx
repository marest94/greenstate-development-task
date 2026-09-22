import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TenantProvider } from '../../app/TenantProvider';
import { TenantAccountProvider } from '../../app/AccountBoundary';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequirePermission';
import { SavedListingsPage } from './SavedListingsPage';
import { SaveButton, SavedListingsState } from './SaveButton';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const tenant = { id: '11111111-1111-4111-8111-111111111111', slug: 'greenstate', name: 'GreenState', timezone: 'Europe/Berlin', primaryColor: null, contactEmail: null, currency: 'EUR' };
const principal = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId: tenant.id, realm: 'tenant', role: 'client', email: 'first@example.test', mustChangePassword: false, permissions: ['saved-listings:manage'] };
const second = { ...principal, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'second@example.test' };
const listing = { id: '22222222-2222-4222-8222-222222222222', title: 'Quiet courtyard home', city: 'Berlin', country: 'DE', latitude: 52, longitude: 13, propertyType: 'apartment', maxGuests: 4, bedrooms: 2, pricePerNightCents: 12345, currency: 'EUR', rating: null, reviewCount: 0, createdAt: '2026-01-01' };
const otherListing = { ...listing, id: '33333333-3333-4333-8333-333333333333', title: 'Another home' };
const saved = (value: typeof listing | null = listing) => ({ listingId: listing.id, savedAt: '2026-09-22T12:00:00.000Z', listing: value });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const failure = (status: number) => json({ status, code: 'UNAVAILABLE', message: 'Please try again.', requestId: 'test' }, status);
const page = (items: ReturnType<typeof saved>[] = []) => ({ items, total: items.length, page: 1, pageSize: 20 });
const clients: QueryClient[] = [];
function SwitchAccount() { const auth = useAuth(); return <><span>{auth.principal?.email}</span><button onClick={() => { void auth.login({ email: second.email, password: 'A long second password' }); }}>Switch account</button></>; }
function Cards() { return <SavedListingsState listingIds={[listing.id, otherListing.id]}><SaveButton listingId={listing.id} title={listing.title} /><SaveButton listingId={otherListing.id} title={otherListing.title} /></SavedListingsState>; }
function mount(path = '/greenstate/saved') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const router = createMemoryRouter([{ path: '/:slug', element: <TenantProvider><TenantAccountProvider><SwitchAccount /><SavedOutlet /></TenantAccountProvider></TenantProvider>, children: [
    { path: 'saved', element: <RequirePermission permission="saved-listings:manage"><SavedListingsPage /></RequirePermission> }, { index: true, element: <Cards /> }, { path: 'login', element: <h1>Sign in</h1> },
  ] }], { initialEntries: [path] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); return { client, router };
}
function SavedOutlet() { return <Outlet />; }
function intercept(override?: (url: URL, init: RequestInit) => Response | Promise<Response> | undefined, anonymous = false) {
  const requests: { url: URL; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost'); requests.push({ url, init });
    const response = override?.(url, init); if (response !== undefined) return response;
    if (url.pathname.endsWith('/auth/me')) return anonymous ? failure(401) : json(principal);
    if (url.pathname.endsWith('/auth/login')) return json(second);
    if (url.pathname === '/api/v1/t/greenstate') return json(tenant);
    if (url.pathname.endsWith('/me/saved-listings')) return json(page());
    return new Response(null, { status: 204 });
  });
  return requests;
}
afterEach(() => { clients.splice(0).forEach(client => client.clear()); });
it('loads saved states once for a whole set of cards and uses private queries with cancellation', async () => {
  const requests = intercept(); mount('/greenstate');
  expect(await screen.findByRole('button', { name: `Save ${listing.title}` })).toBeEnabled();
  expect(screen.getByRole('button', { name: `Save ${otherListing.title}` })).toBeEnabled();
  const reads = requests.filter(r => r.url.pathname.endsWith('/me/saved-listings'));
  expect(reads).toHaveLength(1); expect(reads[0]!.url.searchParams.get('listingIds')?.split(',').sort()).toEqual([listing.id, otherListing.id]);
  expect(reads[0]!.init.signal).toBeInstanceOf(AbortSignal);
});
it('saves and removes via idempotent endpoints, then refreshes account state', async () => {
  let active = false;
  const requests = intercept((url, init) => {
    if (url.pathname.endsWith(`/saved-listings/${listing.id}`)) { active = init.method === 'PUT'; return new Response(null, { status: 204 }); }
    if (url.pathname.endsWith('/me/saved-listings')) return json(page(active ? [saved()] : []));
  }); mount('/greenstate');
  await userEvent.setup().click(await screen.findByRole('button', { name: `Save ${listing.title}` }));
  await userEvent.setup().click(await screen.findByRole('button', { name: `Remove ${listing.title} from saved listings` }));
  expect(await screen.findByRole('button', { name: `Save ${listing.title}` })).toBeEnabled();
  const writes = requests.filter(r => r.init.method === 'PUT' || r.init.method === 'DELETE');
  expect(writes.map(r => r.init.method)).toEqual(['PUT', 'DELETE']); expect(writes[0]!.init.headers).toMatchObject({ 'X-Requested-By': 'greenstate-web' });
});
it('sends anonymous visitors to sign in with a portal-local return URL and makes no private request', async () => {
  const requests = intercept(undefined, true); const { router } = mount('/greenstate?city=Berlin');
  await userEvent.setup().click(await screen.findByRole('link', { name: `Save ${listing.title}` }));
  expect(router.state.location.pathname).toBe('/greenstate/login'); expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/greenstate?city=Berlin');
  expect(requests.some(r => r.url.pathname.includes('/me/saved-listings'))).toBe(false);
});
it('renders unavailable entries without details or links and still lets the owner remove them', async () => {
  let removed = false;
  intercept((url, init) => { if (init.method === 'DELETE') { removed = true; return new Response(null, { status: 204 }); } if (url.pathname.endsWith('/me/saved-listings')) return json(page(removed ? [] : [saved(null)])); }); mount();
  expect(await screen.findByText('This listing is unavailable')).toBeVisible(); expect(screen.queryByRole('link', { name: listing.title })).toBeNull(); expect(screen.queryByText('Berlin')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Remove unavailable listing from saved listings' }));
  expect(await screen.findByRole('heading', { name: 'Your shortlist starts here' })).toBeVisible();
});
it('displays loading, handles list failures, and offers a working retry', async () => {
  const pending = deferred<Response>(); let failed = false;
  intercept(url => url.pathname.endsWith('/me/saved-listings') ? failed ? json(page([saved()])) : pending.promise : undefined); mount();
  expect(await screen.findByText('Loading saved listings…')).toBeVisible();
  await act(async () => { pending.resolve(failure(503)); }); expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.');
  failed = true; await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('link', { name: listing.title })).toHaveAttribute('href', `/greenstate/listings/${listing.id}`);
});
it('does not guess saved state on a read failure and preserves the save action after a failed write', async () => {
  let loadFailed = true;
  intercept((url, init) => url.pathname.includes('/me/saved-listings') ? init.method === 'PUT' ? failure(503) : loadFailed ? failure(503) : json(page()) : undefined); mount('/greenstate');
  expect(await screen.findAllByRole('button', { name: 'Retry saved status' })).toHaveLength(2);
  expect(screen.queryByRole('button', { name: `Save ${listing.title}` })).toBeNull();
  loadFailed = false; await userEvent.setup().click(screen.getAllByRole('button', { name: 'Retry saved status' })[0]!);
  await userEvent.setup().click(await screen.findByRole('button', { name: `Save ${listing.title}` }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.'); expect(screen.getByRole('button', { name: `Save ${listing.title}` })).toBeEnabled();
});
it('uses URL pagination and retains it on reload', async () => {
  const requests = intercept(url => url.pathname.endsWith('/me/saved-listings') ? json({ ...page([saved()]), page: Number(url.searchParams.get('page')), total: 41 }) : undefined); const { router } = mount('/greenstate/saved?page=2');
  expect(await screen.findByText('Page 2 of 3')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Next page' }));
  expect(await screen.findByText('Page 3 of 3')).toBeVisible(); expect(router.state.location.search).toContain('page=3');
  expect(requests.filter(r => r.url.pathname.endsWith('/me/saved-listings')).map(r => r.url.searchParams.get('page'))).toEqual(['2', '3']);
});
it('rejects a delayed private response after changing to a second account in the same tenant', async () => {
  const pending = deferred<Response>(); let switched = false; let firstSignal: AbortSignal | undefined;
  intercept((url, init) => {
    if (url.pathname.endsWith('/auth/login')) { switched = true; return json(second); }
    if (url.pathname.endsWith('/me/saved-listings')) { if (!switched) { firstSignal = init.signal ?? undefined; return pending.promise; } return json(page()); }
  }); const { client } = mount(); await screen.findByText('Loading saved listings…');
  fireEvent.click(screen.getByRole('button', { name: 'Switch account' }));
  expect(await screen.findByText(second.email)).toBeVisible(); expect(await screen.findByRole('heading', { name: 'Your shortlist starts here' })).toBeVisible();
  await act(async () => { pending.resolve(json(page([saved()]))); });
  expect(firstSignal?.aborted).toBe(true); expect(screen.queryByRole('link', { name: listing.title })).toBeNull();
  await waitFor(() => expect(client.getQueriesData({ queryKey: ['private', 'tenant', tenant.id, principal.id] })).toEqual([]));
});

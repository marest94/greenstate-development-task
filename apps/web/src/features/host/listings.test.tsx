import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import type { HostListingView, Principal } from '@greenstate/contracts';
import { TenantProvider } from '../../app/TenantProvider';
import { TenantAccountProvider } from '../../app/AccountBoundary';
import { RequirePermission } from '../auth/RequirePermission';
import { SignOutButton } from '../auth/AuthForm';
import { HostLayout } from './HostLayout';
import { ListingsPage } from './ListingsPage';
import { ListingForm } from './ListingForm';
const tenant = { id: '22222222-2222-4222-8222-222222222222', slug: 'greenstate', name: 'GreenState', timezone: 'Europe/Berlin', primaryColor: null, contactEmail: null, currency: 'EUR' };
const host: Principal = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId: tenant.id, realm: 'tenant', role: 'host', email: 'host@example.test', mustChangePassword: false, permissions: ['saved-listings:manage', 'listings:manage', 'calendar:manage', 'bookings:read'] };
const listing: HostListingView = { id: '11111111-1111-4111-8111-111111111111', title: 'A quiet courtyard apartment', description: 'A restful place.', city: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.4, propertyType: 'apartment', maxGuests: 4, bedrooms: 2, pricePerNightCents: 12345, currency: 'EUR', rating: null, reviewCount: 0, createdAt: '2026-01-01', version: 1, archivedAt: null };
const base = '/api/v1/t/greenstate/host/listings';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (status: number, code: string, message: string) => json({ status, code, message, requestId: 'test' }, status);
function intercept(options: { principal?: Principal; listing?: HostListingView; handle?: (url: URL, init: RequestInit) => Response | Promise<Response> | undefined } = {}) {
  const requests: { url: URL; init: RequestInit; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost'); requests.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : null });
    const handled = options.handle?.(url, init); if (handled !== undefined) return handled;
    if (url.pathname === '/api/v1/t/greenstate') return json(tenant);
    if (url.pathname.endsWith('/auth/me')) return json(options.principal ?? host);
    if (url.pathname.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    if (url.pathname === base) return json({ items: [options.listing ?? listing], total: 41, page: Number(url.searchParams.get('page') ?? 1), pageSize: 20 });
    if (url.pathname === `${base}/${listing.id}`) return json(options.listing ?? listing);
    return failure(404, 'RESOURCE_NOT_FOUND', 'This listing could not be found.');
  });
  return requests;
}
function mount(path = '/greenstate/host/listings') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter([{ path: '/:slug', element: <TenantProvider><TenantAccountProvider><Outlet /></TenantAccountProvider></TenantProvider>, children: [
    { path: 'host', element: <><SignOutButton /><HostLayout /></>, children: [
      { path: 'listings', element: <ListingsPage /> }, { path: 'listings/new', element: <ListingForm mode="create" /> }, { path: 'listings/:id', element: <ListingForm mode="edit" /> },
    ] }, { path: 'login', element: <h1>Sign in</h1> }, { path: 'password', element: <h1>Change your password</h1> },
    { path: 'guarded', element: <RequirePermission permission="listings:manage"><ListingForm mode="create" /></RequirePermission> },
  ] }], { initialEntries: [path] });
  render(<QueryClientProvider client={cache}><RouterProvider router={router} /></QueryClientProvider>);
  return { router, cache };
}
function fill(label: string, value: string) { fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } }); }
function submit(label = 'Save changes') { fireEvent.submit(screen.getByRole('button', { name: label }).closest('form')!); }
it('shows tenant inventory with host links and preserves filter/page state in the URL', async () => {
  const requests = intercept(); const { router } = mount('/greenstate/host/listings?status=archived&page=2');
  const link = await screen.findByRole('link', { name: listing.title }); expect(link).toHaveAttribute('href', `/greenstate/host/listings/${listing.id}`);
  expect(screen.getByLabelText('Listing status')).toHaveValue('archived'); expect(screen.getByText('Page 2 of 3')).toBeVisible();
  expect(screen.getByText('€123.45')).toBeVisible();
  await userEvent.setup().selectOptions(screen.getByLabelText('Listing status'), 'all');
  await waitFor(() => expect(router.state.location.search).toContain('status=all'));
  expect(new URLSearchParams(router.state.location.search).get('page')).toBe('1');
  expect(requests.filter(r => r.url.pathname === base).at(-1)?.url.searchParams.get('status')).toBe('all');
  await act(() => router.navigate(-1)); expect(screen.getByLabelText('Listing status')).toHaveValue('archived');
});
it.each([
  ['client', { ...host, role: 'client' as const, permissions: ['saved-listings:manage'] as Principal['permissions'] }, 'Access unavailable'],
  ['restricted host', { ...host, mustChangePassword: true }, 'Change your password'],
])('withholds actual host inventory from a %s', async (_name, principal, heading) => {
  const requests = intercept({ principal }); mount();
  expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Create listing' })).not.toBeInTheDocument();
  expect(requests.some(r => r.url.pathname.startsWith(base))).toBe(false);
});
it('allows an unrestricted host to reach Create listing', async () => {
  intercept(); mount(); await screen.findByRole('link', { name: 'Create listing' });
  await userEvent.setup().click(screen.getByRole('link', { name: 'Create listing' }));
  expect(await screen.findByRole('heading', { name: 'Create listing' })).toBeVisible();
});
it('preserves edits after a version conflict and reloads only on explicit request', async () => {
  let current = listing;
  intercept({ handle: (url, init) => {
    if (url.pathname !== `${base}/${listing.id}`) return;
    if (init.method === 'PATCH') { current = { ...listing, title: 'Another host’s update', version: 2 }; return failure(409, 'STALE_VERSION', 'This listing has changed. Reload its current version.'); }
    return json(current);
  } });
  mount(`/greenstate/host/listings/${listing.id}`); await screen.findByDisplayValue(listing.title);
  fill('Title', 'My draft title'); submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(/changed/); expect(screen.getByLabelText('Title')).toHaveValue('My draft title');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Reload current version' }));
  await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Another host’s update'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('retains a rejected capacity edit and explains the existing stay requirement', async () => {
  intercept({ handle: (_url, init) => init.method === 'PATCH' ? failure(409, 'CAPACITY_CONFLICT', 'An active or future booking needs capacity for 4 guests.') : undefined });
  mount(`/greenstate/host/listings/${listing.id}`); await screen.findByDisplayValue(listing.title); fill('Maximum guests', '2'); submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(/4 guests/); expect(screen.getByLabelText('Maximum guests')).toHaveValue(2);
});
it('requires explicit archive confirmation and explains that active and future bookings are preserved', async () => {
  const requests = intercept({ handle: url => url.pathname.endsWith('/archive') ? json({ ...listing, version: 2, archivedAt: '2026-10-02T10:00:00.000Z' }) : undefined });
  mount(`/greenstate/host/listings/${listing.id}`); await screen.findByDisplayValue(listing.title);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Archive listing' }));
  expect(screen.getByText(/active and future bookings remain unchanged/i)).toBeVisible();
  expect(requests.some(r => r.url.pathname.endsWith('/archive'))).toBe(false);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Keep active' })); expect(requests.some(r => r.url.pathname.endsWith('/archive'))).toBe(false);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Archive listing' }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm archive' }));
  expect(await screen.findByRole('button', { name: 'Restore listing' })).toBeVisible();
  expect(requests.find(r => r.url.pathname.endsWith('/archive'))?.body).toEqual({ version: 1 });
  expect(screen.queryByRole('link', { name: 'View public listing' })).not.toBeInTheDocument();
});
it('loads an archived listing for editing and restores it to the public portal', async () => {
  const requests = intercept({ listing: { ...listing, archivedAt: '2026-10-02T10:00:00.000Z', version: 2 }, handle: url => url.pathname.endsWith('/restore') ? json({ ...listing, version: 3 }) : undefined });
  mount(`/greenstate/host/listings/${listing.id}`); await screen.findByDisplayValue(listing.title);
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Restore listing' }));
  expect(await screen.findByRole('link', { name: 'View public listing' })).toHaveAttribute('href', `/greenstate/listings/${listing.id}`);
  expect(requests.find(r => r.url.pathname.endsWith('/restore'))?.body).toEqual({ version: 2 });
});
it('creates a listing with exact integer cents and only editable fields', async () => {
  const requests = intercept({ handle: (url, init) => url.pathname === base && init.method === 'POST' ? json(listing, 201) : undefined });
  const { router } = mount('/greenstate/host/listings/new'); await screen.findByRole('button', { name: 'Create listing' });
  fill('Title', listing.title); fill('Description', 'A restful place.'); fill('City', 'Berlin'); fill('Country code', 'DE'); fill('Latitude', '52.52'); fill('Longitude', '13.4'); fill('Maximum guests', '4'); fill('Bedrooms', '2'); fill('Price per night (€)', '123.45');
  submit('Create listing'); await waitFor(() => expect(router.state.location.pathname).toBe('/greenstate/host/listings'));
  expect(await screen.findByText('Listing created.')).toBeVisible();
  expect(requests.find(r => r.init.method === 'POST')?.body).toEqual({ title: listing.title, description: 'A restful place.', city: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.4, propertyType: 'apartment', maxGuests: 4, bedrooms: 2, pricePerNightCents: 12345 });
});
it('rejects fractional cents and missing numeric inputs without making a write', async () => {
  const requests = intercept(); mount(`/greenstate/host/listings/${listing.id}`); await screen.findByDisplayValue(listing.title);
  fill('Price per night (€)', '12.345'); submit(); expect(await screen.findByRole('alert')).toHaveTextContent(/two decimal places/);
  fill('Price per night (€)', '12.34'); fill('Latitude', ''); submit();
  expect(screen.getByLabelText('Latitude')).toHaveAttribute('aria-invalid', 'true');
  expect(requests.some(r => r.init.method === 'PATCH')).toBe(false);
});
it('shows an empty archived inventory and recovers an inventory error through retry', async () => {
  let failed = true; intercept({ handle: url => url.pathname === base ? failed ? failure(503, 'UNAVAILABLE', 'Inventory is temporarily unavailable.') : json({ items: [], total: 0, page: 1, pageSize: 20 }) : undefined });
  mount('/greenstate/host/listings?status=archived'); expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/);
  failed = false; await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No archived listings')).toBeVisible();
});
it('aborts an in-flight private inventory query when its account signs out', async () => {
  let finish!: (response: Response) => void; let signal: AbortSignal | undefined;
  intercept({ handle: (url, init) => url.pathname === base ? (signal = init.signal as AbortSignal, new Promise<Response>(done => { finish = done; })) : undefined });
  const { cache } = mount(); await screen.findByText('Loading inventory…');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByRole('heading', { name: 'Sign in' });
  expect(signal?.aborted).toBe(true); await act(async () => finish(json({ items: [listing], total: 1, page: 1, pageSize: 20 })));
  expect(cache.getQueriesData({ queryKey: ['private'] })).toEqual([]); expect(screen.queryByText(listing.title)).not.toBeInTheDocument();
});

it('keeps the requested page size when advancing inventory pages', async () => {
  const requests = intercept({ handle: url => url.pathname === base ? json({ items: [listing], total: 41, page: Number(url.searchParams.get('page') ?? 1), pageSize: Number(url.searchParams.get('pageSize') ?? 20) }) : undefined });
  const { router } = mount('/greenstate/host/listings?status=all&pageSize=10');
  await screen.findByText('Page 1 of 5'); await userEvent.setup().click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('page')).toBe('2'));
  expect(new URLSearchParams(router.state.location.search).get('pageSize')).toBe('10');
  expect(requests.filter(r => r.url.pathname === base).at(-1)?.url.searchParams.get('pageSize')).toBe('10');
});

it('protects a dirty listing draft when navigating to inventory', async () => {
  intercept(); mount(`/greenstate/host/listings/${listing.id}`);
  await screen.findByLabelText('Title'); fill('Title', 'My unsaved draft');
  await userEvent.setup().click(screen.getByRole('link', { name: 'Back to inventory' }));
  expect(screen.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Title')).toHaveValue('My unsaved draft');
});
it('applies inventory discovery filters and preserves page size', async () => {
  intercept(); const { router } = mount('/greenstate/host/listings?page=2&pageSize=10');
  await screen.findByRole('link', { name: listing.title });
  fill('Property name', 'courtyard'); fill('City', 'Berlin');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(new URLSearchParams(router.state.location.search).get('search')).toBe('courtyard');
  expect(new URLSearchParams(router.state.location.search).get('page')).toBe('1');
  expect(new URLSearchParams(router.state.location.search).get('pageSize')).toBe('10');
});
it('does not warn after reverting a draft to its saved values', async () => {
 intercept(); const { router } = mount(`/greenstate/host/listings/${listing.id}`); await screen.findByLabelText('Title');
 fill('Title', 'Changed'); fill('Title', listing.title);
 await userEvent.click(screen.getByRole('link', { name: 'Back to inventory' }));
 await waitFor(() => expect(router.state.location.pathname).toBe('/greenstate/host/listings'));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('requires saving or discarding edits before restoring an archived listing', async () => {
 const requests = intercept({ listing: { ...listing, archivedAt: '2026-10-01T00:00:00.000Z' } });
 mount(`/greenstate/host/listings/${listing.id}`); await screen.findByLabelText('Title');
 fill('Title', 'An unsaved title');
 expect(screen.getByRole('button', { name: 'Restore listing' })).toBeDisabled();
 await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
 expect(screen.getByLabelText('Title')).toHaveValue(listing.title);
 expect(screen.getByRole('button', { name: 'Restore listing' })).toBeEnabled();
 expect(requests.some(r => r.init.method === 'POST' || r.init.method === 'PATCH')).toBe(false);
});

it.each(['listing', 'tenant'] as const)('keeps a dirty listing mounted through a temporary %s refresh failure and retry', async resource => {
  let unavailable = false;
  const endpoint = resource === 'listing' ? `${base}/${listing.id}` : '/api/v1/t/greenstate';
  intercept({ handle: url => url.pathname === endpoint && unavailable ? failure(503, 'UNAVAILABLE', 'Temporarily unavailable.') : undefined });
  const { cache } = mount(`/greenstate/host/listings/${listing.id}`);
  await screen.findByLabelText('Title');
  fill('Title', 'My draft survives refresh');
  const titleInput = screen.getByLabelText('Title');
  unavailable = true;
  await act(() => cache.invalidateQueries({ predicate: query => resource === 'listing' ? query.queryKey.includes('host-listing') : query.queryKey[0] === 'tenant' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Title')).toBe(titleInput);
  expect(titleInput).toHaveValue('My draft survives refresh');
  unavailable = false;
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Title')).toBe(titleInput);
  expect(titleInput).toHaveValue('My draft survives refresh');
});

it('preserves the draft when focus refresh fails for a stale listing and the account is unchanged', async () => {
  let unavailable = false;
  intercept({ handle: url => url.pathname === `${base}/${listing.id}` && unavailable ? failure(503, 'UNAVAILABLE', 'Temporarily unavailable.') : undefined });
  const { cache } = mount(`/greenstate/host/listings/${listing.id}`);
  await screen.findByLabelText('Title'); fill('Title', 'Draft after returning to this tab');
  unavailable = true;
  await act(() => cache.invalidateQueries({ predicate: query => query.queryKey.includes('host-listing'), refetchType: 'none' }));
  try {
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); fireEvent.focus(window); });
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Title')).toHaveValue('Draft after returning to this tab');
  } finally { focusManager.setFocused(undefined); }
});

it.each([403, 404])('withholds cached listing edits after a definitive HTTP %s refresh response', async status => {
  let unavailable = false;
  intercept({ handle: url => url.pathname === `${base}/${listing.id}` && unavailable ? failure(status, 'RESOURCE_UNAVAILABLE', 'This listing is no longer available.') : undefined });
  const { cache } = mount(`/greenstate/host/listings/${listing.id}`);
  await screen.findByLabelText('Title'); fill('Title', 'A private draft'); unavailable = true;
  await act(() => cache.invalidateQueries({ predicate: query => query.queryKey.includes('host-listing') }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This listing is no longer available.');
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
});

it('withholds the editor when the tenant disappears during refresh', async () => {
  let deleted = false;
  intercept({ handle: url => url.pathname === '/api/v1/t/greenstate' && deleted ? failure(404, 'TENANT_NOT_FOUND', 'This portal is no longer available.') : undefined });
  const { cache } = mount(`/greenstate/host/listings/${listing.id}`);
  await screen.findByLabelText('Title'); fill('Title', 'A private draft'); deleted = true;
  await act(() => cache.invalidateQueries({ queryKey: ['tenant', 'greenstate'] }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This portal is no longer available.');
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
});

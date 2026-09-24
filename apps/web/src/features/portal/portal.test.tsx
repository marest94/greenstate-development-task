import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListingDto } from '@greenstate/contracts';
import { TenantProvider } from '../../app/TenantProvider';
import { TenantAccountProvider } from '../../app/AccountBoundary';
import { PortalLayout } from '../../app/PortalLayout';
import { SearchPage } from './SearchPage';
import { ListingPage } from './ListingPage';
import { parseSearchParams, toSearchParams } from './Filters';

const listing: ListingDto = {
  id: '11111111-1111-4111-8111-111111111111', title: 'A quiet courtyard apartment', city: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.405,
  propertyType: 'apartment', maxGuests: 4, bedrooms: 2, pricePerNightCents: 12345, currency: 'EUR', rating: null, reviewCount: 0, createdAt: '2026-01-01',
};
const tenant = { id: '22222222-2222-4222-8222-222222222222', slug: 'greenstate', name: 'GreenState', timezone: 'Europe/Berlin', primaryColor: '#173d32', contactEmail: 'hello@example.test', currency: 'EUR' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const failure = (status: number, message: string) => json({ status, code: status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE', message, requestId: 'test-request' }, status);
const results = (url: URL, items = [listing]) => ({ items, total: 41, page: Number(url.searchParams.get('page') ?? 1), pageSize: Number(url.searchParams.get('pageSize') ?? 20), today: '2026-09-22' });
const clients: QueryClient[] = [];
function mount(path = '/greenstate') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  clients.push(client);
  const router = createMemoryRouter([{ path: '/:slug', element: <TenantProvider><TenantAccountProvider><PortalLayout /></TenantAccountProvider></TenantProvider>, children: [
    { index: true, element: <SearchPage /> }, { path: 'listings/:id', element: <ListingPage /> },
  ] }], { initialEntries: [path] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
function intercept(override?: (url: URL) => Response | Promise<Response> | undefined) {
  const requests: URL[] = [];
  vi.stubGlobal('fetch', async (input: string) => {
    const url = new URL(input, 'http://localhost');
    requests.push(url);
    const response = override?.(url);
    if (response !== undefined) return response;
    if (url.pathname === '/api/v1/t/greenstate/auth/me') return failure(401, 'Please sign in.');
    if (url.pathname === '/api/v1/t/greenstate') return json(tenant);
    if (url.pathname === '/api/v1/t/greenstate/listings/facets') return json({ cities: ['Berlin', 'Paris'] });
    if (url.pathname === '/api/v1/t/greenstate/listings') return json(results(url));
    if (url.pathname === `/api/v1/t/greenstate/listings/${listing.id}`) return json({ ...listing, description: null, version: 1 });
    if (url.pathname.endsWith('/availability')) return json({ today: '2026-09-22', days: [{ date: url.searchParams.get('from'), available: true }] });
    return failure(404, 'This rental portal was not found.');
  });
  return { requests, searches: () => requests.filter(url => url.pathname === '/api/v1/t/greenstate/listings'), calendars: () => requests.filter(url => url.pathname.endsWith('/availability')) };
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
async function submit() { await userEvent.setup().click(screen.getByRole('button', { name: 'Search stays' })); }
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-22T10:00:00Z')); });
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); });

it('round-trips strict URL filters using API defaults and exact integer cents', () => {
  expect(parseSearchParams(new URLSearchParams())).toEqual({ page: 1, pageSize: 20 });
  const filters = parseSearchParams(new URLSearchParams('city=Berlin&guests=4&minPriceCents=1&maxPriceCents=12345&from=2026-10-01&to=2026-10-04&page=2'));
  expect(filters).toEqual({ page: 2, pageSize: 20, city: 'Berlin', guests: 4, minPriceCents: 1, maxPriceCents: 12345, from: '2026-10-01', to: '2026-10-04' });
  expect(Object.fromEntries(toSearchParams(filters))).toMatchObject({ page: '2', city: 'Berlin', minPriceCents: '1', from: '2026-10-01', to: '2026-10-04' });
  expect(() => parseSearchParams(new URLSearchParams('from=2026-10-01'))).toThrow();
  expect(() => parseSearchParams(new URLSearchParams('guests=13'))).toThrow();
});

describe('URL-driven search', () => {
  it('removes the complete date range via a chip and preserves unrelated filters', async () => {
    const http = intercept(); const router = mount('/greenstate?city=Berlin&guests=4&from=2026-10-01&to=2026-10-04&page=2');
    await screen.findByRole('link', { name: listing.title });
    await userEvent.setup().click(screen.getByRole('button', { name: /^Remove dates filter:/ }));
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('city')).toBe('Berlin'); expect(params.get('guests')).toBe('4');
    expect(params.get('page')).toBe('1'); expect(params.has('from')).toBe(false); expect(params.has('to')).toBe(false);
    await waitFor(() => expect(http.searches()).toHaveLength(2));
    expect(http.searches().every(url => url.searchParams.has('from') === url.searchParams.has('to'))).toBe(true);
  });
  it('keeps map mode in the URL across filtering and detail navigation without sending it to the API', async () => {
    const http = intercept(); const router = mount('/greenstate?city=Berlin&view=map');
    await screen.findByRole('link', { name: listing.title });
    expect(screen.getByRole('button', { name: 'Hide map' })).toHaveAttribute('aria-pressed', 'true');
    expect(http.searches()[0]!.searchParams.has('view')).toBe(false);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove city filter: Berlin' }));
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe('map');
    await userEvent.setup().click(await screen.findByRole('link', { name: listing.title }));
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Back to listings' }));
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe('map');
  });
  it('switches map mode without losing an unsubmitted search draft or refetching listings', async () => {
    const http = intercept(); mount(); await screen.findByRole('link', { name: listing.title });
    change('Guests', '6');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show map' }));
    expect(screen.getByLabelText('Guests')).toHaveValue(6);
    expect(http.searches()).toHaveLength(1);
  });
  it('shows original facts, EUR prices, and an unrated listing without invented amenities', async () => {
    intercept(); mount();
    const link = await screen.findByRole('link', { name: listing.title });
    expect(link).toHaveAttribute('href', `/greenstate/listings/${listing.id}`);
    const card = link.closest('article')!;
    expect(within(card).getByText('€123.45')).toBeVisible();
    expect(within(card).getByText('Unrated')).toBeVisible();
    expect(within(card).getByText(/4 guests/)).toBeVisible();
    expect(within(card).getByText(/2 bedrooms/)).toBeVisible();
    expect(screen.getByText(/Business date: 22 September 2026/)).toHaveTextContent('Europe/Berlin');
  });
  it('submits city, capacity and decimal prices to the URL and API in cents', async () => {
    const http = intercept(); const router = mount('/greenstate?page=2');
    await screen.findByRole('link', { name: listing.title });
    change('City', 'Paris'); change('Guests', '3'); change('Minimum price (€)', '12.34'); change('Maximum price (€)', '200.01');
    await submit();
    await waitFor(() => expect(http.searches().at(-1)!.searchParams.get('city')).toBe('Paris'));
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toMatchObject({ city: 'Paris', guests: '3', minPriceCents: '1234', maxPriceCents: '20001', page: '1' });
    expect(Object.fromEntries(http.searches().at(-1)!.searchParams)).toMatchObject({ city: 'Paris', guests: '3', minPriceCents: '1234', maxPriceCents: '20001', page: '1' });
  });
  it('rejects fractional cents before sending a search request', async () => {
    const http = intercept(); mount(); await screen.findByRole('link', { name: listing.title });
    change('Minimum price (€)', '12.345'); await submit();
    expect(screen.getByRole('alert')).toHaveTextContent(/two decimal places/);
    expect(http.searches()).toHaveLength(1);
  });
  it.each(['Check-in', 'Checkout'])('clears both effective dates and page 2 when %s is cleared, then waits for a complete new pair', async label => {
    const http = intercept(); const router = mount('/greenstate?page=2&from=2026-10-01&to=2026-10-04');
    await screen.findByRole('link', { name: listing.title });
    change(label, '');
    await waitFor(() => expect(http.searches()).toHaveLength(2));
    const cleared = new URLSearchParams(router.state.location.search);
    expect(cleared.get('page')).toBe('1'); expect(cleared.has('from')).toBe(false); expect(cleared.has('to')).toBe(false);
    expect(http.searches().at(-1)!.searchParams.has('from')).toBe(false); expect(http.searches().at(-1)!.searchParams.has('to')).toBe(false);
    change('Check-in', '2026-11-01'); await submit();
    expect(http.searches()).toHaveLength(2);
    expect(new URLSearchParams(router.state.location.search).has('from')).toBe(false);
    change('Checkout', '2026-11-04'); await submit();
    await waitFor(() => expect(http.searches()).toHaveLength(3));
    expect(Object.fromEntries(http.searches()[2]!.searchParams)).toMatchObject({ from: '2026-11-01', to: '2026-11-04', page: '1' });
    expect(http.searches().every(url => url.searchParams.has('from') === url.searchParams.has('to'))).toBe(true);
  });
  it('restores effective filters, dates and pagination on back and forward navigation', async () => {
    intercept(); const router = mount('/greenstate?city=Berlin&from=2026-10-01&to=2026-10-04&page=2');
    await screen.findByRole('link', { name: listing.title });
    change('City', 'Paris'); change('Check-in', '2026-11-01'); change('Checkout', '2026-11-04'); await submit();
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeVisible());
    await act(() => router.navigate(-1));
    expect(screen.getByLabelText('City')).toHaveValue('Berlin'); expect(screen.getByLabelText('Check-in')).toHaveValue('2026-10-01'); expect(screen.getByLabelText('Checkout')).toHaveValue('2026-10-04'); expect(screen.getByText('Page 2 of 3')).toBeVisible();
    await act(() => router.navigate(1));
    expect(screen.getByLabelText('City')).toHaveValue('Paris'); expect(screen.getByLabelText('Check-in')).toHaveValue('2026-11-01'); expect(screen.getByLabelText('Checkout')).toHaveValue('2026-11-04');
  });
  it('keeps an incomplete initial range in draft and enforces valid date ordering and maximum stay', async () => {
    const http = intercept(); mount(); await screen.findByRole('link', { name: listing.title });
    change('Check-in', '2026-10-01'); await submit(); expect(http.searches()).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/both/);
    change('Checkout', '2026-10-01'); await submit(); expect(screen.getByRole('alert')).toHaveTextContent(/checkout after check-in/i);
    change('Checkout', '2028-10-02'); await submit(); expect(screen.getByRole('alert')).toHaveTextContent(/366/);
    expect(http.searches()).toHaveLength(1);
  });
  it('rejects invalid URL queries visibly without making an invalid listing request', async () => {
    const http = intercept(); mount('/greenstate?from=2026-02-30');
    expect(await screen.findByRole('alert')).toHaveTextContent(/filters/i);
    expect(http.searches()).toHaveLength(0);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(await screen.findByRole('link', { name: listing.title })).toBeVisible();
  });
});

describe('public screen states', () => {
  it('shows loading until the search response arrives, then an empty state with a reset action', async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    intercept(url => url.pathname === '/api/v1/t/greenstate/listings' ? pending : undefined); mount();
    expect(await screen.findByText('Finding your next stay…')).toBeVisible();
    await act(async () => resolve(json({ items: [], total: 0, page: 1, pageSize: 20, today: '2026-09-22' })));
    expect(await screen.findByRole('heading', { name: 'No stays match your search' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeVisible();
  });
  it('recovers from a network error through the visible retry action', async () => {
    let failed = true;
    intercept(url => { if (failed && url.pathname === '/api/v1/t/greenstate/listings') throw new TypeError('network down'); });
    mount(); expect(await screen.findByRole('alert')).toHaveTextContent(/could not be reached/);
    failed = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: listing.title })).toBeVisible();
  });
  it('never loads listings for an unknown tenant', async () => {
    const http = intercept(); mount('/missing');
    expect(await screen.findByRole('alert')).toHaveTextContent('This rental portal was not found.');
    expect(http.requests.some(url => url.pathname.includes('/listings'))).toBe(false);
  });
  it.each(['archived', 'foreign'])('shows unavailable for %s listing details without loading a calendar', async () => {
    const http = intercept(url => url.pathname === `/api/v1/t/greenstate/listings/${listing.id}` ? failure(404, 'Listing not found.') : undefined);
    mount(`/greenstate/listings/${listing.id}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Listing not found.');
    expect(screen.getByRole('link', { name: 'Back to listings' })).toHaveAttribute('href', '/greenstate');
    expect(http.calendars()).toHaveLength(0);
  });
});

describe('listing detail availability', () => {
  it('opens the illustration gallery, navigates images with the keyboard, and restores focus on close', async () => {
    intercept(); mount(`/greenstate/listings/${listing.id}`);
    const open = await screen.findByRole('button', { name: 'View all illustrations' });
    await userEvent.setup().click(open);
    const dialog = screen.getByRole('dialog', { name: 'Stay inspiration' });
    const first = within(dialog).getByRole('img').getAttribute('src');
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByRole('img').getAttribute('src')).not.toBe(first);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });
  it('keeps a usable location link with the exact supplied coordinates independently of map tiles', async () => {
    intercept(); mount(`/greenstate/listings/${listing.id}`);
    const link = await screen.findByRole('link', { name: 'Open in OpenStreetMap' });
    const url = new URL(link.getAttribute('href')!);
    expect(url.hostname).toBe('www.openstreetmap.org');
    expect(url.searchParams.get('mlat')).toBe('52.52');
    expect(url.searchParams.get('mlon')).toBe('13.405');
    expect(screen.getByRole('region', { name: 'Property location' })).toBeVisible();
  });
  it('returns from details to the same search filters and page', async () => {
    intercept(); const router = mount('/greenstate?city=Berlin&guests=4&page=2');
    await userEvent.setup().click(await screen.findByRole('link', { name: listing.title }));
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Back to listings' }));
    expect(router.state.location.search).toBe('?city=Berlin&guests=4&page=2');
    expect(screen.getByLabelText('City')).toHaveValue('Berlin');
  });
  it('preserves the listing date without raw coordinates in secondary details', async () => {
    intercept(); mount(`/greenstate/listings/${listing.id}`);
    await screen.findByRole('heading', { name: listing.title });
    expect(screen.getByText('Listed on')).toBeVisible();
    expect(screen.getByText('1 January 2026')).toBeVisible();
    expect(screen.queryByText('Coordinates')).not.toBeInTheDocument();
    expect(screen.queryByText('52.52, 13.405')).not.toBeInTheDocument();
  });
  it('fetches both displayed months explicitly, leaves unfetched dates loading, and allows historical browsing by keyboard', async () => {
    let resolveOctober!: (response: Response) => void;
    const october = new Promise<Response>(done => { resolveOctober = done; });
    const http = intercept(url => url.pathname.endsWith('/availability') && url.searchParams.get('from') === '2026-10-01' ? october : undefined);
    mount(`/greenstate/listings/${listing.id}`);
    expect(await screen.findByRole('heading', { name: listing.title })).toBeVisible();
    await waitFor(() => expect(http.calendars()).toHaveLength(2));
    expect(http.calendars().map(url => Object.fromEntries(url.searchParams))).toEqual([{ from: '2026-09-01', to: '2026-10-01' }, { from: '2026-10-01', to: '2026-11-01' }]);
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeVisible(); expect(screen.getByRole('heading', { name: 'October 2026' })).toBeVisible();
    expect(screen.getByLabelText('1 October 2026, loading')).toBeVisible();
    expect(screen.queryByLabelText('1 October 2026, available')).not.toBeInTheDocument();
    await act(async () => resolveOctober(json({ today: '2026-09-22', days: [{ date: '2026-10-01', available: false }] })));
    expect(await screen.findByLabelText('1 October 2026, unavailable')).toBeVisible();
    screen.getByRole('button', { name: 'Previous months' }).focus(); await userEvent.setup().keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'July 2026' })).toBeVisible();
    await waitFor(() => expect(http.calendars()).toHaveLength(4));
    expect(http.calendars().slice(2).map(url => Object.fromEntries(url.searchParams))).toEqual([{ from: '2026-07-01', to: '2026-08-01' }, { from: '2026-08-01', to: '2026-09-01' }]);
    expect(screen.getByText(/Business date: 22 September 2026/)).toHaveTextContent('Europe/Berlin');
  });
  it('corrects its initial month from authoritative today without correcting later deliberate navigation', async () => {
    const http = intercept(url => url.pathname.endsWith('/availability') ? json({ today: '2026-11-03', days: [] }) : undefined);
    mount(`/greenstate/listings/${listing.id}`);
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'December 2026' })).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Previous months' }));
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeVisible();
    expect(http.calendars().some(url => url.searchParams.get('from') === '2026-12-01')).toBe(true);
  });
  it('shows calendar failure and retries without inventing availability', async () => {
    let failed = true;
    intercept(url => url.pathname.endsWith('/availability') && failed ? failure(503, 'Availability is temporarily unavailable.') : undefined);
    mount(`/greenstate/listings/${listing.id}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Availability is temporarily unavailable.');
    expect(screen.getByLabelText('1 October 2026, loading')).toBeVisible();
    failed = false; await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('1 October 2026, available')).toBeVisible();
  });
});

it('preserves keyboard focus through search and clearing dates, including resetting an unsent draft', async () => {
 const http = intercept(); const router = mount(); await screen.findByRole('link', { name: listing.title });
 change('Maximum price (€)', '200.00'); const search = screen.getByRole('button', { name: 'Search stays' }); search.focus(); await userEvent.setup().keyboard('{Enter}');
 await waitFor(() => expect(http.searches().at(-1)!.searchParams.get('maxPriceCents')).toBe('20000'));
 expect(search).toHaveFocus(); expect(search).toBeInTheDocument();
 change('City', 'Paris'); await userEvent.setup().click(screen.getByRole('button', { name: 'Clear all' })); expect(screen.getByLabelText('City')).toHaveValue('');
 change('City', 'Paris'); await userEvent.setup().click(screen.getByRole('button', { name: 'Clear all' })); expect(screen.getByLabelText('City')).toHaveValue('');
 change('Check-in', '2026-10-01'); change('Checkout', '2026-10-04'); await submit();
 const date = screen.getByLabelText('Check-in'); date.focus(); change('Check-in', ''); await waitFor(() => expect(new URLSearchParams(router.state.location.search).has('from')).toBe(false)); expect(date).toHaveFocus();
});
it.each(['#ffffff', '#f5f4ee'])('keeps a readable wordmark when the tenant chooses %s', async primaryColor => {
 intercept(url => url.pathname === '/api/v1/t/greenstate' ? json({ ...tenant, primaryColor }) : undefined); mount();
 const wordmark = await screen.findByRole('link', { name: tenant.name }); expect(wordmark.closest('.portal-shell')).toHaveStyle({ '--tenant-color': primaryColor, '--tenant-wordmark-color': '#173d32' });
});
it('preserves a readable custom tenant colour', async () => {
 intercept(url => url.pathname === '/api/v1/t/greenstate' ? json({ ...tenant, primaryColor: '#123456' }) : undefined); mount();
 const wordmark = await screen.findByRole('link', { name: tenant.name }); expect(wordmark.closest('.portal-shell')).toHaveStyle({ '--tenant-color': '#123456' });
});

it.each(['not-a-uuid', `..%2F..%2Fcitystays%2Flistings%2F${listing.id}`])('rejects malformed listing id %s before requesting any listing', async id => {
 const http = intercept(url => url.pathname === `/api/v1/t/citystays/listings/${listing.id}` ? json({ ...listing, title: 'Another tenant stay', description: null, version: 1 }) : undefined);
 mount(`/greenstate/listings/${id}`); await screen.findByRole('alert');
 expect(screen.queryByRole('heading', { name: 'Another tenant stay' })).not.toBeInTheDocument();
 expect(http.requests.filter(url => url.pathname.includes('/listings'))).toHaveLength(0);
 expect(screen.getByRole('link', { name: 'Back to listings' })).toHaveAttribute('href', '/greenstate');
});

it('keeps red branding and uses readable button text', async () => {
 intercept(url => url.pathname === '/api/v1/t/greenstate' ? json({ ...tenant, primaryColor: '#FF0000' }) : undefined); mount();
 const wordmark = await screen.findByRole('link', { name: tenant.name });
 expect(wordmark.closest('.portal-shell')).toHaveStyle({ '--tenant-color': '#FF0000', '--tenant-on-color': '#000000' });
});
it('sets the browser title for search and removes raw coordinates from property details', async () => {
 intercept(); const router = mount(); await screen.findByRole('link', { name: listing.title });
 await waitFor(() => expect(document.title).toBe(`Explore stays · ${tenant.name}`));
 await act(() => router.navigate(`/greenstate/listings/${listing.id}`));
 await screen.findByRole('heading', { name: listing.title });
 expect(screen.queryByText('Coordinates', { exact: true })).not.toBeInTheDocument();
 expect(document.title).toBe(`Property details · ${tenant.name}`);
});

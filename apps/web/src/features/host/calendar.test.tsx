import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import type { HostCalendar, HostListingView, PortfolioCalendarPage as PortfolioPage, Principal } from '@greenstate/contracts';
import { TenantProvider } from '../../app/TenantProvider';
import { TenantAccountProvider } from '../../app/AccountBoundary';
import { SignOutButton } from '../auth/AuthForm';
import { HostLayout } from './HostLayout';
import { PortfolioCalendarPage } from './PortfolioCalendarPage';
import { CalendarPage } from './CalendarPage';
import { BookingsPage } from './BookingsPage';
const tenant = { id: '22222222-2222-4222-8222-222222222222', slug: 'greenstate', name: 'GreenState', timezone: 'Europe/Berlin', primaryColor: null, contactEmail: null, currency: 'EUR' };
const host: Principal = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tenantId: tenant.id, realm: 'tenant', role: 'host', email: 'host@example.test', mustChangePassword: false, permissions: ['saved-listings:manage', 'listings:manage', 'calendar:manage', 'bookings:read'] };
const listing: HostListingView = { id: '11111111-1111-4111-8111-111111111111', title: 'A quiet courtyard apartment', description: 'A restful place.', city: 'Berlin', country: 'DE', latitude: 52.52, longitude: 13.4, propertyType: 'apartment', maxGuests: 4, bedrooms: 2, pricePerNightCents: 12345, currency: 'EUR', rating: null, reviewCount: 0, createdAt: '2026-01-01', version: 1, archivedAt: null };
const first = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', listingId: listing.id, checkIn: '2026-10-01', checkOut: '2026-10-02', guests: 4, status: 'confirmed' as const };
const second = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', listingId: listing.id, checkIn: '2026-10-01', checkOut: '2026-10-03', guests: 2, status: 'completed' as const };
const blocked = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', reason: 'Maintenance' };
const initial: HostCalendar = { today: '2026-10-02', bookings: [first, second], days: [
  { date: '2026-10-01', status: 'booked', bookingIds: [first.id, second.id], block: null },
  { date: '2026-10-02', status: 'booked', bookingIds: [second.id], block: null },
  { date: '2026-10-03', status: 'blocked', bookingIds: [], block: blocked },
  { date: '2026-10-04', status: 'available', bookingIds: [], block: null },
] };
const base = `/api/v1/t/greenstate/host/listings/${listing.id}`;
const bookingBase = '/api/v1/t/greenstate/host/bookings';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (status: number, code: string, message: string) => json({ status, code, message, requestId: 'test' }, status);
function intercept(options: { principal?: Principal; listing?: HostListingView; calendar?: HostCalendar; handle?: (url: URL, init: RequestInit) => Response | Promise<Response> | undefined } = {}) {
  const requests: { url: URL; init: RequestInit; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost'); requests.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : null });
    const handled = options.handle?.(url, init); if (handled !== undefined) return handled;
    if (url.pathname === '/api/v1/t/greenstate') return json(tenant);
    if (url.pathname.endsWith('/auth/me')) return json(options.principal ?? host);
    if (url.pathname.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    if (url.pathname === base) return json(options.listing ?? listing);
    if (url.pathname === `${base}/calendar`) return json(options.calendar ?? initial);
    if (url.pathname === bookingBase) return json({ items: [{ ...first, listingTitle: listing.title }, { ...second, listingTitle: listing.title }], total: 41, page: Number(url.searchParams.get('page') ?? 1), pageSize: Number(url.searchParams.get('pageSize') ?? 20), today: '2026-10-02' });
    return failure(404, 'RESOURCE_NOT_FOUND', 'This resource could not be found.');
  });
  return requests;
}
function mount(path = `/greenstate/host/listings/${listing.id}/calendar?month=2026-10`) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter([{ path: '/:slug', element: <TenantProvider><TenantAccountProvider><Outlet /></TenantAccountProvider></TenantProvider>, children: [
    { path: 'host', element: <><SignOutButton /><HostLayout /></>, children: [
      { path: 'calendar', element: <PortfolioCalendarPage /> }, { path: 'listings/:id/calendar', element: <CalendarPage /> }, { path: 'bookings', element: <BookingsPage /> }, { path: 'listings/:id', element: <h1>Edit listing</h1> },
    ] }, { path: 'login', element: <h1>Sign in</h1> }, { path: 'password', element: <h1>Change your password</h1> },
  ] }], { initialEntries: [path] });
  render(<QueryClientProvider client={cache}><RouterProvider router={router} /></QueryClientProvider>);
  return { router, cache };
}
it('lets hosts inspect historical occupied nights and every overlapping booking', async () => {
  intercept(); mount(); const day = await screen.findByRole('button', { name: '1 October 2026, booked, past' }); expect(day).toBeEnabled();
  await userEvent.setup().click(day);
  const panel = screen.getByRole('region', { name: '1 October 2026' });
  expect(within(panel).getByText('4 guests')).toBeVisible(); expect(within(panel).getByText('2 guests')).toBeVisible();
  expect(within(panel).getByText('Confirmed')).toBeVisible(); expect(within(panel).getByText('Past')).toBeVisible();
  expect(within(panel).getByText('Completed')).toBeVisible(); expect(within(panel).getByText('Current')).toBeVisible();
  expect(within(panel).queryByRole('button', { name: 'Block day' })).not.toBeInTheDocument();
  expect(screen.getByText(/Tenant business date: 2 October 2026/)).toHaveTextContent('Europe/Berlin');
});
it('posts a selected free day and optional reason, then reloads calendar and public availability', async () => {
  let calendar = initial;
  const requests = intercept({ handle: (url, init) => {
    if (url.pathname === `${base}/calendar`) return json(calendar);
    if (url.pathname === `${base}/blocks` && init.method === 'POST') { calendar = { ...initial, days: initial.days.map(day => day.date === '2026-10-04' ? { ...day, status: 'blocked', block: blocked } : day) }; return json({ id: blocked.id, listingId: listing.id, date: '2026-10-04', reason: blocked.reason }, 201); }
  } });
  const { cache } = mount(); cache.setQueryData(['availability', tenant.slug, listing.id], { fixture: true }); cache.setQueryData(['listings', tenant.slug, {}], { fixture: true });
  await userEvent.setup().click(await screen.findByRole('button', { name: '4 October 2026, available' }));
  fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: ' Maintenance ' } });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Block day' }));
  expect(await screen.findByRole('button', { name: '4 October 2026, blocked' })).toBeEnabled();
  expect(requests.find(r => r.init.method === 'POST')?.body).toEqual({ date: '2026-10-04', reason: 'Maintenance' });
  expect(cache.getQueryState(['availability', tenant.slug, listing.id])?.isInvalidated).toBe(true);
  expect(cache.getQueryState(['listings', tenant.slug, {}])?.isInvalidated).toBe(true);
});
it('shows a rejected write without predicting a successful block and retains the reason', async () => {
  intercept({ handle: (_url, init) => init.method === 'POST' ? failure(409, 'DATE_OCCUPIED', 'An existing booking occupies this night.') : undefined }); mount();
  await userEvent.setup().click(await screen.findByRole('button', { name: '4 October 2026, available' }));
  fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'A retained draft' } });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Block day' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/existing booking/); expect(screen.getByLabelText('Reason (optional)')).toHaveValue('A retained draft');
  expect(screen.getByRole('button', { name: '4 October 2026, available' })).toBeVisible(); expect(screen.queryByText('Day blocked.')).not.toBeInTheDocument();
});
it('allows an archived past block to be removed while preventing new blocks', async () => {
  let calendar: HostCalendar = { ...initial, days: [{ date: '2026-10-01', status: 'blocked', bookingIds: [], block: blocked }, initial.days[3]!] };
  const requests = intercept({ listing: { ...listing, archivedAt: '2026-10-02T10:00:00Z' }, handle: (url, init) => {
    if (url.pathname === `${base}/calendar`) return json(calendar);
    if (init.method === 'DELETE') { calendar = { ...calendar, days: calendar.days.map(day => ({ ...day, status: 'available', block: null })) }; return new Response(null, { status: 204 }); }
  } }); mount();
  await userEvent.setup().click(await screen.findByRole('button', { name: '4 October 2026, available' })); expect(screen.queryByRole('button', { name: 'Block day' })).not.toBeInTheDocument(); expect(screen.getByText(/Restore this listing before adding/)).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: '1 October 2026, blocked, past' })); expect(screen.getByText('Maintenance')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Remove block' }));
  expect(await screen.findByRole('button', { name: '1 October 2026, available, past' })).toBeEnabled();
  expect(requests.find(r => r.init.method === 'DELETE')?.url.pathname).toBe(`${base}/blocks/${blocked.id}`);
});
it('preserves booked information and offers removal if a legacy block also occupies the night', async () => {
  intercept({ calendar: { ...initial, days: [{ ...initial.days[0]!, block: blocked }] } }); mount();
  await userEvent.setup().click(await screen.findByRole('button', { name: '1 October 2026, booked, past' }));
  expect(screen.getByText('4 guests')).toBeVisible(); expect(screen.getByRole('button', { name: 'Remove block' })).toBeEnabled();
});
it('supports historical month navigation and requests the selected month range', async () => {
  const requests = intercept(); const { router } = mount(); await screen.findByRole('table', { name: 'October 2026' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Previous month' }));
  await waitFor(() => expect(router.state.location.search).toContain('month=2026-09'));
  expect(requests.filter(r => r.url.pathname.endsWith('/calendar')).at(-1)?.url.searchParams.get('from')).toBe('2026-09-01');
  expect(requests.filter(r => r.url.pathname.endsWith('/calendar')).at(-1)?.url.searchParams.get('to')).toBe('2026-10-01');
  fireEvent.change(screen.getByLabelText('Calendar month'), { target: { value: '2025-03' } });
  await waitFor(() => expect(router.state.location.search).toContain('month=2025-03'));
});
it.each(['calendar', 'bookings'])('cancels a pending %s query when its account signs out', async type => {
  let signal: AbortSignal | undefined; let finish!: (response: Response) => void;
  intercept({ handle: (url, init) => url.pathname === (type === 'calendar' ? `${base}/calendar` : bookingBase) ? (signal = init.signal as AbortSignal, new Promise<Response>(done => { finish = done; })) : undefined });
  const { cache } = mount(type === 'calendar' ? undefined : '/greenstate/host/bookings');
  await waitFor(() => expect(signal).toBeDefined()); await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByRole('heading', { name: 'Sign in' });
  expect(signal?.aborted).toBe(true); await act(async () => finish(json(type === 'calendar' ? initial : { items: [], total: 0, page: 1, pageSize: 20, today: initial.today })));
  expect(cache.getQueriesData({ queryKey: ['private'] })).toEqual([]);
});
it('aborts a pending block mutation and prevents its late response restoring private state after sign-out', async () => {
  let signal: AbortSignal | undefined; let finish!: (response: Response) => void;
  intercept({ handle: (_url, init) => init.method === 'POST' && !String(_url).includes('/logout') ? (signal = init.signal as AbortSignal, new Promise<Response>(done => { finish = done; })) : undefined });
  const { cache } = mount(); await userEvent.setup().click(await screen.findByRole('button', { name: '4 October 2026, available' })); await userEvent.setup().click(screen.getByRole('button', { name: 'Block day' }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' })); await screen.findByRole('heading', { name: 'Sign in' }); expect(signal?.aborted).toBe(true);
  await act(async () => finish(json({ id: blocked.id, listingId: listing.id, date: '2026-10-04', reason: null }, 201)));
  expect(cache.getQueriesData({ queryKey: ['private'] })).toEqual([]); expect(screen.queryByText('Day blocked.')).not.toBeInTheDocument();
});
it('shows imported status separately from date-derived stay period and links archived inventory through host routes', async () => {
  intercept(); mount('/greenstate/host/bookings');
  const table = await screen.findByRole('table', { name: 'Booking history' }); const rows = within(table).getAllByRole('row');
  expect(within(rows[1]!).getByText('Confirmed')).toBeVisible(); expect(within(rows[1]!).getByText('Past')).toBeVisible();
  expect(within(rows[2]!).getByText('Completed')).toBeVisible(); expect(within(rows[2]!).getByText('Current')).toBeVisible();
  expect(within(rows[1]!).getByRole('link', { name: listing.title })).toHaveAttribute('href', `/greenstate/host/listings/${listing.id}`);
  expect(screen.getByText(/Tenant business date: 2 October 2026/)).toHaveTextContent('Europe/Berlin');
  expect(within(table).queryByRole('button')).not.toBeInTheDocument();
});
it('keeps booking filters and page size in the URL and resets page when applying filters', async () => {
  const requests = intercept(); const { router } = mount(`/greenstate/host/bookings?listingId=${listing.id}&pageSize=10&page=2`); await screen.findByRole('table', { name: 'Booking history' });
  await userEvent.setup().selectOptions(screen.getByLabelText('Imported status'), 'cancelled');
  fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-01' } }); fireEvent.change(screen.getByLabelText('To date (exclusive)'), { target: { value: '2026-10-01' } });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('status')).toBe('cancelled'));
  expect(new URLSearchParams(router.state.location.search).get('listingId')).toBe(listing.id); expect(new URLSearchParams(router.state.location.search).get('page')).toBe('1');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('page')).toBe('2'));
  expect(requests.filter(r => r.url.pathname === bookingBase).at(-1)?.url.searchParams.get('pageSize')).toBe('10');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Show all listings' })); await waitFor(() => expect(new URLSearchParams(router.state.location.search).has('listingId')).toBe(false));
});
it('shows cancelled and future stays and explains an empty filtered booking page', async () => {
  intercept({ handle: url => url.pathname === bookingBase ? json({ items: [{ ...first, checkIn: '2026-10-10', checkOut: '2026-10-12', status: 'cancelled', listingTitle: listing.title }], total: 1, page: 1, pageSize: 20, today: initial.today }) : undefined }); mount('/greenstate/host/bookings');
  const table = await screen.findByRole('table', { name: 'Booking history' }); expect(within(table).getByText('Cancelled')).toBeVisible(); expect(within(table).getByText('Future')).toBeVisible();
});
it('recovers a booking query error and shows its empty state', async () => {
  let fails = true; intercept({ handle: url => url.pathname === bookingBase ? fails ? failure(503, 'UNAVAILABLE', 'Booking history is temporarily unavailable.') : json({ items: [], total: 0, page: 1, pageSize: 20, today: initial.today }) : undefined }); mount('/greenstate/host/bookings');
  expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/); fails = false; await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText('No bookings on this page')).toBeVisible();
});
it('rejects invalid booking filter URLs without fetching private booking data', async () => {
  const requests = intercept(); mount('/greenstate/host/bookings?from=2026-10-01'); expect(await screen.findByRole('alert')).toHaveTextContent(/Check booking filters/); expect(requests.some(r => r.url.pathname === bookingBase)).toBe(false);
});
it.each([['client', { ...host, role: 'client' as const, permissions: ['saved-listings:manage'] as Principal['permissions'] }, 'Access unavailable'], ['restricted host', { ...host, mustChangePassword: true }, 'Change your password']])('withholds host calendar and bookings from a %s', async (_label, principal, heading) => {
  const requests = intercept({ principal }); mount(); expect(await screen.findByRole('heading', { name: heading })).toBeVisible(); expect(requests.some(r => r.url.pathname.includes('/host/'))).toBe(false);
});

it('selects a portfolio range and sends an exclusive end date while retaining the view', async () => {
  const requests = intercept({ handle: (url, init) => {
    if (url.pathname === '/api/v1/t/greenstate/host/calendar') return json({ today: initial.today, from: '2026-10-01', to: '2026-10-15', page: 1, pageSize: 20, total: 1, items: [{ listing, bookings: [], days: ['2026-10-04','2026-10-05','2026-10-06'].map(date => ({ date, status: 'available', bookingIds: [], block: null })) }] });
    if (init.method === 'POST') return json({ changed: 3 }, 201);
  } });
  const { router } = mount('/greenstate/host/calendar?from=2026-10-01'); const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: `${listing.title}, 4 October 2026, available` }));
  await user.click(screen.getByRole('button', { name: `${listing.title}, 6 October 2026, available` }));
  expect(screen.getByText('3 nights will be blocked')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Block 3 nights' }));
  await screen.findByText('3 nights blocked.');
  expect(requests.find(r => r.url.pathname.endsWith('/block-range'))?.body).toEqual({ from: '2026-10-04', to: '2026-10-07', action: 'block' });
  expect(router.state.location.search).toContain('from=2026-10-01');
});

const portfolio: PortfolioPage = {
  today: '2026-10-02', from: '2026-10-01', to: '2026-10-15', page: 1, pageSize: 20, total: 1,
  items: [{ listing, bookings: [], days: ['2026-10-04', '2026-10-05', '2026-10-06'].map(date => ({ date, status: 'available', bookingIds: [], block: null })) }],
};
it('refreshes occupied portfolio nights after a conflict while keeping the selected dates and reason for retry', async () => {
  let calendar = portfolio;
  let conflict = true;
  const booking = { ...first, checkIn: '2026-10-05', checkOut: '2026-10-06' };
  const requests = intercept({ handle: (url, init) => {
    if (url.pathname === '/api/v1/t/greenstate/host/calendar') return json(calendar);
    if (url.pathname === `${base}/block-range` && init.method === 'POST') {
      if (conflict) {
        conflict = false;
        calendar = { ...portfolio, items: [{ listing, bookings: [booking], days: portfolio.items[0]!.days.map(day => day.date === '2026-10-05' ? { ...day, status: 'booked', bookingIds: [booking.id] } : day) }] };
        return failure(409, 'DATE_OCCUPIED', 'An existing booking occupies this night.');
      }
      calendar = { ...calendar, items: [{ ...calendar.items[0]!, days: calendar.items[0]!.days.map(day => day.date === '2026-10-06' ? { ...day, status: 'blocked', block: { ...blocked, reason: 'Prepare for guests' } } : day) }] };
      return json({ changed: 1 }, 201);
    }
  } });
  const { router } = mount('/greenstate/host/calendar?from=2026-10-01&days=14');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: `${listing.title}, 4 October 2026, available` }));
  await user.click(screen.getByRole('button', { name: `${listing.title}, 6 October 2026, available` }));
  await user.type(screen.getByLabelText('Reason (optional)'), 'Prepare for guests');
  await user.click(screen.getByRole('button', { name: 'Block 3 nights' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('An existing booking occupies this night.');
  expect(await screen.findByRole('button', { name: `${listing.title}, 5 October 2026, booked` })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('First night')).toHaveValue('2026-10-04');
  expect(screen.getByLabelText('Last night (included)')).toHaveValue('2026-10-06');
  expect(screen.getByText('2 available · 1 booked · 0 manually blocked')).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Block \d/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('First night'), { target: { value: '2026-10-06' } });
  expect(screen.getByLabelText('Reason (optional)')).toHaveValue('Prepare for guests');
  await user.click(screen.getByRole('button', { name: 'Block 1 night' }));
  expect(await screen.findByText('1 night blocked.')).toBeVisible();
  expect(await screen.findByRole('button', { name: `${listing.title}, 6 October 2026, blocked` })).toHaveAttribute('aria-pressed', 'true');
  expect(requests.filter(request => request.url.pathname.endsWith('/block-range')).map(request => request.body)).toEqual([
    { from: '2026-10-04', to: '2026-10-07', action: 'block', reason: 'Prepare for guests' },
    { from: '2026-10-06', to: '2026-10-07', action: 'block', reason: 'Prepare for guests' },
  ]);
  expect(router.state.location.search).toBe('?from=2026-10-01&days=14');
});

it.each(['success', 'conflict'])('ignores a late portfolio range %s after signing out', async outcome => {
  let finish!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  intercept({ handle: (url, init) => {
    if (url.pathname === '/api/v1/t/greenstate/host/calendar') return json(portfolio);
    if (url.pathname === `${base}/block-range` && init.method === 'POST') {
      signal = init.signal as AbortSignal;
      return new Promise<Response>(resolve => { finish = resolve; });
    }
  } });
  const { cache, router } = mount('/greenstate/host/calendar?from=2026-10-01');
  const publicKey = ['availability', tenant.slug, listing.id];
  cache.setQueryData(publicKey, { days: [] });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: `${listing.title}, 4 October 2026, available` }));
  await user.type(screen.getByLabelText('Reason (optional)'), 'A private range reason');
  await user.click(screen.getByRole('button', { name: 'Block 1 night' }));
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'Sign in' });
  // Deliberately complete even after abort, as a transport can already have received a response.
  await act(async () => finish(outcome === 'success' ? json({ changed: 1 }, 201) : failure(409, 'DATE_OCCUPIED', 'An existing booking occupies this night.')));
  expect(router.state.location.pathname).toBe('/greenstate/login');
  expect(cache.getQueriesData({ queryKey: ['private'] })).toEqual([]);
  expect(cache.getQueryState(publicKey)?.isInvalidated).toBe(false);
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByLabelText('Reason (optional)')).not.toBeInTheDocument();
  expect(screen.queryByText('1 night blocked.')).not.toBeInTheDocument();
  expect(screen.queryByText('An existing booking occupies this night.')).not.toBeInTheDocument();
});

it('recovers invalid portfolio timeline URLs without crashing', async () => {
  intercept(); mount('/greenstate/host/calendar?from=2026-10-01&days=abc');
  expect(await screen.findByRole('alert')).toHaveTextContent('Check calendar filters');
  expect(screen.getByRole('button', { name: 'Reset calendar' })).toBeVisible();
});
it('clears portfolio selection and draft on browser navigation', async () => {
  intercept({ handle: url => url.pathname === '/api/v1/t/greenstate/host/calendar' ? json({ today: initial.today, from: '2026-10-01', to: '2026-10-15', page: 1, pageSize: 20, total: 1, items: [{ listing, bookings: [], days: [{ date: '2026-10-04', status: 'available', bookingIds: [], block: null }] }] }) : undefined });
  const { router } = mount('/greenstate/host/calendar?from=2026-10-01');
  await userEvent.click(await screen.findByRole('button', { name: `${listing.title}, 4 October 2026, available` }));
  fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'A draft belonging to October' } });
  await act(() => router.navigate('/greenstate/host/calendar?from=2026-09-01'));
  await waitFor(() => expect(screen.queryByLabelText('Reason (optional)')).not.toBeInTheDocument());
  await act(() => router.navigate(-1));
  expect(screen.queryByLabelText('Reason (optional)')).not.toBeInTheDocument();
});
it('protects booked portfolio nights while allowing removal of a legacy manual block', async () => {
  intercept({ handle: url => url.pathname === '/api/v1/t/greenstate/host/calendar' ? json({ today: initial.today, from: '2026-10-01', to: '2026-10-15', page: 1, pageSize: 20, total: 1, items: [{ listing, bookings: [first, second], days: [{ ...initial.days[0]!, block: blocked }] }] }) : undefined });
  mount('/greenstate/host/calendar?from=2026-10-01');
  await userEvent.click(await screen.findByRole('button', { name: `${listing.title}, 1 October 2026, booked` }));
  expect(screen.getByText('4 guests · Confirmed · Past')).toBeVisible();
  expect(screen.getByText('2 guests · Completed · Current')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove 1 block' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /^Block \d/ })).not.toBeInTheDocument();
});

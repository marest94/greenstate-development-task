import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookingsPageSchema, BookingsQuerySchema, HostListingViewSchema, type BookingsQuery } from '@greenstate/contracts';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useTenant } from '../../app/TenantProvider';
import { ErrorScreen } from '../../app/ErrorScreen';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequirePermission';
import { FormFeedback, SessionStatus, useFormProblem, validationProblem } from '../auth/AuthForm';
import { bookingPeriod, bookingStatusLabel } from './booking-display';
import './calendar.css';
export function BookingsPage() {
  const auth = useAuth();
  return <RequirePermission permission="bookings:read">{auth.privateKey ? <OwnedBookings key={auth.privateKey.join(':')} /> : <SessionStatus />}</RequirePermission>;
}
function OwnedBookings() {
  const auth = useAuth(); const tenant = useTenant(); const [params, setParams] = useSearchParams();
  const parsed = BookingsQuerySchema.safeParse(Object.fromEntries(params)); const filters = parsed.success ? parsed.data : null;
  const base = auth.apiPath.slice(0, -'/auth'.length);
  const query = useQuery({ queryKey: [...auth.privateKey!, 'host-bookings', filters], enabled: !!filters, queryFn: ({ signal }) => api.get(`${base}/host/bookings`, filters!, BookingsPageSchema, signal) });
  const listing = useQuery({ queryKey: [...auth.privateKey!, 'host-listing', filters?.listingId], enabled: !!filters?.listingId, queryFn: ({ signal }) => api.get(`${base}/host/listings/${filters!.listingId}`, undefined, HostListingViewSchema, signal) });
  function change(values: Record<string, string | undefined>) { const next = new URLSearchParams(params); for (const [key, value] of Object.entries(values)) { if (value === undefined || value === '') next.delete(key); else next.set(key, value); } setParams(next); }
  if (!filters) return <section className="empty-state" role="alert"><h1>Check booking filters</h1><p>Use a valid status, listing and page, with both date boundaries up to 366 days apart.</p><button className="button-secondary" onClick={() => setParams({})}>Reset filters</button></section>;
  return <section aria-labelledby="bookings-heading"><div className="host-heading"><div><p className="eyebrow">Host workspace</p><h1 id="bookings-heading">Booking history</h1><p>Inspect imported stays, including cancelled and historical bookings. Booking records are read-only.</p></div></div>
    {filters.listingId && <div className="host-filtered-listing"><p>{listing.data ? <>Showing stays for <Link to={`${auth.basePath}/host/listings/${listing.data.id}`}>{listing.data.title}</Link>{listing.data.archivedAt ? ' (archived)' : ''}.</> : 'Showing bookings for the selected listing.'}</p><button className="button-secondary" onClick={() => change({ listingId: undefined, page: '1' })}>Show all listings</button></div>}
    <BookingFilters key={params.toString()} filters={filters} onApply={values => change(values)} />
    {query.isPending && <p role="status">Loading bookings…</p>}{query.isError && <ErrorScreen error={query.error} onRetry={() => { void query.refetch(); }} />}
    {query.data && !query.isError && <><p className="host-business-date">Tenant business date: {formatDate(query.data.today)} · {tenant.timezone}. Stay period is based on this date; imported status is unchanged.</p><p className="host-count" role="status">{query.data.total} {query.data.total === 1 ? 'booking' : 'bookings'}</p>
      {query.data.items.length ? <div className="host-table-scroll"><table className="host-table"><caption className="host-sr-only">Booking history</caption><thead><tr><th scope="col">Listing</th><th scope="col">Check-in</th><th scope="col">Checkout</th><th scope="col">Guests</th><th scope="col">Imported status</th><th scope="col">Stay period</th></tr></thead><tbody>{query.data.items.map(booking => <tr key={booking.id}><th scope="row"><Link to={`${auth.basePath}/host/listings/${booking.listingId}`}>{booking.listingTitle}</Link></th><td>{formatDate(booking.checkIn)}</td><td>{formatDate(booking.checkOut)}</td><td>{booking.guests}</td><td><span className="host-badge">{bookingStatusLabel(booking.status)}</span></td><td>{bookingPeriod(booking, query.data.today)}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h2>No bookings on this page</h2><p>Change the filters or return to an earlier page to inspect existing stays.</p></div>}
      <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={page => change({ page: String(page) })} />
    </>}
  </section>;
}
function BookingFilters({ filters, onApply }: { filters: BookingsQuery; onApply: (values: Record<string, string | undefined>) => void }) {
  const [status, setStatus] = useState(filters.status ?? ''); const [from, setFrom] = useState(filters.from ?? ''); const [to, setTo] = useState(filters.to ?? ''); const feedback = useFormProblem();
  function submit(event: FormEvent) {
    event.preventDefault(); feedback.clear(); const parsed = BookingsQuerySchema.safeParse({ ...filters, page: 1, status: status || undefined, from: from || undefined, to: to || undefined });
    if (!parsed.success) { feedback.report(validationProblem(parsed.error.issues)); return; }
    onApply({ status: parsed.data.status, from: parsed.data.from, to: parsed.data.to, page: '1' });
  }
  return <form className="host-booking-filters" onSubmit={submit}><div className="host-field"><label htmlFor="booking-status">Imported status</label><select id="booking-status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
    <div className="host-field"><label htmlFor="booking-from">From date</label><input id="booking-from" type="date" value={from} onChange={event => setFrom(event.target.value)} /></div><div className="host-field"><label htmlFor="booking-to">To date (exclusive)</label><input id="booking-to" type="date" value={to} onChange={event => setTo(event.target.value)} /></div><button className="button-secondary" type="submit">Apply filters</button><div className="host-booking-filter-feedback"><FormFeedback problem={feedback.problem} /></div>
  </form>;
}

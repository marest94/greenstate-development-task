import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AvailabilityQuerySchema, BlockViewSchema, BlockWriteSchema, HostCalendarSchema, HostListingViewSchema } from '@greenstate/contracts';
import { api, ApiProblem } from '../../lib/api';
import { currentBusinessDate, formatDate, monthRange, shiftMonth } from '../../lib/format';
import { MonthCalendar } from '../../components/MonthCalendar';
import { useTenant } from '../../app/TenantProvider';
import { ErrorScreen } from '../../app/ErrorScreen';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequirePermission';
import { FormFeedback, SessionStatus, useFormProblem, validationProblem } from '../auth/AuthForm';
import { bookingPeriod, bookingStatusLabel } from './booking-display';
import './calendar.css';
export function CalendarPage() {
  const auth = useAuth(); const { id } = useParams();
  return <RequirePermission permission="calendar:manage">{auth.privateKey ? <OwnedCalendar key={`${auth.privateKey.join(':')}:${id}`} id={id} /> : <SessionStatus />}</RequirePermission>;
}
function OwnedCalendar({ id }: { id: string | undefined }) {
  const auth = useAuth(); const tenant = useTenant(); const cache = useQueryClient(); const [params, setParams] = useSearchParams();
  const [fallbackMonth] = useState(() => currentBusinessDate(tenant.timezone).slice(0, 7)); const month = params.get('month') ?? fallbackMonth;
  const validId = HostListingViewSchema.shape.id.safeParse(id).success;
  const range = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? AvailabilityQuerySchema.safeParse(monthRange(month)) : null;
  const validMonth = range?.success === true;
  const path = `${auth.apiPath.slice(0, -'/auth'.length)}/host/listings/${id}`;
  const listing = useQuery({ queryKey: [...auth.privateKey!, 'host-listing', id], enabled: validId, queryFn: ({ signal }) => api.get(path, undefined, HostListingViewSchema, signal) });
  const calendar = useQuery({ queryKey: [...auth.privateKey!, 'host-calendar', id, month], enabled: validId && validMonth, queryFn: ({ signal }) => api.get(`${path}/calendar`, range!.success ? range!.data : undefined, HostCalendarSchema, signal) });
  const [selected, setSelected] = useState<string | null>(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const feedback = useFormProblem(); const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const reload = () => {
    void cache.invalidateQueries({ queryKey: auth.privateKey! });
    void cache.invalidateQueries({ predicate: query => ['listing', 'listings', 'availability'].includes(String(query.queryKey[0])) && query.queryKey[1] === tenant.slug });
  };
  async function change(action: 'create' | 'remove', blockId?: string) {
    if (pending.current || !selected) return;
    const input = BlockWriteSchema.safeParse({ date: selected, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    if (action === 'create' && !input.success) { feedback.report(validationProblem(input.error.issues)); return; }
    const controller = new AbortController(); pending.current = controller; setBusy(true); feedback.clear(); setMessage('');
    try {
      if (action === 'create' && input.success) await api.post(`${path}/blocks`, input.data, BlockViewSchema, controller.signal);
      else await api.delete(`${path}/blocks/${blockId}`, undefined, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setReason(''); setMessage(action === 'create' ? 'Day blocked.' : 'Block removed.'); reload();
    } catch (error) { if (!controller.signal.aborted) { feedback.report(error); if (error instanceof ApiProblem && error.status === 409) reload(); } }
    finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  function navigateMonth(next: string) { if (busy) return; const nextParams = new URLSearchParams(params); nextParams.set('month', next); setParams(nextParams); setSelected(null); setReason(''); setMessage(''); feedback.clear(); }
  function select(date: string) { if (busy) return; setSelected(date); setReason(''); setMessage(''); feedback.clear(); }
  if (!validId) return <ErrorScreen error={new ApiProblem({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'This listing could not be found.', requestId: '' })} backTo={`${auth.basePath}/host/listings`} />;
  if (!validMonth) return <section className="empty-state" role="alert"><h1>Check calendar month</h1><p>Choose a valid calendar month.</p><button className="button-secondary" onClick={() => navigateMonth(fallbackMonth)}>Reset month</button></section>;
  if (listing.isPending) return <p role="status">Loading listing…</p>;
  if (listing.isError) return <ErrorScreen error={listing.error} onRetry={() => { void listing.refetch(); }} />;
  const day = calendar.data?.days.find(item => item.date === selected); const today = calendar.data?.today;
  const selectedBookings = calendar.data?.bookings.filter(booking => day?.bookingIds.includes(booking.id)) ?? [];
  const allowBlock = !!day && day.status === 'available' && !!today && day.date >= today && !listing.data.archivedAt;
  function submit(event: FormEvent) { event.preventDefault(); if (allowBlock) void change('create'); }
  return <section className="host-calendar" aria-labelledby="host-calendar-heading">
    <div className="host-heading"><div><p className="eyebrow">Host workspace</p><h1 id="host-calendar-heading">Listing calendar</h1><p>{listing.data.title}</p></div><span className="host-badge">{listing.data.archivedAt ? 'Archived' : 'Active'}</span></div>
    <nav className="host-calendar-links" aria-label="Listing navigation"><Link to={`${auth.basePath}/host/listings/${id}`}>Edit listing</Link><Link to={`${auth.basePath}/host/bookings?listingId=${id}`}>Booking history</Link></nav>
    {listing.data.archivedAt && <p className="host-notice">Restore this listing before adding blocked days. Existing bookings and blocks remain available here.</p>}
    <div className="host-calendar-toolbar"><button className="button-secondary" type="button" disabled={busy || month <= '0001-01'} onClick={() => navigateMonth(shiftMonth(month, -1))}>Previous month</button><label>Calendar month<input type="month" min="0001-01" max="9999-11" value={month} disabled={busy} onChange={event => { if (event.target.value) navigateMonth(event.target.value); }} /></label><button className="button-secondary" type="button" disabled={busy || month >= '9999-11'} onClick={() => navigateMonth(shiftMonth(month, 1))}>Next month</button></div>
    {calendar.isPending && <p role="status">Loading calendar…</p>}
    {calendar.isError && <ErrorScreen error={calendar.error} onRetry={() => { void calendar.refetch(); }} />}
    {calendar.data && !calendar.isError && <><p className="host-business-date">Tenant business date: {formatDate(calendar.data.today)} · {tenant.timezone}. This date applies to all listings in this tenant.</p>
      <p className="host-hint">Choose a day to inspect bookings or manage its block. Checkout dates are free unless another stay or block occupies that night.</p>
      <div className="host-calendar-grid"><MonthCalendar month={month} today={calendar.data.today} days={calendar.data.days.map(item => ({ date: item.date, available: item.status === 'available' }))}
        selection={{ from: selected, to: null }} onSelect={select} canSelect={date => !busy && calendar.data.days.some(item => item.date === date)} dayLabels={Object.fromEntries(calendar.data.days.map(item => [item.date, { status: item.status, short: { available: 'Free', booked: 'Booked', blocked: 'Blocked' }[item.status] }]))} />
      {day ? <section className="host-day-detail" aria-labelledby="selected-day-heading"><h2 id="selected-day-heading">{formatDate(day.date)}</h2>
        <FormFeedback problem={feedback.problem} />{message && <p className="host-success" role="status">{message}</p>}
        {selectedBookings.length > 0 && <><p>Bookings are read-only. Removing a block does not change a booking.</p><ul className="host-booking-cards">{selectedBookings.map(booking => <li key={booking.id}><p><strong>{formatDate(booking.checkIn)}</strong> to <strong>{formatDate(booking.checkOut)}</strong></p><p>{booking.guests} guests</p><dl><div><dt>Imported status</dt><dd>{bookingStatusLabel(booking.status)}</dd></div><div><dt>Stay period</dt><dd>{bookingPeriod(booking, calendar.data.today)}</dd></div></dl></li>)}</ul></>}
        {day.block && <div className="host-block-detail"><h3>Blocked day</h3><p>{day.block.reason ?? 'No reason provided.'}</p><button className="button-secondary" type="button" disabled={busy} onClick={() => { void change('remove', day.block!.id); }}>Remove block</button></div>}
        {allowBlock && <form onSubmit={submit}><p>This night is available. Block it to make it unavailable on the public portal.</p><div className="host-field"><label htmlFor="block-reason">Reason (optional)</label><textarea id="block-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={3} disabled={busy} aria-invalid={feedback.problem?.fields?.reason ? true : undefined} aria-describedby={feedback.problem?.fields?.reason ? 'block-reason-error' : undefined} />{feedback.problem?.fields?.reason && <p id="block-reason-error" className="auth-field-error">{feedback.problem.fields.reason.join(' ')}</p>}</div><button className="button-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Block day'}</button></form>}
        {day.status === 'available' && day.date < calendar.data.today && <p>This is a past tenant business date. New blocks can only be added from today onward.</p>}
      </section> : <div className="host-day-detail host-day-placeholder"><h2>Select a day</h2><p>Inspect booked nights, add a block to an available night, or remove an existing block.</p></div>}</div>
    </>}
  </section>;
}

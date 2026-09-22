import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlockRangeSchema, PortfolioCalendarPageSchema, PortfolioCalendarQuerySchema, RangeResultSchema } from '@greenstate/contracts';
import { api, ApiProblem } from '../../lib/api';
import { useTenant } from '../../app/TenantProvider';
import { currentBusinessDate, formatDate } from '../../lib/format';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequirePermission';
import { SessionStatus, useFormProblem, validationProblem } from '../auth/AuthForm';
import { ErrorScreen } from '../../app/ErrorScreen';
import { Pagination } from '../../components/Pagination';
import { PortfolioGrid, type Selection } from './PortfolioGrid';
import { AvailabilityRangeEditor } from './AvailabilityRangeEditor';
import { offsetDate } from './portfolio-dates';
import './portfolio-calendar.css';
export function PortfolioCalendarPage() {
  const auth = useAuth(); const [params] = useSearchParams();
  return <RequirePermission permission="calendar:manage">{auth.privateKey ? <Portfolio key={`${auth.privateKey.join(':')}:${params.toString()}`} /> : <SessionStatus />}</RequirePermission>;
}
function Portfolio() {
  const auth = useAuth(); const tenant = useTenant(); const cache = useQueryClient(); const [params, setParams] = useSearchParams();
  const [defaultFrom] = useState(() => currentBusinessDate(tenant.timezone));
  const [defaultSize] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches ? 7 : 14);
  const size = params.get('days') ?? String(defaultSize); const from = params.get('from') ?? defaultFrom;
  const raw = Object.fromEntries(params); delete raw.days;
  const parsed = PortfolioCalendarQuerySchema.safeParse({ ...raw, from, to: offsetDate(from, Number(size)) });
  const valid = (size === '7' || size === '14') && parsed.success;
  const path = `${auth.apiPath.slice(0, -5)}/host`;
  const query = useQuery({ queryKey: [...auth.privateKey!, 'portfolio-calendar', raw, from, size], enabled: valid, queryFn: ({ signal }) => api.get(`${path}/calendar`, parsed.success ? parsed.data : undefined, PortfolioCalendarPageSchema, signal) });
  const [selection, setSelection] = useState<Selection | null>(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const feedback = useFormProblem(); const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const row = query.data?.items.find(item => item.listing.id === selection?.id);
  function change(values: Record<string, string>) {
    if (busy) return; const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    setParams(next); setSelection(null); setReason(''); feedback.clear(); setMessage('');
  }
  function select(id: string, date: string) {
    if (busy) return;
    setSelection(previous => previous?.id === id && !previous.complete ? { id, anchor: previous.anchor, from: previous.anchor < date ? previous.anchor : date, last: previous.anchor > date ? previous.anchor : date, complete: true } : { id, from: date, last: date, anchor: date, complete: false });
    setReason(''); feedback.clear(); setMessage('');
  }
  const reload = () => {
    void cache.invalidateQueries({ queryKey: auth.privateKey! });
    void cache.invalidateQueries({ predicate: q => ['listing', 'listings', 'availability'].includes(String(q.queryKey[0])) && q.queryKey[1] === tenant.slug });
  };
  async function save(action: 'block' | 'unblock') {
    if (!selection || pending.current) return;
    const input = BlockRangeSchema.safeParse({ from: selection.from, to: offsetDate(selection.last, 1), action, ...(action === 'block' && reason.trim() ? { reason: reason.trim() } : {}) });
    if (!input.success) { feedback.report(validationProblem(input.error.issues)); return; }
    const controller = new AbortController(); pending.current = controller; setBusy(true); feedback.clear(); setMessage('');
    try {
      const result = await api.post(`${path}/listings/${selection.id}/block-range`, input.data, RangeResultSchema, controller.signal);
      if (controller.signal.aborted) return;
      setMessage(`${result.changed} ${action === 'block' ? `${result.changed === 1 ? 'night' : 'nights'} blocked` : `${result.changed === 1 ? 'block' : 'blocks'} removed`}.`); setReason(''); reload();
    } catch (error) { if (!controller.signal.aborted) { feedback.report(error); if (error instanceof ApiProblem && error.status === 409) reload(); } }
    finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  if (!valid) return <section role="alert"><h1>Check calendar filters</h1><p>Choose a valid start date and a 7 or 14-day view.</p><button className="button-secondary" onClick={() => setParams({})}>Reset calendar</button></section>;
  const previous = offsetDate(from, -Number(size)); const next = offsetDate(from, Number(size));
  return <section className="portfolio" aria-labelledby="portfolio-heading"><div className="host-heading"><div><p className="eyebrow">Host workspace</p><h1 id="portfolio-heading">Availability at a glance</h1><p>See your properties together. Select nights in a row to manage availability.</p></div><span className="host-badge">Portfolio calendar</span></div>
    <form key={params.toString()} className="portfolio-filters" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); change({ search: String(form.get('search') ?? '').trim(), city: String(form.get('city') ?? '').trim(), status: String(form.get('status')), page: '1' }); }}>
      <label>Find a property<input name="search" maxLength={200} defaultValue={parsed.data.search ?? ''} placeholder="Property name" disabled={busy} /></label><label>City<input name="city" maxLength={80} defaultValue={parsed.data.city ?? ''} placeholder="All cities" disabled={busy} /></label><label>Listing status<select name="status" defaultValue={parsed.data.status} disabled={busy}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All listings</option></select></label><button className="button-secondary" disabled={busy}>Apply filters</button>
    </form>
    <div className="portfolio-navigation"><button className="button-secondary" disabled={busy || !previous} onClick={() => previous && change({ from: previous })}>Previous</button><label>Starting date<input type="date" value={from} disabled={busy} onChange={e => e.target.value && change({ from: e.target.value })} /></label><button className="button-secondary" disabled={busy || !next || !offsetDate(next, Number(size))} onClick={() => next && change({ from: next })}>Next</button><button className="button-secondary" disabled={busy} onClick={() => change({ from: query.data?.today ?? defaultFrom })}>Today</button><label>Timeline<select value={size} disabled={busy} onChange={e => change({ days: e.target.value })}><option value="7">7 days</option><option value="14">14 days</option></select></label></div>
    {query.isPending && <p role="status">Loading portfolio…</p>}{query.isError && <ErrorScreen error={query.error} onRetry={() => { void query.refetch(); }} />}
    {message && !row && <p className="host-success" role="status">{message}</p>}
    {query.data && !query.isError && <><div className="portfolio-meta"><p>{query.data.total} {query.data.total === 1 ? 'property' : 'properties'} · {formatDate(from)} – {formatDate(offsetDate(query.data.to, -1)!)}</p><p>Business date: {formatDate(query.data.today)} · {tenant.timezone}</p></div><div className="portfolio-legend"><span className="night-available">Free</span><span className="night-booked">Booked</span><span className="night-blocked">Manual block</span></div>
      {query.data.items.length ? <div className={`portfolio-workspace ${row ? 'has-editor' : ''}`}><PortfolioGrid items={query.data.items} selected={selection} busy={busy} onSelect={select} />{row && selection && <AvailabilityRangeEditor key={selection.id} row={row} selected={selection} today={query.data.today} busy={busy} reason={reason} message={message} problem={feedback.problem} basePath={auth.basePath} onReason={setReason} onClose={() => !busy && setSelection(null)} onDates={(start, last) => { setSelection({ ...selection, from: start, last, complete: true }); feedback.clear(); setMessage(''); }} onSave={action => { void save(action); }} />}</div> : <div className="empty-state"><h2>No properties on this page</h2><p>Adjust your filters or return to the first page.</p></div>}
      <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={page => change({ page: String(page) })} />
    </>}
  </section>;
}

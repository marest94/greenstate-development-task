import { useEffect, useRef, type ReactNode } from 'react';
import { BlockRangeSchema, type PortfolioCalendarPage } from '@greenstate/contracts';
import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/format';
import { FormFeedback } from '../auth/AuthForm';
import type { ApiProblem } from '../../lib/api';
import { bookingPeriod, bookingStatusLabel } from './booking-display';
import { offsetDate } from './portfolio-dates';
import type { Selection } from './PortfolioGrid';
export function AvailabilityRangeEditor({ row, selected, today, busy, reason, message, problem, basePath, onReason, onDates, onSave, onClose }: {
  row: PortfolioCalendarPage['items'][number]; selected: Selection; today: string; busy: boolean; reason: string; message: string; problem: ApiProblem | null; basePath: string;
  onReason: (reason: string) => void; onDates: (from: string, last: string) => void; onSave: (action: 'block' | 'unblock') => void; onClose: () => void;
}) {
  const to = offsetDate(selected.last, 1);
  const valid = BlockRangeSchema.safeParse({ from: selected.from, to, action: 'block' }).success;
  const inView = valid && selected.from >= (row.days[0]?.date ?? '') && selected.last <= (row.days.at(-1)?.date ?? '');
  const days = inView ? row.days.filter(d => d.date >= selected.from && d.date <= selected.last) : [];
  const occupied = days.filter(d => d.bookingIds.length).length;
  const blocks = days.filter(d => d.block).length;
  const free = days.filter(d => d.status === 'available').length;
  const stays = row.bookings.filter(b => b.status !== 'cancelled' && b.checkIn <= selected.last && b.checkOut > selected.from);
  const canBlock = inView && !occupied && !row.listing.archivedAt && selected.from >= today && free > 0;
  return <RangeShell onClose={onClose} busy={busy}>
    <div className="range-title"><p className="eyebrow">Edit availability</p><button className="button-secondary" disabled={busy} onClick={onClose} aria-label="Close availability editor">✕</button></div>
    <h2 id="range-heading">{row.listing.title}</h2><p className="host-hint">Select the first and last night in this row, or enter dates below.</p>
    <FormFeedback problem={problem} />{message && <p className="host-success" role="status">{message}</p>}
    <div className="range-dates"><label>First night<input type="date" value={selected.from} disabled={busy} onChange={e => onDates(e.target.value, selected.last)} /></label><label>Last night (included)<input type="date" value={selected.last} disabled={busy} onChange={e => onDates(selected.from, e.target.value)} /></label></div>
    {!inView && <p role="alert">Choose up to 31 nights within the displayed timeline. Navigate the timeline to edit other dates.</p>}
    {inView && <><div className="range-preview"><strong>{days.length} nights selected</strong><p>{free} available · {occupied} booked · {blocks} manually blocked</p></div>
      {occupied > 0 && <p className="host-notice">This selection includes booked nights. Adjust the dates before adding blocks.</p>}
      {selected.from < today && <p>New blocks can only start today or later.</p>}
      {row.listing.archivedAt && <p>Restore this property before adding blocks.</p>}
      {canBlock && <><label className="host-field">Reason (optional)<textarea maxLength={500} value={reason} disabled={busy} onChange={e => onReason(e.target.value)} /></label><p>{free} nights will be blocked</p>{blocks > 0 && <p>Existing blocks and their reasons will be kept.</p>}<button className="button-primary" disabled={busy} onClick={() => onSave('block')}>{busy ? 'Saving…' : `Block ${free} nights`}</button></>}
      {blocks > 0 && <><p>{blocks} manual blocks can be removed. Bookings remain unchanged.</p><button className="button-secondary" disabled={busy} onClick={() => onSave('unblock')}>Remove {blocks} blocks</button><ul className="range-blocks">{days.filter(d => d.block).map(d => <li key={d.date}>{formatDate(d.date)}: {d.block?.reason ?? 'No reason provided'}</li>)}</ul></>}
      {stays.length > 0 && <section aria-label="Bookings in selection"><h3>Bookings · read-only</h3>{stays.map(b => <article className="range-booking" key={b.id}><strong>{formatDate(b.checkIn)} – {formatDate(b.checkOut)}</strong><p>{b.guests} guests · {bookingStatusLabel(b.status)} · {bookingPeriod(b, today)}</p></article>)}</section>}
    </>}
    <Link to={`${basePath}/host/listings/${row.listing.id}`}>Edit property details</Link>
  </RangeShell>;
}
function RangeShell({ children, onClose, busy }: { children: ReactNode; onClose: () => void; busy: boolean }) {
  const mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    if (mobile) dialog.current?.showModal();
    return () => { dialog.current?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [mobile]);
  return mobile ? <dialog ref={dialog} className="availability-editor availability-sheet" aria-labelledby="range-heading" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>{children}</dialog> : <section className="availability-editor" aria-labelledby="range-heading">{children}</section>;
}

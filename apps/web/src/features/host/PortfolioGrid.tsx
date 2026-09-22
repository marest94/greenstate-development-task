import type { PortfolioCalendarPage } from '@greenstate/contracts';
import { formatDate } from '../../lib/format';
export type Selection = { id: string; from: string; last: string; anchor: string; complete: boolean };
export function PortfolioGrid({ items, selected, busy, onSelect }: { items: PortfolioCalendarPage['items']; selected: Selection | null; busy: boolean; onSelect: (id: string, date: string) => void }) {
  return <div className="portfolio-scroll" tabIndex={0} role="region" aria-label="Property availability timeline"><table className="portfolio-table"><caption className="host-sr-only">Portfolio availability</caption>
    <thead><tr><th scope="col">Property</th>{items[0]?.days.map(day => <th scope="col" key={day.date}><span>{new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(day.date))}</span>{day.date.slice(8)}<small>{new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(day.date))}</small></th>)}</tr></thead>
    <tbody>{items.map(({ listing, days }) => <tr key={listing.id}><th scope="row"><strong>{listing.title}</strong><small>{listing.city} · {listing.maxGuests} guests{listing.archivedAt ? ' · Archived' : ''}</small></th>{days.map(day => <td key={day.date}><button type="button" disabled={busy} className={`portfolio-night night-${day.status}`} aria-pressed={selected?.id === listing.id && day.date >= selected.from && day.date <= selected.last} aria-label={`${listing.title}, ${formatDate(day.date)}, ${day.status}`} onClick={() => onSelect(listing.id, day.date)}>{day.status === 'available' ? 'Free' : day.status === 'booked' ? 'Booked' : 'Blocked'}</button></td>)}</tr>)}</tbody>
  </table></div>;
}

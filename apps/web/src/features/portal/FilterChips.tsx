import { useEffect, useRef } from 'react';
import type { ListingSearch } from '@greenstate/contracts';
import { formatDate, formatMoney } from '../../lib/format';

export function FilterChips({ filters, onChange }: { filters: ListingSearch; onChange: (next: ListingSearch) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current) {
      (container.current?.querySelector('button') ?? container.current)?.focus();
      restoreFocus.current = false;
    }
  }, [filters]);
  const chips: { name: string; label: string; remove: Partial<ListingSearch> }[] = [];
  if (filters.city) chips.push({ name: 'city', label: filters.city, remove: { city: undefined } });
  if (filters.guests) chips.push({ name: 'guests', label: `${filters.guests} ${filters.guests === 1 ? 'guest' : 'guests'}`, remove: { guests: undefined } });
  if (filters.minPriceCents !== undefined || filters.maxPriceCents !== undefined) {
    const min = filters.minPriceCents; const max = filters.maxPriceCents;
    const label = min !== undefined && max !== undefined ? `${formatMoney(min)}–${formatMoney(max)} / night` : min !== undefined ? `From ${formatMoney(min)} / night` : `Up to ${formatMoney(max!)} / night`;
    chips.push({ name: 'price', label, remove: { minPriceCents: undefined, maxPriceCents: undefined } });
  }
  if (filters.from && filters.to) chips.push({ name: 'dates', label: `${formatDate(filters.from)} – ${formatDate(filters.to)}`, remove: { from: undefined, to: undefined } });
  return <div ref={container} className="filter-chips" role="group" aria-label="Active search filters" tabIndex={-1}>
    {chips.map(chip => <button type="button" key={chip.name} aria-label={`Remove ${chip.name} filter: ${chip.label}`} onClick={() => { restoreFocus.current = true; onChange({ ...filters, ...chip.remove, page: 1 }); }}>{chip.label}<span aria-hidden="true">×</span></button>)}
    {chips.length === 0 && <span className="no-active-filters">All destinations, any dates. Make it your own.</span>}
  </div>;
}

import { useId, useState, type FormEvent } from 'react';
import { ListingSearchSchema, type ListingSearch } from '@greenstate/contracts';
import { DateRangeField, type DateRangeValue } from '../../components/DateRangeField';
import { parsePriceCents, priceInput } from '../../lib/format';

export const parseSearchParams = (params: URLSearchParams): ListingSearch => ListingSearchSchema.parse(Object.fromEntries(params));
export function toSearchParams(filters: ListingSearch): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ListingSearchSchema.parse(filters))) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}
type Props = {
  value: ListingSearch;
  cities: string[];
  today?: string;
  onSubmit: (value: ListingSearch) => void;
  onClearDates: () => void;
  onReset: () => void;
};
export function Filters(props: Props) {
  return <FilterForm key={toSearchParams(props.value).toString()} {...props} />;
}
function FilterForm({ value, cities, today, onSubmit, onClearDates, onReset }: Props) {
  const id = useId();
  const [city, setCity] = useState(value.city ?? '');
  const [guests, setGuests] = useState(value.guests?.toString() ?? '');
  const [minPrice, setMinPrice] = useState(priceInput(value.minPriceCents));
  const [maxPrice, setMaxPrice] = useState(priceInput(value.maxPriceCents));
  const [dates, setDates] = useState<DateRangeValue>({ from: value.from ?? null, to: value.to ?? null });
  const [error, setError] = useState('');
  const changeDates = (next: DateRangeValue) => {
    setDates(next); setError('');
    if ((dates.from && !next.from) || (dates.to && !next.to)) {
      if (value.from || value.to || value.page !== 1) onClearDates();
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let minPriceCents: number | undefined;
    let maxPriceCents: number | undefined;
    try { minPriceCents = parsePriceCents(minPrice); maxPriceCents = parsePriceCents(maxPrice); }
    catch (problem) { setError((problem as Error).message); return; }
    const parsed = ListingSearchSchema.safeParse({
      page: 1, pageSize: value.pageSize, city: city || undefined, guests: guests || undefined,
      minPriceCents, maxPriceCents, from: dates.from ?? undefined, to: dates.to ?? undefined,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check your search filters.'); return; }
    if (today && parsed.data.from && parsed.data.from < today) { setError('Choose a check-in on the business date or later.'); return; }
    setError(''); onSubmit(parsed.data);
  };
  const cityOptions = [...new Set([...cities, ...(value.city ? [value.city] : [])])];
  return <form className="search-filters" aria-label="Find a stay" onSubmit={submit} noValidate>
    <div className="filter-heading"><h2>Find your stay</h2><button className="text-button" type="button" onClick={onReset}>Clear all</button></div>
    <div className="filter-grid">
      <label htmlFor={`${id}-city`}>City<select id={`${id}-city`} value={city} onChange={event => setCity(event.target.value)}><option value="">All cities</option>{cityOptions.map(option => <option key={option}>{option}</option>)}</select></label>
      <label htmlFor={`${id}-guests`}>Guests<input id={`${id}-guests`} type="number" inputMode="numeric" min="1" max="12" step="1" placeholder="Any" value={guests} onChange={event => setGuests(event.target.value)} /></label>
      <label htmlFor={`${id}-min`}>Minimum price (€)<input id={`${id}-min`} type="text" inputMode="decimal" placeholder="No minimum" value={minPrice} onChange={event => setMinPrice(event.target.value)} /></label>
      <label htmlFor={`${id}-max`}>Maximum price (€)<input id={`${id}-max`} type="text" inputMode="decimal" placeholder="No maximum" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} /></label>
      <DateRangeField value={dates} today={today ?? ''} onChange={changeDates} />
    </div>
    <div className="filter-bottom"><p>Nightly prices in EUR. Choose both dates to check the whole stay.</p><button className="button-primary" type="submit" disabled={!today}>Search stays <span aria-hidden="true">↗</span></button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}

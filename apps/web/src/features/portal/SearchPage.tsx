import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ListingFacetsSchema, ListingPageSchema, type ListingSearch } from '@greenstate/contracts';
import { useTenant } from '../../app/TenantProvider';
import { ErrorScreen } from '../../app/ErrorScreen';
import { Pagination } from '../../components/Pagination';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Filters, parseSearchParams, toSearchParams } from './Filters';
import { SaveButton, SavedListingsState } from '../saved/SaveButton';
import { ListingCard } from './ListingCard';
import { FilterChips } from './FilterChips';
import { SearchMap } from './SearchMap';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  let filters: ListingSearch;
  try { filters = parseSearchParams(params); }
  catch {
    return <section className="empty-state" role="alert"><p className="eyebrow">A fresh start</p><h1>Check your search filters</h1><p>This search link contains invalid filters. Reset them to explore available stays.</p><button className="button-primary" type="button" onClick={() => setParams({})}>Reset filters</button></section>;
  }
  return <SearchResults filters={filters} />;
}
function SearchResults({ filters }: { filters: ListingSearch }) {
  const tenant = useTenant();
  const [params, setParams] = useSearchParams();
  const mapView = params.get('view') === 'map';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const selectListing = useCallback((id: string) => { setSelectedId(id); setSelectionRevision(value => value + 1); }, []);
  const [resetVersion, setResetVersion] = useState(0);
  const updateSearch = (next: ListingSearch) => {
    const nextParams = toSearchParams(next);
    if (mapView) nextParams.set('view', 'map');
    setSelectedId(null); setParams(nextParams);
  };
  const toggleMap = () => {
    const next = new URLSearchParams(params);
    if (mapView) next.delete('view'); else next.set('view', 'map');
    setParams(next);
  };
  const results = useQuery({ queryKey: ['listings', tenant.slug, filters], queryFn: () => api.get(`/t/${tenant.slug}/listings`, filters, ListingPageSchema) });
  const facets = useQuery({ queryKey: ['listing-facets', tenant.slug], queryFn: () => api.get(`/t/${tenant.slug}/listings/facets`, undefined, ListingFacetsSchema) });
  const [lastToday, setLastToday] = useState<string>();
  useEffect(() => { if (results.data?.today) setLastToday(results.data.today); }, [results.data?.today]);
  const reset = () => { setResetVersion(value => value + 1); updateSearch({ page: 1, pageSize: 20 }); };
  const clearDates = () => updateSearch({ ...filters, from: undefined, to: undefined, page: 1 });
  return <div className="search-page">
    <section className="search-intro"><div><p className="eyebrow">GOOD PLACES. NEW PERSPECTIVES.</p><h1>Find your kind of somewhere.</h1></div><p>A city break, a slower weekend, a place to settle in.<br />Your next chapter starts here.</p></section>
    <Filters resetKey={`${toSearchParams(filters)}:${resetVersion}`} value={filters} cities={facets.data?.cities ?? []} today={results.data?.today ?? lastToday} onSubmit={next => updateSearch({ ...next, page: 1 })} onClearDates={clearDates} onReset={reset} />
    <FilterChips filters={filters} onChange={updateSearch} />
    {facets.isError && <p className="facet-error">City options could not be loaded. <button className="text-button" type="button" onClick={() => { void facets.refetch(); }}>Retry cities</button></p>}
    {results.data && <p className="business-date">Business date: {formatDate(results.data.today)} · {tenant.timezone}</p>}
    {results.isPending ? <div className="results-loading" role="status"><p>Finding your next stay…</p><div className="skeleton-grid" aria-hidden="true">{[0, 1, 2].map(index => <div key={index} className="skeleton-card" />)}</div></div> : results.isError ? <ErrorScreen error={results.error} onRetry={() => { void results.refetch(); }} /> : <section className="search-results" aria-labelledby="results-heading">
      <div className="results-heading"><h2 id="results-heading">{results.data.total.toLocaleString('en-GB')} {results.data.total === 1 ? 'stay' : 'stays'} to explore</h2><button className="map-view-toggle" type="button" aria-pressed={mapView} onClick={toggleMap}><span aria-hidden="true">{mapView ? '▦' : '⌖'}</span>{mapView ? 'Hide map' : 'Show map'}</button></div>
      {results.data.items.length > 0 ? <SavedListingsState listingIds={results.data.items.map(listing => listing.id)}>
        <div className={mapView ? 'map-results-layout' : ''}>
          {mapView && <SearchMap key={toSearchParams(filters).toString()} listings={results.data.items} total={results.data.total} page={filters.page} slug={tenant.slug} selectedId={selectedId} selectionRevision={selectionRevision} onSelect={selectListing} />}
          <div className="listing-grid">{results.data.items.map(listing => <div className={`listing-map-item${mapView && selectedId === listing.id ? ' is-highlighted' : ''}`} key={listing.id} onMouseEnter={() => { if (mapView) selectListing(listing.id); }} onFocus={() => { if (mapView) selectListing(listing.id); }}>
            <ListingCard listing={listing} slug={tenant.slug} action={<SaveButton listingId={listing.id} title={listing.title} />} />
            {mapView && <button className="locate-stay" type="button" aria-label={`Locate ${listing.title} on map`} aria-pressed={selectedId === listing.id} onClick={() => { selectListing(listing.id); document.getElementById('search-results-map')?.scrollIntoView({ block: 'nearest' }); }}>⌖ Show on map</button>}
          </div>)}</div>
        </div>
      </SavedListingsState> : <div className="empty-state"><span className="empty-mark" aria-hidden="true">⌂</span><h3>No stays match your search</h3><p>Try another city, a wider price range, or different dates.</p><button className="button-secondary" type="button" onClick={reset}>Reset filters</button></div>}

      <Pagination page={filters.page} pageSize={filters.pageSize} total={results.data.total} onChange={page => updateSearch({ ...filters, page })} />
    </section>}
  </div>;
}

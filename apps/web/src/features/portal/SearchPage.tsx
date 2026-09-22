import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ListingFacetsSchema, ListingPageSchema, type ListingSearch } from '@greenstate/contracts';
import { useTenant } from '../../app/TenantProvider';
import { ErrorScreen } from '../../app/ErrorScreen';
import { Pagination } from '../../components/Pagination';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Filters, parseSearchParams, toSearchParams } from './Filters';
import { ListingCard } from './ListingCard';

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
  const location = useLocation();
  const [, setParams] = useSearchParams();
  const results = useQuery({ queryKey: ['listings', tenant.slug, filters], queryFn: () => api.get(`/t/${tenant.slug}/listings`, filters, ListingPageSchema) });
  const facets = useQuery({ queryKey: ['listing-facets', tenant.slug], queryFn: () => api.get(`/t/${tenant.slug}/listings/facets`, undefined, ListingFacetsSchema) });
  const reset = () => setParams({});
  const clearDates = () => setParams(toSearchParams({ ...filters, from: undefined, to: undefined, page: 1 }));
  return <div className="search-page">
    <section className="search-intro"><p className="eyebrow">Somewhere to settle in</p><h1>A place for<br />your next chapter.</h1><p>Find a stay that fits you. Explore homes, compare the details, and make room for what comes next.</p><span className="intro-mark" aria-hidden="true">↗</span></section>
    <Filters key={location.key} value={filters} cities={facets.data?.cities ?? []} today={results.data?.today} onSubmit={next => setParams(toSearchParams({ ...next, page: 1 }))} onClearDates={clearDates} onReset={reset} />
    {facets.isError && <p className="facet-error">City options could not be loaded. <button className="text-button" type="button" onClick={() => { void facets.refetch(); }}>Retry cities</button></p>}
    {results.data && <p className="business-date">Business date: {formatDate(results.data.today)} · {tenant.timezone}</p>}
    {results.isPending ? <div className="results-loading" role="status"><p>Finding your next stay…</p><div className="skeleton-grid" aria-hidden="true">{[0, 1, 2].map(index => <div key={index} className="skeleton-card" />)}</div></div> : results.isError ? <ErrorScreen error={results.error} onRetry={() => { void results.refetch(); }} /> : <section className="search-results" aria-labelledby="results-heading">
      <div className="results-heading"><h2 id="results-heading">{results.data.total.toLocaleString('en-GB')} {results.data.total === 1 ? 'stay' : 'stays'} to explore</h2><span>Make yourself at home</span></div>
      {results.data.items.length > 0 ? <div className="listing-grid">{results.data.items.map(listing => <ListingCard key={listing.id} listing={listing} slug={tenant.slug} />)}</div> : <div className="empty-state"><span className="empty-mark" aria-hidden="true">⌂</span><h3>No stays match your search</h3><p>Try another city, a wider price range, or different dates.</p><button className="button-secondary" type="button" onClick={reset}>Reset filters</button></div>}
      <Pagination page={filters.page} pageSize={filters.pageSize} total={results.data.total} onChange={page => setParams(toSearchParams({ ...filters, page }))} />
    </section>}
  </div>;
}

import { Link, useSearchParams } from 'react-router-dom';
import { PaginationSchema } from '@greenstate/contracts';
import { useAuth } from '../auth/AuthProvider';
import { ErrorScreen } from '../../app/ErrorScreen';
import { Pagination } from '../../components/Pagination';
import { ListingCard } from '../portal/ListingCard';
import { formatDate } from '../../lib/format';
import { SaveButton } from './SaveButton';
import { useSavedListings } from './saved-queries';
export function SavedListingsPage() {
  const [params, setParams] = useSearchParams();
  const parsed = PaginationSchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return <section className="empty-state" role="alert"><h1>Check your saved-list link</h1><p>This page number is invalid.</p><button className="button-secondary" onClick={() => setParams({})}>Reset page</button></section>;
  return <SavedResults page={parsed.data.page} pageSize={parsed.data.pageSize} />;
}
function SavedResults({ page, pageSize }: { page: number; pageSize: number }) {
  const auth = useAuth(); const [, setParams] = useSearchParams();
  const result = useSavedListings({ page, pageSize });
  return <section className="saved-page"><header className="saved-heading"><p className="eyebrow">A place to come back to</p><h1>Saved listings</h1><p>Your private shortlist for this rental portal. Most recently saved first.</p></header>
    {!auth.privateKey || result.isPending ? <p role="status">Loading saved listings…</p> : result.isError ? <ErrorScreen error={result.error} onRetry={() => { void result.refetch(); }} /> : <>
      {result.data.items.length === 0 ? <div className="empty-state"><h2>{page === 1 ? 'Your shortlist starts here' : 'No saved listings on this page'}</h2><p>Save stays as you explore, then find them here.</p><Link className="button-primary" to={auth.basePath}>Explore stays</Link></div> : <div className="listing-grid">{result.data.items.map(item => item.listing ?
        <ListingCard key={item.listingId} listing={item.listing} slug={auth.scope.realm === 'tenant' ? auth.scope.slug : ''} action={<SaveButton listingId={item.listingId} title={item.listing.title} saved />} /> :
        <article key={item.listingId} className="listing-card unavailable-card"><p className="eyebrow">Saved stay</p><h2>This listing is unavailable</h2><p>It will reappear here if restored. You can remove it at any time.</p><p>Saved {formatDate(item.savedAt.slice(0, 10))}</p><SaveButton listingId={item.listingId} saved /></article>)}</div>}
      <Pagination page={page} pageSize={pageSize} total={result.data.total} onChange={next => setParams({ page: String(next), pageSize: String(pageSize) })} />
    </>}
  </section>;
}

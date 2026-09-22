import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HostListingsPageSchema, HostListingsQuerySchema } from '@greenstate/contracts';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { Pagination } from '../../components/Pagination';
import { ErrorScreen } from '../../app/ErrorScreen';
import { formatMoney } from '../../lib/format';
export function ListingsPage() {
  const auth = useAuth(); const [params, setParams] = useSearchParams();
  const parsed = HostListingsQuerySchema.safeParse(Object.fromEntries(params));
  const filters = parsed.success ? parsed.data : null;
  const enabled = !!auth.privateKey && !!filters && !!auth.principal?.permissions.includes('listings:manage');
  const query = useQuery({ queryKey: [...(auth.privateKey ?? []), 'host-listings', filters], enabled,
    queryFn: ({ signal }) => api.get(`/t/${auth.scope.realm === 'tenant' ? auth.scope.slug : ''}/host/listings`, filters!, HostListingsPageSchema, signal) });
  if (!parsed.success) return <section className="empty-state" role="alert"><h1>Check inventory filters</h1><p>Use active, archived or all listings and a valid page.</p><button className="button-secondary" onClick={() => setParams({})}>Reset filters</button></section>;
  function change(values: Record<string, string>) { const next = new URLSearchParams(params); for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); } setParams(next); }
  return <section aria-labelledby="inventory-heading">
    <div className="host-heading"><div><p className="eyebrow">Host workspace</p><h1 id="inventory-heading">Your inventory</h1><p>Manage the listings shared by your tenant’s hosts.</p></div><Link className="button-primary" to={`${auth.basePath}/host/listings/new`}>Create listing</Link></div>
    <form key={params.toString()} className="inventory-filters" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); change({ search: String(form.get('search') ?? '').trim(), city: String(form.get('city') ?? '').trim(), propertyType: String(form.get('propertyType') ?? ''), sort: String(form.get('sort') ?? 'title'), page: '1' }); }}>
      <label>Property name<input name="search" maxLength={200} defaultValue={parsed.data.search ?? ''} placeholder="Search properties" /></label><label>City<input name="city" maxLength={80} defaultValue={parsed.data.city ?? ''} placeholder="All cities" /></label><label>Property type<select name="propertyType" defaultValue={parsed.data.propertyType ?? ''}><option value="">All types</option>{['apartment','studio','house','loft','room'].map(type => <option key={type}>{type}</option>)}</select></label><label>Sort by<select name="sort" defaultValue={parsed.data.sort}><option value="title">Property name</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label><button className="button-secondary">Apply filters</button>
    </form>
    <div className="host-toolbar"><label htmlFor="inventory-status">Listing status</label><select id="inventory-status" value={parsed.data.status} onChange={event => change({ status: event.target.value, page: '1' })}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All listings</option></select></div>
    {query.isPending && <p role="status">Loading inventory…</p>}
    {query.isError && <ErrorScreen error={query.error} onRetry={() => { void query.refetch(); }} />}
    {query.data && <><p className="host-count" role="status">{query.data.total} {query.data.total === 1 ? 'listing' : 'listings'}</p>
      {query.data.items.length ? <div className="host-table-scroll"><table className="host-table"><caption className="host-sr-only">Tenant listing inventory</caption><thead><tr><th scope="col">Listing</th><th scope="col">Location</th><th scope="col">Capacity</th><th scope="col">Per night</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
        {query.data.items.map(item => <tr key={item.id}><th scope="row"><Link to={`${auth.basePath}/host/listings/${item.id}`}>{item.title}</Link></th><td>{item.city}, {item.country}</td><td>{item.maxGuests} guests</td><td>{formatMoney(item.pricePerNightCents)}</td><td><span className="host-badge">{item.archivedAt ? 'Archived' : 'Active'}</span></td><td><div className="inventory-actions"><Link to={`${auth.basePath}/host/listings/${item.id}`} aria-label={`Edit ${item.title}`}>Edit</Link><Link to={`${auth.basePath}/host/listings/${item.id}/calendar`} aria-label={`Calendar for ${item.title}`}>Calendar</Link><Link to={`${auth.basePath}/host/bookings?listingId=${item.id}`} aria-label={`Bookings for ${item.title}`}>Bookings</Link>{!item.archivedAt && <Link to={`${auth.basePath}/listings/${item.id}`} aria-label={`Preview ${item.title}`}>Preview</Link>}</div></td></tr>)}
      </tbody></table></div> : <div className="empty-state"><h2>{parsed.data.status === 'archived' ? 'No archived listings' : 'No listings on this page'}</h2><p>{parsed.data.status === 'archived' ? 'Archived listings will remain here so you can edit or restore them.' : 'Create a listing or choose a different inventory page.'}</p></div>}
      <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onChange={page => change({ page: String(page) })} />
    </>}
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AvailabilitySchema, ListingViewSchema, type ListingView } from '@greenstate/contracts';
import { ErrorScreen } from '../../app/ErrorScreen';
import { useTenant } from '../../app/TenantProvider';
import { SaveButton, SavedListingsState } from '../saved/SaveButton';
import { StayGallery } from './StayGallery';
import { LocationMap } from './LocationMap';
import { MonthCalendar } from '../../components/MonthCalendar';
import { api, ApiProblem } from '../../lib/api';
import { countryName, currentBusinessDate, formatDate, formatMoney, formatRating, monthRange, shiftMonth } from '../../lib/format';

export function ListingPage() {
  const tenant = useTenant();
  const { id } = useParams();
  const valid = ListingViewSchema.shape.id.safeParse(id).success;
  const listing = useQuery({ enabled: valid, queryKey: ['listing', tenant.slug, id], queryFn: () => api.get(`/t/${tenant.slug}/listings/${id}`, undefined, ListingViewSchema) });
  if (!valid) return <ErrorScreen error={new ApiProblem({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'The requested listing was not found.', requestId: '' })} backTo={`/${tenant.slug}`} />;
  if (listing.isPending) return <div className="detail-loading" role="status">Loading this stay…</div>;
  if (listing.isError) return <ErrorScreen error={listing.error} onRetry={() => { void listing.refetch(); }} backTo={`/${tenant.slug}`} />;
  return <ListingDetail key={listing.data.id} listing={listing.data} />;
}
function ListingDetail({ listing }: { listing: ListingView }) {
  const tenant = useTenant();
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [listing.id]);
  const location = useLocation();
  const candidate: unknown = location.state?.returnTo;
  const returnTo = typeof candidate === 'string' && (candidate === `/${tenant.slug}` || candidate.startsWith(`/${tenant.slug}?`) || candidate === `/${tenant.slug}/saved`) ? candidate : `/${tenant.slug}`;
  const [month, setMonth] = useState(() => currentBusinessDate(tenant.timezone).slice(0, 7));
  const [businessDate, setBusinessDate] = useState<string>();
  const initialMonthAligned = useRef(false);
  const userNavigated = useRef(false);
  const months = [month, shiftMonth(month, 1)];
  const calendars = useQueries({ queries: months.map(displayMonth => {
    const range = monthRange(displayMonth);
    return { queryKey: ['availability', tenant.slug, listing.id, range], queryFn: () => api.get(`/t/${tenant.slug}/listings/${listing.id}/availability`, range, AvailabilitySchema) };
  }) });
  const responseDate = calendars[0]?.data?.today ?? calendars[1]?.data?.today;
  const today = responseDate ?? businessDate;
  useEffect(() => {
    if (!responseDate) return;
    setBusinessDate(responseDate);
    if (!initialMonthAligned.current) {
      initialMonthAligned.current = true;
      if (!userNavigated.current) setMonth(responseDate.slice(0, 7));
    }
  }, [responseDate]);
  const navigate = (offset: number) => { userNavigated.current = true; setMonth(current => shiftMonth(current, offset)); };
  const calendarError = calendars.find(calendar => calendar.isError)?.error;
  return <div className="listing-detail">
    <Link className="back-link" to={returnTo}><span aria-hidden="true">← </span>Back to listings</Link>
    <section className="detail-intro"><div><p className="eyebrow">{listing.propertyType} · {listing.city}, {countryName(listing.country)}</p><h1>{listing.title}</h1><p className="detail-rating">{listing.rating !== null && <span aria-hidden="true">★ </span>}{formatRating(listing.rating)}{listing.reviewCount > 0 && ` · ${listing.reviewCount} ${listing.reviewCount === 1 ? 'review' : 'reviews'}`}<span className="detail-location"> · {listing.city}, {countryName(listing.country)}</span></p></div></section>
    <StayGallery listingId={listing.id} />
    <div className="detail-body"><div className="detail-main">
    <h2 className="stay-overview">Make yourself at home in {listing.city}</h2>
    <dl className="listing-facts"><div><dt>Room for</dt><dd>{listing.maxGuests} {listing.maxGuests === 1 ? 'guest' : 'guests'}</dd></div><div><dt>Bedrooms</dt><dd>{listing.bedrooms}</dd></div><div><dt>Property</dt><dd className="property-name">{listing.propertyType}</dd></div><div><dt>Location</dt><dd>{listing.city}, {listing.country}</dd></div></dl>
    <dl className="listing-secondary-facts"><div><dt>Listed on</dt><dd><time dateTime={listing.createdAt}>{formatDate(listing.createdAt)}</time></dd></div></dl>
    {listing.description && <section className="listing-description"><h2>About this stay</h2><p>{listing.description}</p></section>}
    <section id="availability" className="availability-section" aria-labelledby="availability-heading">
      <div className="availability-heading"><div><h2 id="availability-heading">Availability</h2><p>Explore available nights. Checkout does not occupy a night.</p></div><div className="calendar-navigation"><button className="button-secondary" type="button" aria-label="Previous months" disabled={month <= '0001-02'} onClick={() => navigate(-2)}>← <span>Previous months</span></button><button className="button-secondary" type="button" aria-label="Next months" disabled={month >= '9999-09'} onClick={() => navigate(2)}><span>Next months</span> →</button></div></div>
      {today ? <p className="business-date">Business date: {formatDate(today)} · {tenant.timezone}</p> : <p className="business-date" role="status">Loading business date…</p>}
      {calendarError && <div className="calendar-error" role="alert"><p>{calendarError.message}</p><button className="button-secondary" type="button" onClick={() => calendars.forEach(calendar => { if (calendar.isError) void calendar.refetch(); })}>Try again</button></div>}
      <div className="calendar-grid" aria-busy={calendars.some(calendar => calendar.isPending)}>{months.map((displayMonth, index) => <MonthCalendar key={displayMonth} month={displayMonth} today={today ?? ''} days={calendars[index]?.data?.days} />)}</div>
      <p className="calendar-legend"><span><i className="legend-free" aria-hidden="true" />Free night</span><span><i className="legend-busy" aria-hidden="true" />Busy night</span><span>… Loading</span></p>
    </section>
    <LocationMap latitude={listing.latitude} longitude={listing.longitude} city={listing.city} country={countryName(listing.country)} />
    </div><aside className="stay-summary" aria-label="Stay summary">
      <p className="summary-eyebrow">YOUR NEXT STAY</p><p className="summary-price"><strong>{formatMoney(listing.pricePerNightCents)}</strong> <span>/ night</span></p>
      <p className="summary-location">{listing.city}, {countryName(listing.country)}</p>
      <dl><div><dt>Guests</dt><dd>Up to {listing.maxGuests}</dd></div><div><dt>Bedrooms</dt><dd>{listing.bedrooms}</dd></div></dl>
      <a className="button-primary" href="#availability">Explore available dates <span aria-hidden="true">↗</span></a>
      <SavedListingsState listingIds={[listing.id]}><SaveButton listingId={listing.id} title={listing.title} /></SavedListingsState>
      <p className="summary-note">Browse availability and save your favourites. Reservations are not available on this portal.</p>
    </aside></div>
    <div className="mobile-stay-bar"><p><strong>{formatMoney(listing.pricePerNightCents)}</strong><span> / night</span></p><a className="button-primary" href="#availability">Check dates <span aria-hidden="true">↗</span></a></div>
  </div>;
}

import { Link } from 'react-router-dom';
import type { ListingDto } from '@greenstate/contracts';
import { countryName, formatMoney, formatRating } from '../../lib/format';

export function ListingCard({ listing, slug }: { listing: ListingDto; slug: string }) {
  return <article className="listing-card">
    <div className="card-topline"><span className="property-type">{listing.propertyType}</span><span className="listing-rating">{listing.rating !== null && <span aria-hidden="true">☆ </span>}{formatRating(listing.rating)}{listing.reviewCount > 0 && <span className="review-count"> ({listing.reviewCount})</span>}</span></div>
    <p className="listing-location">{listing.city}, {countryName(listing.country)}</p>
    <h3><Link to={`/${slug}/listings/${listing.id}`}>{listing.title}</Link></h3>
    <p className="listing-capacity"><span>{listing.maxGuests} {listing.maxGuests === 1 ? 'guest' : 'guests'}</span><span aria-hidden="true">·</span><span>{listing.bedrooms} {listing.bedrooms === 1 ? 'bedroom' : 'bedrooms'}</span></p>
    <div className="card-bottom"><p><strong>{formatMoney(listing.pricePerNightCents)}</strong><span> / night</span></p><span className="card-arrow" aria-hidden="true">↗</span></div>
  </article>;
}

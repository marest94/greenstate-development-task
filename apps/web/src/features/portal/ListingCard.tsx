import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ListingDto } from '@greenstate/contracts';
import { countryName, formatMoney, formatRating } from '../../lib/format';
import { listingIllustrations } from './illustrations';

export function ListingCard({ listing, slug, action }: { listing: ListingDto; slug: string; action?: ReactNode }) {
  const location = useLocation();
  const art = listingIllustrations(listing.id)[0]!;
  return <article className="listing-card">
    <div className="listing-banner"><img src={art.src} alt={art.alt} loading="lazy" width="1536" height="1024" /><span className="illustration-badge">Illustrative image</span></div>
    <div className="card-topline"><span className="property-type">{listing.propertyType}</span><span className="listing-rating">{listing.rating !== null && <span aria-hidden="true">☆ </span>}{formatRating(listing.rating)}{listing.reviewCount > 0 && <span className="review-count"> ({listing.reviewCount})</span>}</span></div>
    <p className="listing-location">{listing.city}, {countryName(listing.country)}</p>
    <h3><Link to={`/${slug}/listings/${listing.id}`} state={{ returnTo: location.pathname + location.search }}>{listing.title}</Link></h3>
    <p className="listing-capacity"><span>{listing.maxGuests} {listing.maxGuests === 1 ? 'guest' : 'guests'}</span><span aria-hidden="true">·</span><span>{listing.bedrooms} {listing.bedrooms === 1 ? 'bedroom' : 'bedrooms'}</span></p>
    <div className="card-bottom"><p><strong>{formatMoney(listing.pricePerNightCents)}</strong><span> / night</span></p><span className="card-arrow" aria-hidden="true">↗</span></div>
    {action}
  </article>;
}

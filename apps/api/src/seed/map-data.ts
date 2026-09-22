import { BookingDtoSchema, ListingDtoSchema } from '@greenstate/contracts';
import { parseCsv } from './parse-csv.js';
const LISTING_COLUMNS = ['id', 'title', 'city', 'country', 'latitude', 'longitude', 'property_type', 'max_guests', 'bedrooms', 'price_per_night_cents', 'currency', 'rating', 'review_count', 'created_at'];
const BOOKING_COLUMNS = ['id', 'listing_id', 'check_in', 'check_out', 'guests', 'status'];
function number(value: string | undefined): number {
  if (value === undefined || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('Expected a numeric CSV field.');
  return Number(value);
}
export function mapData(listingsCsv: string, bookingsCsv: string) {
  const listings = parseCsv(listingsCsv, LISTING_COLUMNS).map(row => ListingDtoSchema.parse({
    id: row.id, title: row.title, city: row.city, country: row.country, latitude: number(row.latitude), longitude: number(row.longitude),
    propertyType: row.property_type, maxGuests: number(row.max_guests), bedrooms: number(row.bedrooms), pricePerNightCents: number(row.price_per_night_cents),
    currency: row.currency, rating: row.rating === '' ? null : number(row.rating), reviewCount: number(row.review_count), createdAt: row.created_at,
  }));
  const bookings = parseCsv(bookingsCsv, BOOKING_COLUMNS).map(row => BookingDtoSchema.parse({
    id: row.id, listingId: row.listing_id, checkIn: row.check_in, checkOut: row.check_out, guests: number(row.guests), status: row.status,
  }));
  const byId = new Map(listings.map(row => [row.id, row]));
  if (byId.size !== listings.length || new Set(bookings.map(row => row.id)).size !== bookings.length) throw new Error('Duplicate source IDs.');
  for (const booking of bookings) {
    const listing = byId.get(booking.listingId);
    if (!listing || booking.guests > listing.maxGuests) throw new Error('A booking has an invalid listing or capacity.');
  }
  return { listings, bookings };
}

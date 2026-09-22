/**
 * Booking challenge — domain contracts.
 *
 * These are the shapes the data has. They are NOT database entities and they are
 * NOT an API contract: how you store this, and what your endpoints look like, is
 * yours to decide.
 *
 * Two things worth reading before you start:
 *
 *  1. The CSV columns are snake_case, these types are camelCase. The mapping is
 *     part of the work.
 *  2. Money is an integer in minor units (cents). There are no floats anywhere in
 *     this file, on purpose.
 */

/**
 * Every price in the dataset is in euros.
 *
 * If you make currency a tenant setting, treat it as a display choice: the
 * data carries no exchange rates and every listing is priced in EUR.
 */
export type Currency = 'EUR';

export type PropertyType = 'apartment' | 'studio' | 'house' | 'loft' | 'room';

/**
 * `confirmed` — upcoming, the place is taken.
 * `completed` — the stay already happened.
 * `cancelled` — the place is NOT taken. A cancelled booking blocks nothing.
 */
export type BookingStatus = 'confirmed' | 'completed' | 'cancelled';

/** An ISO calendar date, `YYYY-MM-DD`. No time, no offset. */
export type IsoDate = string;

export interface ListingDto {
  /** uuid v4 */
  id: string;

  title: string;

  /** Plain city name, exactly as it appears in the data. There is no city table. */
  city: string;

  /** ISO 3166-1 alpha-2. */
  country: string;

  latitude: number;
  longitude: number;

  propertyType: PropertyType;

  /** How many people may stay. 1–12. */
  maxGuests: number;

  /** 0 for a studio. */
  bedrooms: number;

  /** Integer, minor units. 12000 means €120.00 per night. */
  pricePerNightCents: number;

  currency: Currency;

  /**
   * 3.2–5.0, one decimal place. `null` for a listing nobody has reviewed yet —
   * that is a real state in the data, not a gap in it.
   */
  rating: number | null;

  /** 0 when `rating` is null. */
  reviewCount: number;

  createdAt: IsoDate;
}

export interface BookingDto {
  /** uuid v4 */
  id: string;

  /** References `ListingDto.id`. */
  listingId: string;

  /**
   * Arrival date, INCLUSIVE. The guest occupies the place on this date.
   */
  checkIn: IsoDate;

  /**
   * Departure date, EXCLUSIVE. The guest is gone by this date, so the place is
   * free from `checkOut` onwards and a new stay may begin on that same day.
   *
   * A booking of 2026-10-01 → 2026-10-04 is three nights: the 1st, 2nd and 3rd.
   */
  checkOut: IsoDate;

  /** 1 .. the listing's `maxGuests`. */
  guests: number;

  status: BookingStatus;
}


/**
 * Guarantees the dataset makes, so you do not have to defend against them:
 *
 *  - Every `bookings.listing_id` resolves to a row in `listings.csv`.
 *  - Two bookings on the same listing never overlap, whatever their status.
 *  - Bookings run from 2026-07-28 to 2027-04-24.
 *  - The data is generated from a fixed seed, so everyone gets the same rows.
 *
 * What is deliberately NOT in the data:
 *
 *  - A listing has no owner. Hosts and tenants are yours to create, and how
 *    you split the 1,000 listings between them is your decision.
 *  - A booking has no guest — only a head count. No account made it.
 *  - Blocked days do not exist here. That concept is yours to introduce, and
 *    the no-overlap guarantee above covers bookings only.
 *
 * What is deliberately left open:
 *
 *  - Your database schema, your indexes, your migrations.
 *  - Your API shape — routes, pagination, filtering, error responses.
 *  - Whether availability is derived from bookings at read time or kept
 *    somewhere of its own.
 */

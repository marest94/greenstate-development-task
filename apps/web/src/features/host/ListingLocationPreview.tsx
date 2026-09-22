import { ListingWriteSchema } from '@greenstate/contracts';
import { LocationMap } from '../portal/LocationMap';
export function ListingLocationPreview({ latitude, longitude, city, country }: { latitude: string; longitude: string; city: string; country: string }) {
  const lat = latitude.trim() ? ListingWriteSchema.shape.latitude.safeParse(Number(latitude)) : null;
  const lng = longitude.trim() ? ListingWriteSchema.shape.longitude.safeParse(Number(longitude)) : null;
  return <div className="host-location-preview">{lat?.success && lng?.success ? <LocationMap key={`${lat.data}:${lng.data}`} latitude={lat.data} longitude={lng.data} city={city || 'Property location'} country={country} /> : <p className="host-hint">Enter valid latitude and longitude to preview the property location.</p>}</div>;
}

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ListingDto } from '@greenstate/contracts';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { formatMoney } from '../../lib/format';
import { listingIllustrations } from './illustrations';
import 'leaflet/dist/leaflet.css';

type Props = { listings: ListingDto[]; total: number; page: number; slug: string; selectedId: string | null; selectionRevision: number; onSelect: (id: string) => void };
export function SearchMap({ listings, total, page, slug, selectedId, selectionRevision, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const pins = useRef<{ ids: string[]; button: HTMLButtonElement; marker: Marker }[]>([]);
  const [failed, setFailed] = useState(false);
  const [mapVersion, setMapVersion] = useState(0);
  const location = useLocation();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let map: LeafletMap | undefined;
    let resize: ResizeObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const start = async () => {
      try {
        const L = await import('leaflet');
        if (disposed) return;
        map = L.map(element, { scrollWheelZoom: false });
        mapRef.current = map;
        const groups = new Map<string, ListingDto[]>();
        for (const listing of listings) {
          const key = `${listing.latitude},${listing.longitude}`;
          groups.set(key, [...(groups.get(key) ?? []), listing]);
        }
        pins.current = [];
        for (const group of groups.values()) {
          const listing = group[0]!;
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'map-price-pin';
          button.textContent = group.length > 1 ? `${group.length} stays` : formatMoney(listing.pricePerNightCents);
          button.setAttribute('aria-label', group.length > 1 ? `Show ${group.length} stays at this location` : `Show ${listing.title} on map`);
          button.setAttribute('aria-pressed', 'false');
          button.onclick = () => onSelect(listing.id);
          const marker = L.marker([listing.latitude, listing.longitude], {
            keyboard: false, icon: L.divIcon({ className: 'search-map-pin', html: button, iconSize: [90, 36], iconAnchor: [45, 18] }),
          }).addTo(map);
          button.addEventListener('focus', () => { marker.setZIndexOffset(1000); });
          button.addEventListener('blur', () => { marker.setZIndexOffset(button.getAttribute('aria-pressed') === 'true' ? 1000 : 0); });
          pins.current.push({ ids: group.map(item => item.id), button, marker });
        }
        const bounds = L.latLngBounds(listings.map(item => [item.latitude, item.longitude]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', referrerPolicy: 'strict-origin-when-cross-origin',
        });
        timeout = setTimeout(() => { if (!disposed) setFailed(true); }, 12000);
        tiles.on('tileerror', () => { if (!disposed) setFailed(true); });
        tiles.on('tileload', () => clearTimeout(timeout));
        tiles.addTo(map);
        if (typeof ResizeObserver !== 'undefined') {
          resize = new ResizeObserver(() => map?.invalidateSize()); resize.observe(element);
        }
        setMapVersion(value => value + 1);
      } catch { if (!disposed) setFailed(true); }
    };
    void start();
    return () => { disposed = true; resize?.disconnect(); clearTimeout(timeout); map?.remove(); mapRef.current = null; pins.current = []; };
  }, [listings, onSelect]);
  useEffect(() => {
    for (const pin of pins.current) {
      const active = selectedId !== null && pin.ids.includes(selectedId);
      pin.button.classList.toggle('is-active', active);
      pin.button.setAttribute('aria-pressed', String(active));
      pin.marker.setZIndexOffset(active ? 1000 : 0);
    }
    const selected = listings.find(item => item.id === selectedId);
    if (selected) mapRef.current?.panInside([selected.latitude, selected.longitude], { padding: [60, 60], animate: false });
  }, [selectedId, mapVersion, selectionRevision, listings]);
  const selected = listings.find(item => item.id === selectedId);
  const neighbours = selected ? listings.filter(item => item.latitude === selected.latitude && item.longitude === selected.longitude) : [];
  return <aside id="search-results-map" className="search-map-panel" aria-label="Search results map">
    <div className="search-map-heading"><h3>Find your place</h3><span>{listings.length} of {total} stays · Page {page}</span></div>
    <div ref={container} className="search-map" aria-label="Map of the current results page" />
    {failed && <p className="map-error" role="status">Map tiles could not be loaded. You can still explore every stay in the list.</p>}
    <p className="search-map-caption">Pins match this page of results. Change pages to explore more stays.</p>
    {selected ? <div className="map-selection" aria-live="polite">
      <img src={listingIllustrations(selected.id)[0]!.src} alt="Illustrative image, not a property photo" width="90" height="80" />
      <div><p>{selected.city} · {formatMoney(selected.pricePerNightCents)} / night</p><Link to={`/${slug}/listings/${selected.id}`} state={{ returnTo: location.pathname + location.search }}>{selected.title}</Link><span>{selected.maxGuests} guests · {selected.bedrooms} bedrooms</span></div>
    </div> : <p className="map-select-hint">Choose a price pin, or point to a stay to find it on the map.</p>}
    {neighbours.length > 1 && <div className="map-neighbours" aria-label="Stays at this location">{neighbours.map(item => <button type="button" key={item.id} aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)}>{item.title} · {formatMoney(item.pricePerNightCents)}</button>)}</div>}
  </aside>;
}

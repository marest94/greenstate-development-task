import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function LocationMap({ latitude, longitude, city, country }: { latitude: number; longitude: number; city: string; country: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let map: LeafletMap | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let resize: ResizeObserver | undefined;
    const start = async () => {
      try {
        const L = await import('leaflet');
        if (disposed) return;
        map = L.map(element, { scrollWheelZoom: false }).setView([latitude, longitude], 14);
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          // OSM requires a Referer identifying the application for tile requests.
          referrerPolicy: 'strict-origin-when-cross-origin',
        });
        timeout = setTimeout(() => { if (!disposed) setFailed(true); }, 12000);
        tiles.on('tileerror', () => { if (!disposed) setFailed(true); });
        tiles.on('tileload', () => { clearTimeout(timeout); });
        tiles.addTo(map);
        L.marker([latitude, longitude], { title: 'Property location', alt: 'Property location', icon: L.divIcon({ className: 'property-pin', html: '<span aria-hidden="true">⌂</span>', iconSize: [44, 44], iconAnchor: [22, 44] }) }).addTo(map);
        if (typeof ResizeObserver !== 'undefined') {
          resize = new ResizeObserver(() => map?.invalidateSize());
          resize.observe(element);
        }
      } catch { if (!disposed) setFailed(true); }
    };
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); void start(); } }, { rootMargin: '200px' });
      observer.observe(element);
    } else void start();
    return () => { disposed = true; observer?.disconnect(); resize?.disconnect(); clearTimeout(timeout); map?.remove(); };
  }, [latitude, longitude]);
  return <section className="location-section" aria-label="Property location">
    <div className="location-heading"><div><h2>Where you’ll be</h2><p>{city}, {country}</p></div><a href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=14/${latitude}/${longitude}`} target="_blank" rel="noreferrer">Open in OpenStreetMap <span aria-hidden="true">↗</span></a></div>
    <div ref={container} className="property-map" aria-label={`Map of property in ${city}`} />
    {failed && <p className="map-error" role="status">Map tiles could not be loaded. Use the OpenStreetMap link to explore the location.</p>}
    <p className="map-caption">Pin placed at the supplied property coordinates.</p>
  </section>;
}

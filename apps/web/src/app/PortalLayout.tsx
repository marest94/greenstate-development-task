import { Suspense, type CSSProperties } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AuthNavigation } from '../features/auth/AuthNavigation';
import { useTenant } from './TenantProvider';
function readableBrandColor(value: string | null | undefined) {
  const fallback = '#173d32';
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return fallback;
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(offset => {
      const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const foreground = luminance(value); const background = luminance('#f5f4ee');
  return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) >= 4.5 ? value : fallback;
}
export function PortalLayout() {
  const tenant = useTenant();
  const color = readableBrandColor(tenant.primaryColor);
  return <div className="portal-shell" style={{ '--tenant-color': color } as CSSProperties}>
    <a className="skip-link" href="#portal-content">Skip to content</a>
    <header className="portal-header">
      <NavLink className="wordmark" to={`/${tenant.slug}`}><svg className="brand-symbol" viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden="true"><path d="M5 24V13L16 5l11 8v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" stroke="currentColor" strokeWidth="2"/><path d="M12 26v-8h8v8M16 18c-4-1-5-4-4-7 4 1 5 4 4 7Zm0 0c4-1 6-3 6-6-4 0-6 2-6 6Z" stroke="currentColor" strokeWidth="1.6"/></svg>{tenant.name}</NavLink>
      <nav aria-label="Main navigation"><NavLink to={`/${tenant.slug}`} end>Explore stays</NavLink><AuthNavigation /></nav>
    </header>
    <main id="portal-content" tabIndex={-1}><Suspense fallback={<p className="portal-loading" role="status">Loading page…</p>}><Outlet /></Suspense></main>
    <footer className="portal-footer"><span>{tenant.name}</span><span>Prices in EUR · Dates follow {tenant.timezone}</span>{tenant.contactEmail && <a href={`mailto:${tenant.contactEmail}`}>Contact us</a>}</footer>
  </div>;
}

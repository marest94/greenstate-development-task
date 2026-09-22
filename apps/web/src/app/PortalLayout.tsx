import type { CSSProperties } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AuthNavigation } from '../features/auth/AuthNavigation';
import { useTenant } from './TenantProvider';
export function PortalLayout() {
  const tenant = useTenant();
  const color = tenant.primaryColor && /^#[0-9a-f]{6}$/i.test(tenant.primaryColor) ? tenant.primaryColor : '#173d32';
  return <div className="portal-shell" style={{ '--tenant-color': color } as CSSProperties}>
    <a className="skip-link" href="#portal-content">Skip to content</a>
    <header className="portal-header">
      <NavLink className="wordmark" to={`/${tenant.slug}`}>{tenant.name}</NavLink>
      <nav aria-label="Main navigation"><NavLink to={`/${tenant.slug}`} end>Explore stays</NavLink><AuthNavigation /></nav>
    </header>
    <main id="portal-content" tabIndex={-1}><Outlet /></main>
    <footer className="portal-footer"><span>{tenant.name}</span><span>Prices in EUR · Dates follow {tenant.timezone}</span>{tenant.contactEmail && <a href={`mailto:${tenant.contactEmail}`}>Contact us</a>}</footer>
  </div>;
}

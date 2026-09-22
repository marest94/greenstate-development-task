import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { RequirePermission } from '../auth/RequirePermission';
import './host.css';
export function HostLayout() {
  const auth = useAuth();
  return <RequirePermission permission="listings:manage"><section className="host-area">
    <nav className="host-nav" aria-label="Host navigation"><Link to={`${auth.basePath}/host/listings`}>Inventory</Link><Link to={`${auth.basePath}/host/bookings`}>Bookings</Link><Link to={auth.basePath}>Public portal</Link></nav>
    <Outlet />
  </section></RequirePermission>;
}

import { Outlet, NavLink } from 'react-router-dom';
import { RequirePermission } from '../auth/RequirePermission';
import { useAuth } from '../auth/AuthProvider';
import { SessionStatus } from '../auth/AuthForm';
import '../host/host.css';
import './admin.css';
export function AdminLayout() {
 const auth = useAuth();
 return <RequirePermission permission="tenants:manage">{auth.privateKey ? <div key={auth.privateKey.join(':')} className="admin-workspace"><nav className="host-nav" aria-label="Administration"><NavLink to="/admin/tenants">Tenants</NavLink><NavLink to="/admin/tenants/new">Create tenant</NavLink></nav><Outlet /></div> : <SessionStatus />}</RequirePermission>;
}

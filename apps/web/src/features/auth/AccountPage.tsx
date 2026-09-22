import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { SessionStatus, SignOutButton } from './AuthForm';
export function AccountPage() {
  const auth = useAuth(); const location = useLocation();
  if (auth.isLoading || auth.error) return <SessionStatus />;
  if (!auth.principal) return <Navigate to={`${auth.basePath}/login`} replace />;
  if (auth.principal.mustChangePassword) return <Navigate to={`${auth.basePath}/password`} replace />;
  const role = { client: 'Client', host: 'Host', superadmin: 'Platform administrator' }[auth.principal.role];
  return <section className="auth-card" aria-labelledby="account-heading"><p className="eyebrow">{auth.scope.realm === 'platform' ? 'Platform administration' : 'Your portal account'}</p><h1 id="account-heading">Your account</h1>
    {location.state?.passwordChanged === true && <p className="auth-success" role="status">Your password has been changed. Your other signed-in sessions have ended.</p>}
    <dl className="auth-identity"><div><dt>Email</dt><dd>{auth.principal.email}</dd></div><div><dt>Account type</dt><dd>{role}</dd></div></dl>
    <p className="auth-intro">{auth.scope.realm === 'platform' ? 'This account is for platform administration.' : 'This account belongs to this rental portal.'}</p>
    <div className="auth-actions"><Link className="button-primary" to={`${auth.basePath}/password`}>Change password</Link><SignOutButton /></div>
    {auth.scope.realm === 'tenant' && <p className="auth-footer"><Link to={auth.basePath}>Explore stays</Link></p>}
  </section>;
}

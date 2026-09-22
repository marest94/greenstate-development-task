import { Link } from 'react-router-dom';
import { ApiProblem } from '../lib/api';
export function ErrorScreen({ error, onRetry, backTo }: { error: unknown; onRetry?: () => void; backTo?: string }) {
  const missing = error instanceof ApiProblem && error.status === 404;
  return <section className="error-screen" role="alert">
    <h1>{missing ? 'Page unavailable' : 'Something went wrong'}</h1>
    <p>{error instanceof ApiProblem ? error.message : 'The rental service is currently unavailable. Please try again.'}</p>
    {onRetry && !missing && <button type="button" onClick={onRetry}>Try again</button>}
    {backTo && <Link to={backTo}>Back to listings</Link>}
  </section>;
}

import { ApiProblem } from '../lib/api';

export function isTemporaryQueryError(error: unknown): boolean {
  return error instanceof ApiProblem && (
    error.status === 0 || error.status === 429 || error.status >= 500 || error.code === 'INVALID_RESPONSE'
  );
}

export function QueryRefreshWarning({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying: boolean }) {
  if (!error) return null;
  return <div className="host-conflict" role="alert">
    <p>We couldn’t refresh this page. Your current work has been kept.</p>
    <button className="button-secondary" type="button" disabled={retrying} onClick={onRetry}>Try again</button>
  </div>;
}

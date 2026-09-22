import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api';
import { useSavedListings } from './saved-queries';
import './saved.css';
type SavedState = { ids: Set<string>; isPending: boolean; error: Error | null; retry: () => void };
const State = createContext<SavedState | null>(null);
export function SavedListingsState({ listingIds, children }: { listingIds: string[]; children: ReactNode }) {
  const ids = [...new Set(listingIds)].sort();
  const query = useSavedListings({ listingIds: ids.join(','), pageSize: 50 }, ids.length > 0);
  return <State.Provider value={{ ids: new Set(query.data?.items.map(item => item.listingId)), isPending: query.isPending, error: query.error, retry: () => { void query.refetch(); } }}>{children}</State.Provider>;
}
type Props = { listingId: string; title?: string; saved?: boolean };
export function SaveButton(props: Props) {
  const auth = useAuth();
  // Local mutation state belongs to the same owner as its cache and must not cross accounts.
  return <AccountSaveButton key={auth.privateKey?.join(':') ?? 'signed-out'} {...props} />;
}
function AccountSaveButton({ listingId, title = 'unavailable listing', saved: knownSaved }: Props) {
  const auth = useAuth(); const state = useContext(State); const location = useLocation(); const client = useQueryClient();
  const saved = knownSaved ?? state?.ids.has(listingId) ?? false;
  const ownerKey = auth.privateKey;
  const mutation = useMutation({
    mutationKey: [...(ownerKey ?? ['saved-disabled']), 'saved-listings', listingId],
    mutationFn: () => {
      if (!ownerKey || auth.scope.realm !== 'tenant') return Promise.reject(new Error('Sign in to save listings.'));
      const path = `/t/${auth.scope.slug}/me/saved-listings/${listingId}`;
      return saved ? api.delete(path) : api.put(path);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [...(ownerKey ?? ['saved-disabled']), 'saved-listings'] }),
  });
  if (auth.isLoading || auth.isPending) return <span className="save-status" role="status">Loading saved status…</span>;
  if (auth.error) return <button className="save-button" onClick={() => { void auth.refresh(); }}>Retry account</button>;
  if (!auth.principal) return <Link className="save-button" aria-label={`Save ${title}`} to={`${auth.basePath}/login?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`}>♡ Save</Link>;
  if (!ownerKey) return null;
  if (knownSaved === undefined && state?.error) return <button className="save-button" onClick={state.retry}>Retry saved status</button>;
  if (knownSaved === undefined && (!state || state.isPending)) return <span className="save-status" role="status">Loading saved status…</span>;
  return <div className="save-control"><button className={`save-button${saved ? ' is-saved' : ''}`} type="button" aria-label={saved ? `Remove ${title} from saved listings` : `Save ${title}`} aria-pressed={saved} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
    {mutation.isPending ? 'Updating…' : saved ? '♥ Saved · Remove' : '♡ Save'}
  </button>{mutation.isError && <p className="save-error" role="alert">{mutation.error.message}</p>}</div>;
}

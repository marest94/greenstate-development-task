import { useQuery } from '@tanstack/react-query';
import { SavedListingsPageSchema } from '@greenstate/contracts';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/api';
export function useSavedListings(query: { page?: number; pageSize?: number; listingIds?: string }, enabled = true) {
  const auth = useAuth();
  return useQuery({
    queryKey: [...(auth.privateKey ?? ['saved-disabled']), 'saved-listings', query],
    queryFn: ({ signal }) => api.get(`/t/${auth.scope.realm === 'tenant' ? auth.scope.slug : ''}/me/saved-listings`, query, SavedListingsPageSchema, signal),
    enabled: enabled && auth.privateKey !== null && auth.scope.realm === 'tenant',
  });
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { PrincipalSchema, type LoginInput, type PasswordChangeInput, type Principal } from '@greenstate/contracts';
import { api, ApiProblem, subscribeAuthenticationProblems } from '../../lib/api';
export type AuthScope = { realm: 'tenant'; tenantId: string; slug: string } | { realm: 'platform' };
type AuthContext = {
  scope: AuthScope; principal: Principal | null; isLoading: boolean; isPending: boolean; error: Error | null;
  basePath: string; apiPath: string; privateKey: readonly ['private', 'tenant' | 'platform', string | null, string] | null;
  login: (input: LoginInput) => Promise<Principal>; register: (input: LoginInput) => Promise<Principal>;
  changePassword: (input: PasswordChangeInput) => Promise<Principal>; logout: () => Promise<void>; refresh: () => Promise<void>;
};
const Auth = createContext<AuthContext | null>(null);
export function AuthProvider({ scope, children }: { scope: AuthScope; children: ReactNode }) {
  return <ScopedAuthProvider key={scope.realm === 'tenant' ? `tenant:${scope.tenantId}` : 'platform'} scope={scope}>{children}</ScopedAuthProvider>;
}
function ScopedAuthProvider({ scope, children }: { scope: AuthScope; children: ReactNode }) {
  const client = useQueryClient(); const tenantId = scope.realm === 'tenant' ? scope.tenantId : null;
  const basePath = scope.realm === 'tenant' ? `/${scope.slug}` : '/admin';
  const apiPath = scope.realm === 'tenant' ? `/t/${scope.slug}/auth` : '/admin/auth';
  const [principal, setPrincipal] = useState<Principal | null>(null); const [isLoading, setLoading] = useState(true);
  const [isPending, setPending] = useState(false); const [error, setError] = useState<Error | null>(null);
  const alive = useRef(false); const generation = useRef(0); const busy = useRef(false); const lookup = useRef<AbortController | null>(null);
  const clearPrivate = useCallback(() => {
    const matches = (key: QueryKey | undefined) => key?.[0] === 'private' && key[1] === scope.realm && key[2] === tenantId;
    const filter = { predicate: (query: { queryKey: QueryKey }) => matches(query.queryKey) };
    // Cancellation invalidates in-flight results even if their fetcher ignores AbortSignal.
    void client.cancelQueries(filter); client.removeQueries(filter);
    for (const mutation of client.getMutationCache().getAll()) if (matches(mutation.options.mutationKey)) client.getMutationCache().remove(mutation);
  }, [client, scope.realm, tenantId]);
  const replace = useCallback((next: Principal | null) => {
    generation.current++; clearPrivate(); setPrincipal(next); setLoading(false); setError(null);
  }, [clearPrivate]);
  const validateScope = useCallback((next: Principal) => {
    if (next.realm !== scope.realm || next.tenantId !== tenantId) throw new ApiProblem({ status: 200, code: 'INVALID_RESPONSE', message: 'The account response does not match this portal.', requestId: '' });
    return next;
  }, [scope.realm, tenantId]);
  const refresh = useCallback(async () => {
    lookup.current?.abort(); const controller = new AbortController(); lookup.current = controller;
    const version = generation.current;
    try {
      const next = validateScope(await api.get(`${apiPath}/me`, undefined, PrincipalSchema, controller.signal));
      if (alive.current && version === generation.current && !controller.signal.aborted) replace(next);
    } catch (problem) {
      if (!alive.current || version !== generation.current || controller.signal.aborted) return;
      if (problem instanceof ApiProblem && problem.status === 401) replace(null);
      else { setLoading(false); setError(problem instanceof Error ? problem : new Error('The account could not be loaded.')); }
    }
  }, [apiPath, replace, validateScope]);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = subscribeAuthenticationProblems(path => {
      const prefix = apiPath.slice(0, -'/auth'.length);
      if (!path.startsWith(`${prefix}/`) || path.startsWith(`${apiPath}/login`) || path.startsWith(`${apiPath}/register`)) return;
      const version = generation.current;
      return problem => {
        if (!alive.current || version !== generation.current) return;
        if (problem.status === 401) replace(null); else { clearPrivate(); void refresh(); }
      };
    });
    void refresh();
    return () => { alive.current = false; generation.current++; lookup.current?.abort(); unsubscribe(); clearPrivate(); };
  }, [apiPath, clearPrivate, refresh, replace]);
  const mutate = useCallback(async (action: 'login' | 'register' | 'password', input: LoginInput | PasswordChangeInput) => {
    if (busy.current) throw new ApiProblem({ status: 409, code: 'REQUEST_PENDING', message: 'Please wait for the current request to finish.', requestId: '' });
    lookup.current?.abort();
    busy.current = true; setPending(true); const version = generation.current;
    try {
      const next = validateScope(await api.post(`${apiPath}/${action}`, input, PrincipalSchema));
      if (!alive.current || version !== generation.current) throw new DOMException('The account changed.', 'AbortError');
      replace(next); return next;
    } finally { busy.current = false; if (alive.current) { setPending(false); setLoading(false); } }
  }, [apiPath, replace, validateScope]);
  const logout = useCallback(async () => {
    if (busy.current) return;
    lookup.current?.abort();
    busy.current = true; setPending(true); const version = generation.current;
    try { await api.post(`${apiPath}/logout`, {}); if (alive.current && version === generation.current) replace(null); }
    catch (problem) { if (!(problem instanceof ApiProblem && problem.status === 401)) throw problem; }
    finally { busy.current = false; if (alive.current) { setPending(false); setLoading(false); } }
  }, [apiPath, replace]);
  const value: AuthContext = { scope, principal, isLoading, isPending, error, basePath, apiPath,
    privateKey: principal && !principal.mustChangePassword ? ['private', scope.realm, tenantId, principal.id] : null,
    login: input => mutate('login', input), register: input => mutate('register', input), changePassword: input => mutate('password', input), logout, refresh };
  return <Auth.Provider value={value}>{children}</Auth.Provider>;
}
export function useAuth(): AuthContext { const auth = useContext(Auth); if (!auth) throw new Error('Account context is unavailable.'); return auth; }

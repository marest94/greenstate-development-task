import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { AdminTenantSchema, type AdminTenant } from '@greenstate/contracts';
import { api, ApiProblem } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { ErrorScreen } from '../../app/ErrorScreen';
import { useFormProblem } from '../auth/AuthForm';
export const tenantsApi = '/admin/tenants';
export function useAdminRequest() {
 const pending = useRef<AbortController | null>(null); const [busy, setBusy] = useState(false); const feedback = useFormProblem();
 useEffect(() => () => pending.current?.abort(), []);
 async function run(action: (signal: AbortSignal) => Promise<unknown>) {
  if (pending.current) return;
  const controller = new AbortController(); pending.current = controller; setBusy(true); feedback.clear();
  try { await action(controller.signal); } catch (error) { if (!controller.signal.aborted) feedback.report(error); }
  finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
 }
 return { busy, feedback, run };
}
export function useAdminInvalidation() {
 const auth = useAuth(); const cache = useQueryClient();
 return () => { if (auth.privateKey) void cache.invalidateQueries({ queryKey: auth.privateKey }); void cache.invalidateQueries({ queryKey: ['tenant'] }); };
}
export function TenantResource({ children }: { children: (tenant: AdminTenant) => ReactNode }) {
 const auth = useAuth(); const { tenantId } = useParams(); const valid = AdminTenantSchema.shape.id.safeParse(tenantId).success;
 const query = useQuery({ queryKey: [...(auth.privateKey ?? []), 'admin-tenant', tenantId], enabled: !!auth.privateKey && valid, queryFn: ({ signal }) => api.get(`${tenantsApi}/${tenantId}`, undefined, AdminTenantSchema, signal) });
 if (!valid) return <ErrorScreen error={new ApiProblem({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'This tenant could not be found.', requestId: '' })} />;
 if (query.isPending) return <p role="status">Loading tenant…</p>;
 if (query.isError) return <ErrorScreen error={query.error} onRetry={() => { void query.refetch(); }} />;
 return <>{children(query.data)}</>;
}
export function AdminField({ label, name, problem, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; problem?: ApiProblem | null; hint?: string }) {
 const errors = problem?.fields?.[name]; const id = `admin-${name}`;
 return <div className="host-field"><label htmlFor={id}>{label}</label><input id={id} name={name} {...props} aria-invalid={!!errors?.length || undefined} aria-describedby={[hint ? `${id}-hint` : '', errors?.length ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} />{hint && <p className="host-hint" id={`${id}-hint`}>{hint}</p>}{errors?.length ? <p className="auth-field-error" id={`${id}-error`}>{errors.join(' ')}</p> : null}</div>;
}
export const identityMessage = 'I verified this person’s identity outside the app and will deliver the temporary password securely.';
export function IdentityConfirmation() { return <label className="admin-check"><input type="checkbox" name="identityConfirmed" />{identityMessage}</label>; }
export function checkIdentity(form: FormData) {
 if (!form.has('identityConfirmed')) throw new ApiProblem({ status: 400, code: 'IDENTITY_CONFIRMATION_REQUIRED', message: 'Confirm identity verification and secure temporary-password delivery before continuing.', requestId: '' });
}

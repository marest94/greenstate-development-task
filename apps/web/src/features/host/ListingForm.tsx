import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HostListingViewSchema, ListingWriteSchema, type HostListingView } from '@greenstate/contracts';
import { api, ApiProblem } from '../../lib/api';
import { parsePriceCents, priceInput } from '../../lib/format';
import { useAuth } from '../auth/AuthProvider';
import { FormFeedback, SessionStatus, useFormProblem, validationProblem } from '../auth/AuthForm';
import { RequirePermission } from '../auth/RequirePermission';
import { ErrorScreen } from '../../app/ErrorScreen';
export function ListingForm({ mode }: { mode: 'create' | 'edit' }) {
  const auth = useAuth(); const { id } = useParams();
  return <RequirePermission permission="listings:manage">{auth.privateKey ? <OwnedListingForm key={`${auth.privateKey.join(':')}:${mode}:${id ?? ''}`} mode={mode} id={id} /> : <SessionStatus />}</RequirePermission>;
}
function OwnedListingForm({ mode, id }: { mode: 'create' | 'edit'; id: string | undefined }) {
  const auth = useAuth(); const valid = mode === 'create' || HostListingViewSchema.shape.id.safeParse(id).success;
  const apiPath = `${auth.apiPath.slice(0, -'/auth'.length)}/host/listings`;
  const query = useQuery({ queryKey: [...auth.privateKey!, 'host-listing', id], enabled: mode === 'edit' && valid,
    queryFn: ({ signal }) => api.get(`${apiPath}/${id}`, undefined, HostListingViewSchema, signal) });
  if (!valid) return <ErrorScreen error={new ApiProblem({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'This listing could not be found.', requestId: '' })} backTo={`${auth.basePath}/host/listings`} />;
  if (mode === 'edit' && query.isPending) return <p role="status">Loading listing…</p>;
  if (mode === 'edit' && query.isError) return <ErrorScreen error={query.error} onRetry={() => { void query.refetch(); }} backTo={`${auth.basePath}/host/listings`} />;
  return <Editor initial={mode === 'edit' ? query.data! : null} apiPath={apiPath} />;
}
function Editor({ initial, apiPath }: { initial: HostListingView | null; apiPath: string }) {
  const auth = useAuth(); const cache = useQueryClient(); const navigate = useNavigate(); const feedback = useFormProblem();
  const [server, setServer] = useState(initial); const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false); const [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  const begin = () => { if (pending.current) return null; const controller = new AbortController(); pending.current = controller; setBusy(true); feedback.clear(); setMessage(''); return controller; };
  const settle = (controller: AbortController) => { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } };
  function accept(next: HostListingView) {
    setServer(next); cache.setQueryData([...auth.privateKey!, 'host-listing', next.id], next);
    void cache.invalidateQueries({ queryKey: auth.privateKey! });
    void cache.invalidateQueries({ predicate: query => ['listing', 'listings', 'listing-facets', 'availability'].includes(String(query.queryKey[0])) && query.queryKey[1] === (auth.scope.realm === 'tenant' ? auth.scope.slug : '') });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    const form = new FormData(event.currentTarget); const value = (key: string) => String(form.get(key) ?? '');
    const numeric = (key: string) => value(key).trim() ? Number(value(key)) : NaN;
    let cents: number | undefined;
    try { cents = parsePriceCents(value('pricePerNightCents')); }
    catch (error) { feedback.report(new ApiProblem({ status: 400, code: 'VALIDATION_FAILED', message: (error as Error).message, fields: { pricePerNightCents: [(error as Error).message] }, requestId: '' })); return; }
    const parsed = ListingWriteSchema.safeParse({ title: value('title'), description: value('description').trim() || null, city: value('city'), country: value('country'), latitude: numeric('latitude'), longitude: numeric('longitude'), propertyType: value('propertyType'), maxGuests: numeric('maxGuests'), bedrooms: numeric('bedrooms'), pricePerNightCents: cents });
    if (!parsed.success) { feedback.report(validationProblem(parsed.error.issues)); return; }
    const controller = begin(); if (!controller) return;
    try {
      const next = server ? await api.patch(`${apiPath}/${server.id}`, { ...parsed.data, version: server.version }, HostListingViewSchema, controller.signal) : await api.post(apiPath, parsed.data, HostListingViewSchema, controller.signal);
      if (controller.signal.aborted) return;
      accept(next); setRevision(value => value + 1); setMessage(server ? 'Listing changes saved.' : 'Listing created.');
      if (!server) navigate(`${auth.basePath}/host/listings/${next.id}`, { replace: true });
    } catch (error) { if (!controller.signal.aborted) feedback.report(error); }
    finally { settle(controller); }
  }
  async function changeArchive(archived: boolean) {
    if (!server) return; const controller = begin(); if (!controller) return;
    try {
      const next = await api.post(`${apiPath}/${server.id}/${archived ? 'archive' : 'restore'}`, { version: server.version }, HostListingViewSchema, controller.signal);
      if (controller.signal.aborted) return;
      accept(next); setConfirmArchive(false); setMessage(archived ? 'Listing archived. Existing bookings remain unchanged.' : 'Listing restored and visible on the public portal.');
    } catch (error) { if (!controller.signal.aborted) feedback.report(error); }
    finally { settle(controller); }
  }
  async function reload() {
    if (!server) return; const controller = begin(); if (!controller) return;
    try {
      const next = await api.get(`${apiPath}/${server.id}`, undefined, HostListingViewSchema, controller.signal);
      if (controller.signal.aborted) return;
      accept(next); setRevision(value => value + 1); setConfirmArchive(false); setMessage('Current listing loaded. Review its fields before saving.');
    } catch (error) { if (!controller.signal.aborted) feedback.report(error); }
    finally { settle(controller); }
  }
  const fieldErrors = (name: string) => feedback.problem?.fields?.[name];
  const inputProps = (name: string) => ({ id: `listing-${name}`, name, 'aria-invalid': fieldErrors(name)?.length ? true as const : undefined, 'aria-describedby': fieldErrors(name)?.length ? `listing-${name}-error` : undefined });
  const errors = (name: string) => fieldErrors(name)?.length ? <p className="auth-field-error" id={`listing-${name}-error`}>{fieldErrors(name)!.join(' ')}</p> : null;
  return <section className="host-editor" aria-labelledby="listing-form-heading">
    <Link className="back-link" to={`${auth.basePath}/host/listings${server?.archivedAt ? '?status=archived' : ''}`}>Back to inventory</Link>
    <div className="host-heading"><div><p className="eyebrow">Host workspace</p><h1 id="listing-form-heading">{server ? 'Edit listing' : 'Create listing'}</h1><p>{server?.archivedAt ? 'Archived listings stay available here for editing and booking history.' : 'Listing details appear on your tenant’s public portal.'}</p></div>{server && <span className="host-badge">{server.archivedAt ? 'Archived' : 'Active'}</span>}</div>
    {server && <nav className="host-calendar-links" aria-label="Listing navigation"><Link to={`${auth.basePath}/host/listings/${server.id}/calendar`}>Calendar</Link><Link to={`${auth.basePath}/host/bookings?listingId=${server.id}`}>Booking history</Link></nav>}
    {server && !server.archivedAt && <p><Link to={`${auth.basePath}/listings/${server.id}`}>View public listing</Link></p>}
    <FormFeedback problem={feedback.problem} />
    {feedback.problem?.code === 'STALE_VERSION' && <div className="host-conflict"><p>Your input has been kept. Reloading replaces it with the current saved fields.</p><button className="button-secondary" disabled={busy} onClick={() => { void reload(); }}>Reload current version</button></div>}
    {message && <p className="host-success" role="status">{message}</p>}
    <form key={revision} className="host-form" noValidate onSubmit={event => { void submit(event); }}>
      <fieldset disabled={busy}><legend className="host-sr-only">Listing details</legend><div className="host-form-grid">
        <div className="host-field host-field-wide"><label htmlFor="listing-title">Title</label><input {...inputProps('title')} defaultValue={server?.title ?? ''} maxLength={200} required />{errors('title')}</div>
        <div className="host-field host-field-wide"><label htmlFor="listing-description">Description</label><textarea {...inputProps('description')} defaultValue={server?.description ?? ''} rows={4} maxLength={5000} />{errors('description')}</div>
        <div className="host-field"><label htmlFor="listing-city">City</label><input {...inputProps('city')} defaultValue={server?.city ?? ''} maxLength={80} required />{errors('city')}</div>
        <div className="host-field"><label htmlFor="listing-country">Country code</label><input {...inputProps('country')} defaultValue={server?.country ?? ''} maxLength={2} placeholder="DE" required /><p className="host-hint">Two uppercase letters, such as DE or PT.</p>{errors('country')}</div>
        <div className="host-field"><label htmlFor="listing-latitude">Latitude</label><input {...inputProps('latitude')} type="number" step="any" min={-90} max={90} defaultValue={server?.latitude ?? ''} required />{errors('latitude')}</div>
        <div className="host-field"><label htmlFor="listing-longitude">Longitude</label><input {...inputProps('longitude')} type="number" step="any" min={-180} max={180} defaultValue={server?.longitude ?? ''} required />{errors('longitude')}</div>
        <div className="host-field"><label htmlFor="listing-propertyType">Property type</label><select {...inputProps('propertyType')} defaultValue={server?.propertyType ?? 'apartment'}>{['apartment', 'studio', 'house', 'loft', 'room'].map(type => <option key={type} value={type}>{type[0]!.toUpperCase() + type.slice(1)}</option>)}</select>{errors('propertyType')}</div>
        <div className="host-field"><label htmlFor="listing-maxGuests">Maximum guests</label><input {...inputProps('maxGuests')} type="number" min={1} max={12} step={1} defaultValue={server?.maxGuests ?? 1} required />{errors('maxGuests')}</div>
        <div className="host-field"><label htmlFor="listing-bedrooms">Bedrooms</label><input {...inputProps('bedrooms')} type="number" min={0} max={20} step={1} defaultValue={server?.bedrooms ?? 0} required />{errors('bedrooms')}</div>
        <div className="host-field"><label htmlFor="listing-pricePerNightCents">Price per night (€)</label><input {...inputProps('pricePerNightCents')} inputMode="decimal" defaultValue={priceInput(server?.pricePerNightCents)} required maxLength={16} /><p className="host-hint">EUR, with up to two decimal places.</p>{errors('pricePerNightCents')}</div>
      </div><div className="host-actions"><button className="button-primary" type="submit">{server ? 'Save changes' : 'Create listing'}</button></div></fieldset>
    </form>
    {server && <section className="host-archive" aria-labelledby="archive-heading"><h2 id="archive-heading">{server.archivedAt ? 'Restore listing' : 'Archive listing'}</h2>
      <p>{server.archivedAt ? 'Restoring makes this listing available on the public portal again.' : 'Archiving hides this listing from the public portal. You can restore it later.'}</p>
      {confirmArchive ? <div className="host-confirm" role="group" aria-label="Confirm listing archive"><p>Existing active and future bookings remain unchanged and accessible to hosts. Saved listings remain in each account’s shortlist as unavailable.</p><div className="host-actions"><button className="button-secondary" disabled={busy} onClick={() => { void changeArchive(true); }}>Confirm archive</button><button className="button-secondary" disabled={busy} onClick={() => setConfirmArchive(false)}>Keep active</button></div></div>
        : <button className="button-secondary" disabled={busy} onClick={() => server.archivedAt ? void changeArchive(false) : setConfirmArchive(true)}>{server.archivedAt ? 'Restore listing' : 'Archive listing'}</button>}
    </section>}
  </section>;
}

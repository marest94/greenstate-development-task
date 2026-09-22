import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { TenantProvider, useTenant } from './TenantProvider';
function Probe() { return <h1>{useTenant().name}</h1>; }
const tenant = (slug: string) => ({ id: slug === 'greenstate' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222', slug, name: `Portal ${slug}`, timezone: 'Europe/Berlin', primaryColor: '#173d32', contactEmail: null, currency: 'EUR' });
function mount(slug: string) {
  const router = createMemoryRouter([{ path: '/:slug', element: <TenantProvider><Probe /></TenantProvider> }], { initialEntries: [`/${slug}`] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
it('loads the tenant selected by the route and scopes cached data across navigation', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(tenant(url.split('/').at(-1)!)))));
  const router = mount('greenstate');
  expect(await screen.findByRole('heading', { name: 'Portal greenstate' })).toBeVisible();
  await router.navigate('/citystays');
  expect(await screen.findByRole('heading', { name: 'Portal citystays' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Portal greenstate' })).not.toBeInTheDocument();
});
it('shows a loading state and never renders a portal for an unknown tenant', async () => {
  let resolve!: (response: Response) => void;
  const pending = { promise: new Promise<Response>(done => { resolve = done; }) };
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
  mount('missing');
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  resolve(new Response(JSON.stringify({ status: 404, code: 'TENANT_NOT_FOUND', message: 'This rental portal was not found.', requestId: 'r' }), { status: 404 }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This rental portal was not found.'));
  expect(screen.queryByRole('heading', { name: /Portal/ })).not.toBeInTheDocument();
});

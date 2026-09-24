# Key flows

These traces describe current behavior, not a complete endpoint reference. Paths beginning `/:slug` are browser routes; API routes begin `/api/v1`. See [web routing](../apps/web/src/app/router.tsx) and [API modules](../apps/api/src/app.module.ts) for the full route surface.

## Public search and listing availability

1. A visitor opens `/:slug`. [TenantProvider](../apps/web/src/app/TenantProvider.tsx) resolves the portal; its name and configured primary color appear with readable text, and the browser title follows the route. [SearchPage](../apps/web/src/features/portal/SearchPage.tsx) keeps filters in the URL.
2. The browser requests tenant-scoped listing facets and a page of listings through [api.ts](../apps/web/src/lib/api.ts). [ListingsController](../apps/api/src/listings/listings.controller.ts) validates the filters; the service/repository query active listings in that tenant. City, guests, price, and paired dates are supported; the date range must be free for every night.
3. Opening `/:slug/listings/:id` loads public detail and availability. Archived and foreign listing IDs return the same public 404. Availability combines noncancelled booking spans with manual blocks. A checkout date is free for a new check-in if nothing else occupies it.

Relevant checks: [public listing integration tests](../apps/api/test/public-listings.test.ts), [availability unit tests](../apps/api/src/availability/availability.test.ts), and [portal browser journey](../e2e/portal.spec.ts).

## Registration, sign-in, and saved listings

Registration creates a client in the current tenant. Sign-in checks that tenant's credentials, writes a hashed-token session, and sets an HttpOnly cookie. Host accounts are provisioned by a platform administrator. The browser's [account boundary](../apps/web/src/app/AccountBoundary.tsx) and query state clear or cancel private data when identity changes; the API still checks the session, permission, tenant, and saved-list owner on every protected request.

After sign-in, [destination selection](../apps/web/src/features/auth/auth-destination.ts) sends clients to the tenant root, hosts to `/:slug/host/listings`, and platform administrators to `/admin/tenants`. A safe `returnTo` path within the same realm takes precedence and survives a required password change.

From a card or detail page, a signed-in client or host saves a listing with `PUT /api/v1/t/:slug/me/saved-listings/:listingId`. The save is idempotent and private to that account. `GET /me/saved-listings` returns bounded pages; `DELETE` removes an entry. An archived saved listing remains as an unavailable entry without public details and can be removed; restoring the listing makes the retained save available again.

Relevant checks: [saved-list integration tests](../apps/api/test/saved-listings.test.ts), [storage/isolation tests](../apps/api/test/saved-storage.test.ts), and [browser journey](../e2e/saved-listings.spec.ts).

## Host inventory, calendar, and bookings

Hosts use `/:slug/host/listings` to create, edit, archive, and restore tenant inventory. [HostListingsController](../apps/api/src/listings/host-listings.controller.ts) requires host permissions; input goes through shared schemas. Update and archive/restore requests include the current listing version. A stale version returns a conflict so one host does not silently overwrite another. Archiving removes public visibility without deleting the listing or bookings.

After a listing is created, the browser returns to host inventory and shows a success link to edit the new listing.

The host portfolio at `/:slug/host/calendar` reads a paged, consistent snapshot of properties, bookings, and blocks. A host can preview and submit a block range; the UI's selected last night is inclusive, while the HTTP `to` date is exclusive. The server rechecks live tenant, listing, business date, and occupancy rules while holding locks. If any night conflicts with a booking, the range write is rejected as a whole. Removing blocks deletes only manual blocks. The listing calendar and `/:slug/host/bookings` retain read-only access to imported booking history; hosts cannot create or edit bookings.

Relevant checks: [host listing tests](../apps/api/test/host-listings.test.ts), [calendar tests](../apps/api/test/host-calendar.test.ts), [portfolio snapshot tests](../apps/api/test/portfolio-calendar.test.ts), and [browser journeys](../e2e/portfolio-calendar.spec.ts).

## Platform administration and tenant lifecycle

Platform administrators sign in at `/admin/login`, then use `/admin/tenants` to create/configure tenants and manage accounts. [Admin controllers](../apps/api/src/admin/) use the privileged database path and platform permissions. Admins can provision hosts, disable/re-enable them, reset passwords, and explicitly promote clients. Resets and promotions revoke old sessions and require a first-login password change; temporary passwords are delivered outside the app.

Creating a tenant reserves its slug and makes an empty portal. Deletion is soft: the portal becomes unavailable, sessions are revoked, future writes are rejected, and existing rows are retained. Tenant lifecycle changes take an exclusive lock against ordinary writes. The seed process does not repopulate a deleted tenant or reset edited accounts/listings.

Relevant checks: [admin integration tests](../apps/api/test/admin.test.ts), [lifecycle ordering tests](../apps/api/test/admin-deletion-order.test.ts), [tenant locking tests](../apps/api/test/tenant-locking.test.ts), and [admin browser journey](../e2e/admin.spec.ts).

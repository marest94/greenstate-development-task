# Challenge requirements map

This map follows the numbered items in the supplied [Full Stack Challenge](../task-material/Full%20Stack%20Challenge.pdf). It points to a working route or implementation and a representative test; it is a navigation aid, not a substitute for running the tests. See [review notes](review-notes.md) for dated verification.

| Brief item | Implementation and review entry | Representative evidence |
| --- | --- | --- |
| 1. List listings | Public `/:slug` search page, scoped to active listings in that tenant | [Public listing tests](../apps/api/test/public-listings.test.ts) |
| 2. Open one listing | `/:slug/listings/:id`; foreign/archived IDs are not exposed | [Portal browser journey](../e2e/portal.spec.ts) |
| 3. Filter by city, guests, price, and free date range | URL-backed search filters and tenant-scoped availability query | [Public listing tests](../apps/api/test/public-listings.test.ts) |
| 4. Show when a listing is available | Listing detail calendar/API availability endpoint | [Availability tests](../apps/api/src/availability/availability.test.ts) |
| 5. Client registration and sign-in | Tenant auth routes; public registration creates clients only | [Auth tests](../apps/api/test/auth.test.ts), [browser journey](../e2e/auth.spec.ts) |
| 6. Client, host, and superadmin access | Tenant client/host roles, separate platform admin realm, server-side permissions | [Permission tests](../apps/api/src/identity/permissions.test.ts), [tenant isolation tests](../apps/api/test/tenant-isolation.test.ts) |
| 7. Host edits listings | `/:slug/host/listings`, versioned create/edit/archive/restore | [Host listing tests](../apps/api/test/host-listings.test.ts) |
| 8. Host blocks individual days | Listing calendar supports single-day blocks; portfolio calendar also supports ranges | [Host calendar tests](../apps/api/test/host-calendar.test.ts), [browser journey](../e2e/calendar.spec.ts) |
| 9. Host views bookings | Read-only `/:slug/host/bookings` and listing calendar history | [Booking tests](../apps/api/test/bookings.test.ts) |
| 10. Admin creates, edits, deletes tenants | `/admin/tenants`; delete retains data and reserves slug | [Admin tests](../apps/api/test/admin.test.ts), [deletion tests](../apps/api/test/admin-deletion-order.test.ts) |
| 11. Tenant configuration | Required name/slug plus timezone, primary color, contact email; the portal uses the configured color with readable text | [Tenant contract](../packages/contracts/src/tenant.ts), [brand colors](../apps/web/src/app/brand-colors.ts), [admin browser journey](../e2e/admin.spec.ts) |
| 12. Admin adds multiple hosts | Tenant account management and host provisioning | [Admin tests](../apps/api/test/admin.test.ts) |

## Cross-cutting brief requirements and decisions

- **Stack:** NestJS API, React UI, PostgreSQL, and Docker Compose; see [architecture](architecture.md).
- **Portal isolation:** Each tenant has `/:slug`; restricted database access, row-level security, scoped sessions, and composite references reinforce the boundary. See [data model](data-model.md) and [tenant isolation tests](../apps/api/test/tenant-isolation.test.ts).
- **Accounts across portals:** One email can identify separate tenant accounts with separate passwords, sessions, and saved listings. See [auth browser tests](../e2e/auth.spec.ts).
- **Supplied data:** The original 1,000 listings and 12,757 bookings are retained under [`data/`](../data/) and imported into two local demo tenants. The import is repeat-safe; see [README import notes](../README.md#run-locally) and [seed tests](../apps/api/test/seed.test.ts).
- **Tests:** Unit/component, PostgreSQL integration, composed-stack, and browser tests are present; [CI](../.github/workflows/ci.yml) defines the automated gates.
- **Not required by the brief:** Booking/payment writes and deployment are outside this submission. Maps were optional but a public location/search map was added. See [deliberate limits](../README.md#deliberate-limits).

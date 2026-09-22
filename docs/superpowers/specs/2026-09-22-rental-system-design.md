# Accommodation Rental System — fresh project design

Status: original design and grill-review revisions approved by the user on 2026-09-22.
Hybrid execution has been selected. No application code has been created or verified.

## Purpose and sources

Build the complete accommodation rental application in the original GreenState challenge,
with stronger engineering and security that remain practical to implement and explain in an
interview. Deliver a usable application, meaningful tests, and a reproducible local setup.

The original PDF and `contracts.ts` in `task-material/`, together with the CSV inputs in
`data/`, define the supplied requirements and data semantics. These are byte-for-byte copies
of the original challenge material; their SHA-256 checksums are recorded in README.
The previous project's specification and implementation are references only. Their decisions,
claims of verification, task system, and agent rules do not govern this project. Reused code
must be reviewed and tested in its new context.

The architecture, tenant-local identity model, listing creation and archiving, tenant soft
deletion, and original defaults remain approved. The approved grill-review revisions below
clarify account lifecycle, private saved listings, dates, and implementation safeguards.

## Product scope

### Public portal

- One portal per tenant at `/{slug}`, showing only that tenant's listings and configuration.
- Paginated listings filtered by city, guest capacity, price range, and date range. A date
  filter returns only listings free for the entire stay. Filters and pagination live in the
  URL so refresh and browser navigation preserve them. Clearing either date removes both
  active date parameters from the URL and API request and resets pagination. Incomplete new
  date selections remain draft state; requests never contain a half-complete date range.
- A listing detail page with the supplied listing facts and a navigable availability calendar.
- Client registration and sign-in. Public browsing does not require an account.

### Private saved listings

- Clients and hosts each have one private shortlist per tenant account. Sign-in is required
  to save or remove a listing; saving is limited to active listings. No folders or sharing.
- A shortlist belongs to its account alone, including within the same tenant. Shared host
  inventory permissions never grant access to another account's saved listings.
- Archived saved entries remain visible as unavailable, with a remove action and no listing
  detail link. Restoring the listing makes the saved entry available again.

### Host panel

- Tenant hosts can create and edit listings, archive them, and restore archived listings.
- All hosts of a tenant manage its shared inventory; there is no per-host ownership system.
- Hosts can add and remove individual blocked days and view existing bookings.
- Bookings remain read-only; no booking creation or payment flow exists.
- Archived listings disappear from public search and detail routes. Hosts retain access to
  their records and booking history through an Archived filter or tab that supports finding
  and restoring listings after reload. Booking links use host listing routes.
- Archiving is allowed with active or future bookings. Show a warning that existing bookings
  remain unchanged and host access to their records is preserved.

### Administration

- A separate superadmin area supports tenant creation, configuration, editing, and soft deletion.
- Superadmins can add multiple host accounts to each tenant.
- Superadmins can disable and re-enable host accounts, assist password resets for clients and
  hosts, and explicitly promote an existing client to host while retaining account data.
- A newly created tenant can sign in its first host, create a listing, and display it on its
  own portal without code or database edits.
- Tenant configuration: name, slug, IANA time zone, optional primary colour and contact email.
  Slugs are immutable after creation; other configuration remains editable. Currency stays
  EUR. Logo uploads and arbitrary theme customization are excluded.

### Explicit exclusions

No booking creation, payments, maps, deployment, SSO, two-factor authentication, email delivery
or verification flows, public password reset, file uploads, background job infrastructure, or
general audit-log UI.
These exclusions do not remove any feature required by the original brief.

## Architecture

A modular monolith in one npm-workspaces repository:

```text
apps/api/             NestJS API
apps/web/             React application
packages/contracts/  Shared API schemas and types
data/                 Original CSV inputs
task-material/        Unmodified challenge material
docs/                 Design and implementation plan
```

One PostgreSQL database, managed with Prisma and SQL migrations. PostgreSQL policies and
constraints that Prisma cannot express remain explicit SQL. Dependencies are selected and
their compatibility checked during implementation; old version pins are not inherited blindly.

API modules cover identity, tenants, listings, saved listings, availability, bookings, and
administration. Controllers handle HTTP, services implement use cases, and repositories own
queries. Pure date and availability functions have no framework or database dependency. Introduce interfaces
only where a concrete boundary or testing need justifies them.

Product outcomes and security invariants in this design are requirements. File layouts,
filenames, and helper examples are illustrative and may change with implementation evidence.

The React application contains portal, host, and admin areas. Use React Router for navigation
and TanStack Query for server state. Keep form and calendar state local. Do not introduce a
global state framework unless an actual requirement warrants it.

## Identity and authorization

- Accounts belong to one tenant; the same email may identify separate accounts on different
  portals. Platform superadmins have separate accounts and sessions.
- Self-registration creates clients only. Hosts are created or explicitly promoted from clients
  by a superadmin. Hosts retain basic client features, including their private saved listings.
- Hash passwords with Argon2id. Use opaque, cryptographically random session tokens; store
  only their hashes in PostgreSQL. Cookies are HttpOnly, SameSite, and Secure under HTTPS.
- A tenant session is valid only for its tenant. Realm-aware cookies allow tenant and
  platform sessions to coexist without treating cookie paths as an authorization boundary.
- Session lifetime: a fixed seven-day expiration. Logout and password changes revoke
  affected sessions. Every lookup checks expiration and current account/tenant state.
- Credential checks and session issuance are serialized with password changes and recovery in
  both realms, and with tenant-account reset, promotion, and disabling. A stale credential
  validation cannot issue a session after the corresponding change commits.
- Host provisioning: the superadmin supplies a temporary password, the host must
  change it on first sign-in, and the API restricts that session until the change succeeds.
- Host disabling affects the entire tenant account, revokes its sessions, and retains its
  records and saved listings. Re-enabling permits a new login; old sessions never revive.
  Subsequent requests fail after disabling commits, but an already-authorized in-flight
  operation may finish. Tenant deletion retains its stronger write coordination below.
- Assisted password reset for clients and hosts uses identity verification and temporary
  password delivery outside the application. A superadmin sets a temporary password, revokes
  existing sessions, and requires a change at next sign-in. Reset never re-enables a disabled
  account, and restricted temporary-password sessions cannot use ordinary account features.
- Creating a host with an existing tenant-account email returns a conflict; it never changes
  that account's role automatically. Explicit client-to-host promotion preserves the account
  and saved data, requires a fresh temporary password and forced change, and revokes old
  sessions. Never retain the client's credential during promotion because signup email is
  unverified. The superadmin verifies identity and delivers the new credential outside the app.
- Recover an existing platform superadmin through a local CLI requiring database-administrator
  access. Use secret-safe input with no passwords in arguments or logs and revoke platform
  sessions. There is no public recovery endpoint.
- Separate authentication from permission checks. Backend permissions control host and admin
  actions; hiding a button is only a UI convenience.
- Apply input validation, bounded request bodies, throttling for login and expensive
  registration/password operations, generic authentication errors, CSRF protection for
  state-changing requests, and security headers.
- Serve web and API from the same origin. Validate the expected origin and a custom request
  header on state-changing browser requests. Do not enable permissive credentialed CORS.
- Never expose password hashes, session tokens, or internal database errors in responses or logs.

## Tenant isolation and database access

Resolve the tenant from the URL and scope every tenant-owned repository operation explicitly.
Use PostgreSQL row-level security as an additional guard, with tenant context set locally
inside the transaction. Missing context must not reveal tenant-owned rows.

Use composite foreign keys where a child references a tenant-owned parent, including bookings
and blocked days referencing listings, and saved listings referencing accounts and listings.
Constraints must prevent cross-tenant relationships. Saved-listing access also requires the
authenticated account as owner; tenant isolation alone does not protect this private data.
The ordinary runtime role cannot bypass RLS or change protected ownership/role fields and has
SELECT-only access to the tenants table. Coordination must work with those privileges;
implementation must not weaken grants to acquire locks.

Keep privileged operations in the administration and platform-identity modules. Provisioning
and migrations use separate credentials. The privileged runtime role is not a superuser.
Module boundaries reduce accidental misuse but do not protect against full compromise of an
API process holding those credentials; separate services are outside this project's scope.

Tenant, user, session, listing, saved-listing, booking, and blocked-day records form the initial
model. Users include explicit host-disabled state; account soft deletion is not in scope.
Protect uniqueness, foreign keys, valid date ranges, and meaningful numeric bounds in the database.
Use application validation for useful error messages as well as database enforcement.

## Dates, availability, and concurrent edits

- Calendar dates travel as `YYYY-MM-DD` and are stored as PostgreSQL dates. Instants such as
  session expiration are stored as timestamps with time zone.
- Stays are half-open ranges: check-in inclusive, checkout exclusive. Cancelled bookings
  do not occupy nights. Confirmed and completed bookings occupy their recorded nights.
- Derive availability from bookings and blocked days; do not maintain a second availability
  table or cache. Search and calendar output must agree on the same overlap rules.
- Decide today in the tenant's configured time zone through an injected clock. The API
  provides the authoritative tenant-wide business date, clearly labelled in date-dependent
  UI. Source listings span regions; this is not a property-local date, and no property time
  zone field is added. Historic calendar months remain browsable.
- Preserve imported booking status exactly. Derive temporal past/current/future state
  separately from the stay dates and tenant-wide business date; never rewrite status merely
  because a stay is now in the past.
- Write rules: block only today or future dates, reject blocks on occupied nights,
  and reject duplicate blocks. Removing a block never changes a booking.
- Prices are integer cents in EUR throughout storage and calculations. The UI formats them
  for display; it does not perform exchange-rate conversion.
- Listing edits carry a version. An update against an old version receives a conflict response
  and the UI offers reload/review instead of silently replacing another host's changes.
- Reject a capacity reduction below the guest count of any noncancelled booking whose
  checkout is after the tenant-wide business date, including active and future stays. Retain
  historical bookings even when their guest count exceeds the listing's current capacity;
  bookings remain read-only.
- Use transactions for related writes. Coordinate listing archive and calendar changes on the
  same listing so a concurrent operation cannot bypass the listing's current state.

## Deletion and retention

Tenant deletion sets a deletion timestamp, makes its public portal unavailable, and revokes
its tenant sessions in the same transaction. Authentication and tenant resolution reject
deleted tenants. Their users, saved listings, listings, bookings, and blocks remain stored.

Deletion and every tenant write, including identity operations and privileged host provisioning,
use the same privilege-compatible transaction lock mechanism. Writes to an existing tenant
check that it is active while holding that lock, so no write can commit against a tenant already
deleted by a competing transaction.

Use explicit PostgreSQL READ COMMITTED isolation for this coordination. Acquire the
transaction-scoped advisory lock and then read the live tenant in a separate SQL statement,
so a waiter sees deletion or configuration changes committed by the preceding holder. Use
the freshly read tenant configuration, including its time zone, for the operation. Tenant
configuration changes take the exclusive coordination lock so date-dependent writes are
ordered with timezone changes. Verify the
advisory-lock SQL and its actual driver result shape early with restricted runtime credentials;
do not combine locking and the live-tenant read into a statement with a stale snapshot.

Deleted tenant slugs remain reserved; tenant restoration and permanent erasure are outside
scope. Soft deletion is not a claim that personal data has been erased.
Listing restoration remains available independently of tenant restoration.

## API and user interface

Use a versioned JSON API: tenant routes under `/api/v1/t/{slug}` and platform administration
under `/api/v1/admin`. Health endpoints are separate. Use shared Zod schemas for request and
response contracts; preserve the supplied domain types without treating them as an imposed
API or database shape. Map responses explicitly to exclude internal and credential fields.

Use consistent error responses with an HTTP status, stable application code, human-readable
message, request ID, and field errors when relevant. Return indistinguishable not-found
responses for absent resources and resources belonging to another tenant.

Use bounded pagination and deterministic sorting. Loading, empty, validation, not-found,
permission, and server-error states are part of the screens, not deferred polish.

UI direction: a restrained, responsive rental portal with cards and clear filters;
compact tables and forms for host and admin work. No stock-photo dependency because the supplied
listings have no images. Calendars, forms, and dialogs must work by keyboard, have clear labels,
and communicate status through text as well as colour.

## Verification and local operation

- Unit tests cover date boundaries, booking statuses, availability, validation, and permissions.
- Integration tests run against PostgreSQL with restricted runtime roles and cover cross-tenant
  reads/writes, same-tenant saved-list ownership (including host accounts), authentication,
  permission failures, constraints, and transaction behavior. Verify revoked credentials and
  login races during reset, promotion, and disabling, plus platform recovery and tenant deletion.
- Component tests cover important forms and calendar interactions, including changed props,
  cleared filters, past dates, loading, and error states.
- A small browser suite covers portal filtering/detail, host inventory/calendar actions, and
  the admin-create-tenant to host-create-listing to public-visibility journey. Also verify
  that a tenant's authenticated session cannot act in another tenant. Cover saved-list lifecycle
  through archive/restore, host disable/re-enable, assisted reset, and explicit promotion with
  forced password change; confirm private saved data survives these account transitions.
- Verify representative SQL search results against the pure availability functions. Do not
  rely on agreement between documentation and implementation as evidence of correctness.
- Date-dependent tests use an injected fixed clock; browser checks may derive dates from the
  API's authoritative today when clock injection is unavailable across the browser journey.
- Establish basic CI in the first runnable slice and add integration and browser checks as
  their features arrive. CI runs lint, typecheck, the implemented tests, and build. No custom
  test-ID framework, blanket coverage target, or mutation-testing program is required.

Docker Compose runs PostgreSQL, a one-off migration/seed step, API, and web. One documented
command starts the complete local application from a clean checkout. The seed loads all
1,000 listings and 12,757 bookings without altering the original data. Seed split:
two demonstration tenants, with deterministic assignment and documented demo accounts.
Inventory import and demo account bootstrap are independently versioned and idempotent, with
each completion marker committed in the same transaction as its changes. Later account
bootstrap must work over previously seeded inventory. Reruns never duplicate records, overwrite
user edits, reset passwords, recreate or reactivate deleted tenants, or re-enable disabled hosts.
Demo credentials are limited to local/test use.

Provide liveness/readiness checks and structured request logs with request IDs and sensitive
field redaction. Validate configuration at startup. Document local-only cookie/credential
settings clearly; deployment itself is outside scope.

## Reuse and development workflow

Review date/availability functions, CSV mappers, validation schemas, password hashing,
database constraints, and focused tests from the old repository as candidates for reuse.
Reuse calendar components only after checking their state and date-boundary behavior.
Bring code across when its feature needs it; avoid importing the old foundation wholesale.

Use the installed Superpowers workflow for design, planning, implementation, testing, and
review. Keep project-specific instructions short. Do not copy the old agent rules, task
catalogue, checkpoint system, or custom verification scripts by default.

The implementation plan follows working user journeys:
public seeded listings first, then identity and private saved listings, host workflows,
administration, and final
integration/security verification. The first slice includes a runnable frontend/API/database
path so integration is exercised early. Critical protections land with the features they protect.

Use hybrid execution with one integration owner retaining context and responsibility for shared
interfaces. Keep foundation work sequential; overlap independent feature work once its contracts
are stable. The plan identifies the permitted overlaps and integration checks. Limit concurrent
implementation to the main implementer and one focused agent, with independent read-only review
at the database/isolation, identity, and final checkpoints. Shared-file ownership and isolated
test environments prevent parallel work from interfering. Add no custom orchestration framework.
Keep `main` for the initial baseline and reviewed milestones. Use `codex/implementation` for
task commits and separate `codex/task-<number>-<short-name>` branches for parallel work;
review integrated changes through a pull request before they enter `main`.

The original design and these grill-review revisions are approved; the implementation plan is
updated to match the selected hybrid execution strategy. This document does not claim implementation,
successful tests, publication, or completion of the application.

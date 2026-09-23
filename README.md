# GreenState Development Task

Fresh implementation of the GreenState accommodation rental challenge.

Implemented: public tenant portals, accounts and private saved listings, host inventory and
calendar management, read-only booking history, and platform tenant/account administration.
The original challenge inputs remain unchanged.

## Planning

- [Approved design](docs/superpowers/specs/2026-09-22-rental-system-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-22-rental-system-implementation.md)

The 13-task plan records the approved scope. Git history keeps verified task commits and six
milestone pull requests, with independent reviews after the database, identity and final stages.

Use short-lived milestone branches, starting with `feat/foundation` for tasks 1–3.
Parallel work uses `feat/task-<number>-<short-name>` branches/worktrees based on the active
milestone. Sequential tasks receive their own verified commits without requiring extra branches.
Review each milestone through a pull request into `main`, preserving those commits; start the
next milestone from the updated `main`. The implementation plan lists all six milestone branches.

## Architecture

An npm workspace contains a React/Vite browser app, a NestJS API and shared TypeScript/Zod
contracts. Feature pages load on demand; TanStack Query handles server state and tenant/account
cache boundaries. nginx serves the browser app and proxies same-origin `/api` requests.

PostgreSQL stores the data; Prisma handles migrations and typed queries. Ordinary requests use
a restricted role with forced tenant row-level security, with additional owner isolation for
saved listings. A separate non-superuser role handles platform administration. Transactions,
listing versions and shared/exclusive tenant locks coordinate edits, credentials and deletion.
The API is a single modular application; there are no background workers or orchestration framework.

## Run locally

Install Docker with Compose v2 or newer, then run from the repository root:

```sh
docker compose up --build -d --wait
```

Browse <http://localhost:8080/greenstate> or <http://localhost:8080/citystays>. Each portal has
its own inventory, search filters, details, and two-month availability. The root landing page
reports the API connection through nginx; `/api/health/live` returns `{"status":"ok"}`.
The database-backed `/api/health/ready` endpoint reports readiness. Both application containers
run as non-root. A one-off migration/import container completes before the API starts.
The local Compose configuration explicitly enables challenge demo data. It imports every supplied
listing and booking into these two tenants:

| Tenant slug | Business timezone | Listings | Bookings |
|---|---|---:|---:|
| `greenstate` | Europe/Berlin | 500 | 6,499 |
| `citystays` | Europe/Lisbon | 500 | 6,258 |

Both tenants have listings in all 12 supplied cities. Assignment alternates sorted listing UUIDs;
bookings retain their original IDs/statuses and inherit their listing's tenant. Tenant business
dates apply across all its cities. Availability uses check-in inclusive / checkout exclusive
ranges, so a stay can begin on another stay's checkout date. Cancelled stays occupy no nights.

Import completion is stored transactionally with its version and input checksum. Rerunning the
import preserves later edits, additional listings, archives, and tenant deletion; changed source
files or conflicting original IDs fail rather than overwrite data. Account bootstrap uses its own
completion marker and adds the local examples documented below without resetting existing accounts.

PostgreSQL is available only on localhost port 54329, with a named volume for local data.
The Compose credentials are public development examples; this is not deployment configuration.
Use `docker compose down` to stop without removing that data.

For source development, use Node **24.21.0** (`nvm use`) and npm 11:

```sh
npm ci
npm run dev
```

Vite serves <http://localhost:5173> and proxies `/api` to port 3000. See `.env.example` for
Compose overrides. The local Node process reads exported environment variables; the default
origin is Vite's origin. If port 8080 is occupied, set both `WEB_PORT` and `APP_ORIGIN` for Compose.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run audit:dependencies
npm run test:stack  # requires the running Compose stack
```

Tests use the same Nest application factory as production. Unit/component checks cover date and
availability rules, validation, authentication, request cancellation, permissions, forms, loading
and error states. CI runs clean install, lint, typecheck, these tests, production builds, real
PostgreSQL integration tests, stack checks and all browser journeys. Failed browser reports and
traces are retained for seven days.

Dependency advisory checks and reviewed weekly updates are configured separately.
See [security maintenance](docs/security-maintenance.md) for the audit threshold,
metadata sent to npm, update policy and safe API diagnostics.

Local verification on 23 September 2026 passed 74 API unit tests, 222 web component tests,
271 PostgreSQL integration tests, two stack checks and 34 browser cases. The dependency
audit reported no known advisories. The stack used existing images with freshly built API,
contracts and web output mounted read-only. Earlier startup verification also confirmed
that restarting preserves edited inventory and account state.

After starting the local database, run:

```sh
npm run test:integration
```

The suite creates uniquely named `greenstate_test_*` databases and drops only those databases
afterward; it never resets the development database. It covers tenant/child-table isolation,
connection-context cleanup, restricted grants, constraints, startup credential rejection, tenant
resolution, real shared/exclusive lock contention, deterministic import/retention, public search
filters/pagination, archived and foreign visibility, calendar/search agreement, tenant/platform
authentication, credential races, throttling, saved-list ownership, archive/restore, calendar blocks,
booking history, administrative lifecycle ordering, platform recovery and restart-safe initialization. Test
cases also check portfolio snapshots across concurrent commits, cancelled/overlapping bookings,
and tenant counts across active, archived, disabled and deleted states. Test
database ownership matches Compose. `test:stack` verifies request-secret redaction through both
nginx and the API, including proxy-generated errors. Set `COMPOSE_PROJECT_NAME` and
`STACK_BASE_URL` if using a custom Compose project or port.

For the portal, account, saved-list, host calendar and administration browser journeys, install Chromium once and use a running, seeded stack:

```sh
npx playwright install chromium
npm run test:browser
```

The journeys run in desktop and 375-pixel Chromium viewports. They cover filters, listing
navigation, two-month availability, clearing dates, browser history, account registration, password
changes, sign-in return paths, forced-password sessions, logout, cross-portal account isolation,
private shortlists, host create/edit/archive/restore, calendar blocks and booking history, tenant
creation/deletion, host provisioning/disable/re-enable, client promotion and assisted password reset.
Security journeys also cover cross-tab logout/reset/disable, account switching, malformed listing
URLs, CSRF, role/ownership injection and escaped listing text. Unexpected browser errors fail tests.
Additional journeys verify two hosts editing the same version without losing the conflicting
draft, calendar scroll preservation after saving, and tenant setup/deletion transitions.
Keyboard checks cover search focus, tenant forms, calendar actions and destructive confirmations.
Playwright keeps headless tabs focused, so cross-tab tests explicitly deliver the activation event;
cookies, session refresh, API requests and PostgreSQL remain real.
Set `STACK_BASE_URL` for a nondefault web port. Browser checks create uniquely named test client
accounts, tenants, listings and booking fixtures; they leave supplied inventory intact.
Host and platform-admin fixtures use the separate non-superuser `gs_admin` connection via
`STACK_TEST_ADMIN_DATABASE_URL` (default: the local example on port 54329). This setup runs only
in the browser test process, never in the web app. Actual browser actions use the normal API. The forced-password
journey expects unchanged initial host/admin demo credentials, so use a separate demo stack if
you have changed those credentials for manual testing.
Reports are written to `playwright-report/`; failures retain traces in `test-results/`.
Use a separate Compose project and ports when running it alongside another development stack:

```sh
COMPOSE_PROJECT_NAME=greenstate-browser DATABASE_PORT=54330 WEB_PORT=18080 \
  APP_ORIGIN=http://localhost:18080 AUTH_LOGIN_IP_LIMIT=300 AUTH_REGISTRATION_IP_LIMIT=100 \
  docker compose up --build -d --wait
STACK_BASE_URL=http://localhost:18080 \
  STACK_TEST_ADMIN_DATABASE_URL=postgresql://gs_admin:local-admin-only@127.0.0.1:54330/greenstate \
  npm run test:browser
```

The isolated browser stack uses higher login/registration limits to accommodate repeated fixture
creation. Production defaults and rejection behavior are tested with real API integration cases.

Public API routes start with `/api/v1/t/:slug`. `/listings` accepts city, guests,
`minPriceCents`, `maxPriceCents`, paired `from`/`to` dates, page, and pageSize (maximum 50).
Unknown keys and incomplete or invalid date ranges return a structured 400 error. Historical
queries are allowed; date ranges span at most 366 nights. `/listings/facets` supplies active cities,
`/listings/:id` supplies public details, and `/listings/:id/availability?from=…&to=…` exposes daily
availability. Archived or foreign listing IDs have the same public 404 response.

Clients and hosts can save listings from cards or details and open `/:slug/saved`. Each account
has a private shortlist for its tenant; hosts have no access to another account's saved rows.
`/me/saved-listings` returns bounded pages, newest first, and accepts an optional comma-separated
`listingIds` filter of up to 50 UUIDs. PUT/DELETE `/me/saved-listings/:id` add/remove idempotently.
Archived saves remain as unavailable entries without listing details, and can still be removed.
Restoring the listing makes a retained save available again. Both tenant and user context are
required by database row-level security; private browser queries are cancelled on account changes. Returning to a tab rechecks its session
without discarding unchanged editing views; revoked or replaced accounts clear private data.

Hosts open `/:slug/host/listings` to create/edit inventory and filter active or archived records.
`/host/listings` supports GET/POST; `/:id` supports GET/PATCH; `/:id/archive` and `/:id/restore`
use POST. Edits and archive actions require the listing version and return a conflict if stale.
Descriptions are plain text up to 5,000 characters. Price is always integer EUR cents. Capacity
cannot be reduced below an active or future noncancelled booking's guest count. Archiving hides
public details while preserving bookings and saved entries; hosts can edit and restore archives.
Saved mutations, archive actions and capacity changes use the same listing row lock after the
shared live-tenant lock. Tests exercise both save/archive orderings under actual contention.

Hosts open a listing’s **Calendar** to inspect historical and upcoming nights, add a block with
an optional reason, or remove a block. Booked nights take precedence over blocks; checkout is
exclusive and cancelled bookings occupy no nights. New blocks require an active listing and
today or a future tenant business date, checked again after acquiring the listing lock. Existing
blocks and booking history remain accessible after archiving. Booking history supports listing,
imported-status, half-open date-range and page filters; imported status is displayed separately
from the stay’s current date-derived period. Booking creation and editing are outside scope.

Platform administrators sign in at `/admin/login` and open **Administration**. They can create
and configure tenants, provision hosts, search account metadata, disable/re-enable hosts, reset
client or host passwords, and explicitly promote clients. Every reset/promotion revokes old
sessions and requires a first-login password change. Promotion retains the account and shortlist
but replaces its password. Resetting a disabled host keeps it disabled. Administrators verify
identity and deliver temporary passwords outside the application; there is no email subsystem.

Deleting a tenant hides its portal, revokes its sessions and rejects subsequent writes while
retaining accounts, listings, bookings, blocks and saved rows. Its slug stays reserved. Deletion
and timezone changes take an exclusive tenant lock; ordinary writes take a shared live-tenant
lock. Integration cases exercise both transaction orderings for identity, saved-list, listing,
calendar and administrative mutations. Seed reruns preserve these lifecycle decisions.

### Recover a platform administrator

From the source checkout, export `RECOVERY_DATABASE_URL` with database-administration credentials
(the schema-owning `gs_owner` role or a PostgreSQL superuser), then run:

```sh
npm run admin:recover -- --email admin@example.test
```

The command prompts for a new password with terminal echo disabled. Use 15–128 characters.
The chosen password takes effect immediately and all old platform sessions are revoked. It
recovers an existing account only; runtime `gs_app`/`gs_admin` credentials are insufficient.
Keep this owner connection outside the runtime API/web configuration. The local development
owner URL is documented as `MIGRATION_DATABASE_URL` in `.env.example`; explicitly supply it as
`RECOVERY_DATABASE_URL` when recovering a local account. Password flags are rejected, failures
are redacted, and no password/hash/token is printed. Controlled tests may provide the password
via stdin. Do not put the replacement password in shell arguments or history.

`infra/db/roles.sql` creates separate local migration (`gs_owner`), ordinary (`gs_app`), and
privileged (`gs_admin`) credentials. The ordinary role cannot bypass forced row-level security,
change ownership, modify the tenant registry, write bookings, or hard-delete listings. The
privileged role is not a superuser. Runtime startup rejects excessive role/schema privileges.
Coordinated writes use READ COMMITTED explicitly; tenant writes take a shared advisory
lock, and lifecycle/configuration changes take the exclusive lock before rereading the tenant.
Portfolio calendar reads use REPEATABLE READ so totals, rows, bookings and blocks share
one snapshot even when a concurrent writer commits between queries.
The privileged pool is kept out of ordinary feature-module providers. nginx logs allowlisted
method/path/status/request-ID metadata; its free-form per-request error logs are suppressed
because they include raw query strings. Proxy failures remain visible through HTTP status logs.
API completion logs use route templates instead of supplied path values. Server failures
also emit correlated, allowlisted error classifications without raw exception details.

Compose applies migrations automatically. For source development, export
`MIGRATION_DATABASE_URL` using the local example in `.env.example`, then run `npm run db:migrate`.
To run the source import explicitly, export `ADMIN_DATABASE_URL` from the local example and run
`SEED_DEMO_DATA=true npm run db:seed`. With no explicit opt-in, the CLI skips demo import.
Set `SEED_DEMO_DATA=false` for a Compose startup without demo data.

Prisma clients are generated by the root build/test/typecheck commands; generated files are
ignored by Git. When upgrading an older local volume that predates role bootstrap, apply it once:

```sh
docker compose exec -T db psql -U postgres -d greenstate -v ON_ERROR_STOP=1 < infra/db/roles.sql
```

The Prisma CLI currently pins vulnerable transitive dependency releases. Root overrides select
patched `deepmerge-ts` and `mysql2` versions; configuration loading, generation, migration, and
clean Docker installs are verified with them. Remove the overrides when Prisma adopts patched
versions. These overrides do not change the PostgreSQL driver.

## Original challenge material

The following files were supplied with the original GreenState challenge. They are retained
unchanged; no old application code, credentials, generated artifacts, or agent configuration
was copied into this repository.

- `task-material/Full Stack Challenge.pdf`: original brief.
- `task-material/contracts.ts`: original domain contracts, kept as source material.
- `data/listings.csv`: 1,000 listings.
- `data/bookings.csv`: 12,757 bookings.

The SHA-256 checksums below were verified against the original email-attachment folder
`full-stack-challenge 2` on 2026-09-22. All four files match byte-for-byte in the working tree
and committed Git copies; no substantive attachment file is missing. The earlier working
project's copies also match these originals.

| File | SHA-256 |
|---|---|
| `task-material/Full Stack Challenge.pdf` | `f07f0e2f665b4935027f9c6573fff3a16fb6c4326132141b22f28ff1dc67c2bc` |
| `task-material/contracts.ts` | `d3b46cc388e1defa94fc191511a7aa80418c0314c713ab2be3badf72ff081711` |
| `data/listings.csv` | `05c4ceb34325652c9cd65f0912fcaef4d02513c3bab93fa438fc3150fb5c200e` |
| `data/bookings.csv` | `2b547c5439db31c8659264c6fb63c245a75aa59411e572c94878a55c523ebcf6` |

### Local demo accounts

With `SEED_DEMO_DATA=true`, account initialization follows inventory initialization as a separate, versioned transaction. Both tenant portals have the same example host and client emails; their identities, passwords and sessions are separate. All provisioned demo accounts require a password change on first sign-in.

| Realm | Email | Initial local password |
| --- | --- | --- |
| Each tenant — host | `host@example.test` | `GreenState demo host 2026!` |
| Each tenant — client | `client@example.test` | `GreenState demo client 2026!` |
| Platform admin | `admin@example.test` | `GreenState demo admin 2026!` |

These are public local examples enabled by the explicit demo-data option. Initialization reruns preserve changed passwords, account state and inventory edits. An already deleted tenant is skipped during an inventory-only upgrade. Conflicting existing accounts cause the entire new account phase to roll back instead of being overwritten.

Authentication uses Argon2id (19 MiB, two iterations, parallelism one), random 32-byte session tokens stored only as SHA-256 hashes, and fixed seven-day sessions. New passwords accept 15–128 Unicode characters, including spaces. Password changes revoke every previous session in that realm. HTTP-only, SameSite=Lax cookies become Secure when `APP_ORIGIN` uses HTTPS; responses are not stored by HTTP caches.

Mutations require an Origin matching `APP_ORIGIN` and `X-Requested-By: greenstate-web`. Authentication limits are configured in `.env.example`, applied before hashing, and held in bounded memory for this single API instance. Login limits apply both per IP and per tenant/platform account; registration applies per IP across portals; password changes apply per actor and target. A 429 response includes `Retry-After`. `TRUST_PROXY_HOPS` defaults to zero for direct Node development; Compose sets it to one behind nginx, which replaces forwarded IP headers. Multiple API replicas would require a shared limiter.

## Deliberate limits

This is a local challenge application with public example credentials and HTTP defaults. It has
one API instance and an in-memory authentication limiter. Production hosting, TLS termination,
shared rate limiting and operational backups are separate deployment work.

Browsing is public; accounts add private saved listings. Booking creation/editing, payments,
email verification/recovery, MFA, uploads and an audit-log UI are outside the agreed scope.
Hosts share management access within their tenant. Dates use the tenant's explicit business
timezone rather than each property's local timezone; imported booking status remains unchanged.
Tenant deletion is soft and its slug remains reserved. Browser automation covers Chromium at
desktop and 375px widths; Safari/Firefox and a full assistive-technology audit are not verified.

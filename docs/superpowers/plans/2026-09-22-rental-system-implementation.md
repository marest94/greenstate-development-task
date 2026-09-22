# Accommodation Rental System Implementation Plan

> **For agentic workers:** The user selected hybrid execution. Use superpowers:executing-plans for the main implementation, superpowers:dispatching-parallel-agents for the bounded independent work below, and superpowers:requesting-code-review at the stated checkpoints. Keep one integration owner with continuous context. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver the full original challenge, listing creation/archiving, private saved listings, account administration, and the approved engineering and security baseline in a fresh repository.

**Architecture:** One NestJS API, one React application, and PostgreSQL. Feature modules own their HTTP, service, and repository code; a shared package owns wire schemas. Complete usable slices, bringing reviewed code across from the old project only when needed.

**Tech Stack:** TypeScript, npm workspaces, NestJS, React, Vite, React Router, TanStack Query, Zod, Prisma, PostgreSQL, Docker Compose, Vitest, Testing Library, Supertest, Playwright.

**Spec:** [Design](../specs/2026-09-22-rental-system-design.md). Read it with this plan. The user confirmed the design and grill-me review decisions and selected hybrid execution on 2026-09-22. Neither document claims implementation or test results.

## Global constraints

- Complete the original portal, account, host, and admin features, plus listing creation, archiving, and restoration.
- Accounts belong to one tenant; platform accounts and sessions are separate.
- Clients and hosts can manage only their own private saved listings, including within one tenant.
- Superadmins can disable/re-enable host accounts, reset tenant-account passwords, and explicitly promote clients to hosts using fresh temporary credentials.
- Stays are half-open ranges: check-in inclusive, checkout exclusive.
- Prices are integer cents in EUR throughout storage and calculations.
- Missing tenant context must not reveal tenant-owned rows.
- The ordinary runtime role cannot bypass RLS or change protected ownership/role fields.
- Tenant deletion is soft deletion; tenant slugs are immutable after creation and remain reserved after deletion.
- Session lifetime is a fixed seven days; provisioned hosts and accounts reset or promoted by an admin must change their temporary password before other authenticated actions.
- Disabling a host blocks its entire tenant account and revokes sessions; resetting a password does not re-enable it.
- Use the configured tenant business date for date cutoffs; preserve imported booking status independently of past/current/future labels.
- Bookings remain read-only; no booking creation, payment, deployment, or email subsystem.
- Keep supplied material unmodified. The old specification is reference material only.
- No custom test-ID framework, blanket coverage target, or mutation-testing program.
- Do not commit or copy real environment files, credentials, generated artifacts, or the old agent configuration.

## Review focus

These are explicit tests, not an additional review checklist to run manually on every change.

1. Browser back/forward navigation and clearing a date input must update the effective search; covered in task 5.
2. Checkout boundaries, leap days, and different process time zones must not shift occupied dates; covered in tasks 3 and 4.
3. Reusing a pooled connection without tenant context must reveal no tenant rows; covered in task 2.
4. Once tenant deletion commits, the host's next request and waiting/new tenant mutations must reject; a mutation committed before deletion may succeed. Covered in tasks 2 and 11 with an explicit isolation level.
5. Same-tenant accounts cannot read or mutate each other's saved lists, and stale credentials cannot survive reset/promotion/disable. Covered in tasks 6, 8, 11 and 12.

## Execution conventions

Each task follows its test-first steps, passes its focused tests, and then passes lint/typecheck
for affected code. Run the broader suite at the end of each delivery stage and before final
review. Do not claim a check passed unless its command ran successfully. Configuration and
documentation need direct verification, not tests that repeat their own contents.

Feature behavior, security guarantees, and acceptance scenarios are the commitments. File
paths, helper signatures, SQL examples, and task-internal steps are implementation guidance,
not preverified mandates. Adjust them when execution provides better evidence, keep dependent
interfaces consistent, and explain a material design change before adopting it. Do not add
project-specific process controls merely to enforce the examples in this plan.

Use normal Git commits at verified task boundaries, staging only task files. An execution
skill establishes the working branch/worktree before product edits. Publishing a remote
repository or pushing is a separate action from implementing locally.

Branching model: `main` holds the initial planning/input baseline and reviewed delivery
milestones. Use a short-lived branch for each milestone in the schedule below, starting with
`feat/foundation`; create the next milestone branch from the reviewed `main` after the preceding
milestone merges. Keep verified task commits on that branch so progress remains visible.
Parallel implementation branches use `feat/task-<number>-<short-name>` from a verified commit
on the active milestone branch and run in separate worktrees. Integrate them into that milestone
one at a time, then review the combined changes through a pull request into `main`. Preserve
the task commits when merging the milestone rather than collapsing them into one squash commit.
Sequential tasks need commits but not separate branches or pull requests. Create branches only
when their work starts; there is no permanent development branch or required tool-name prefix.
GitHub branch protection has not been configured.

Root script contract, established in task 1 and extended as suites arrive:

```text
npm run dev              API and web development processes
npm run build            contracts, API, web
npm run lint             ESLint without custom architectural AST rules
npm run typecheck        all existing workspaces
npm test                unit and component suites
npm run test:integration real PostgreSQL API/database/seed tests
npm run test:browser     browser journeys against the complete stack
npm run db:migrate       forward migrations using owner credentials
npm run db:seed          deliberate local/demo seed
npm run admin:recover    local recovery of an existing platform superadmin (task 11)
```

Use workspace test commands with file arguments for focused verification. Each task lists the
command it introduces or consumes. Missing scripts must fail; do not add success-only stubs.
Use short-lived dedicated test databases, never the development database, for resets.

## Hybrid execution and parallel work

The main implementer owns architecture, shared interfaces, integration, and completion evidence.
Use at most two implementation lanes at once: the main implementer and one focused implementation
agent. A separate read-only reviewer can run at the checkpoints below. These are upper limits,
not slots to keep occupied. Delegate only when the other lane has useful independent work.
No recursive delegation or new project-specific orchestration framework is needed.

Task numbers and stages describe deliverables. The following schedule permits implementation
overlap; it does not mark a dependent task complete before its real-stack acceptance checks pass.

| Wave | Milestone branch | Main implementer | Parallel work | Prerequisites and integration checkpoint |
|---|---|---|---|---|
| Foundation — tasks 1–3 | `feat/foundation` | Scaffold, database roles/RLS/locks, seed, date rules, and shared test harness, in order | Independent database/security review after task 2; task 3 may proceed during that review | Resolve isolation/locking findings and pass the seeded-stack checks before tenant-facing feature work |
| Portal — tasks 4–5 | `feat/public-portal` | Task 4 API and shared portal contracts | Task 5 screens and component tests against those contracts | Tasks 1–3 complete; agree schemas, URL/date behavior, API client, tenant-provider and calendar interfaces first. Join on the real API before the task 5 browser journey |
| Identity — tasks 6–7 | `feat/identity` | Task 6 sessions, guards, permissions, and task 7 shared auth provider/cache behavior | Task 7 forms and account navigation after the auth contracts and core session tests are stable | Complete the portal first. UI mocks may support implementation, but real login/password-change/crossover tests and the identity review must pass before tasks 8–9 |
| Saved lists and inventory — tasks 8–9 | `feat/saved-listings-and-inventory` | Task 8 saved-list data/API/UI and its user-context database extension | Task 9 host listing API/UI in its assigned files | Tasks 6–7 complete. Land the required schema, contracts, listing-lock helper, and archive/version fields before dispatch. Join for saved→archive→unavailable→restore and save/archive race checks |
| Calendar and administration — tasks 10–11 | `feat/calendar-and-administration` | Task 11 tenant/account administration and local recovery | Task 10 host calendar and read-only bookings | Tasks 8–9 integrated; settle calendar/booking/admin contracts first. Join for deletion-versus-write tests, lifecycle regressions, and the new-tenant→host→listing journey |
| Delivery — tasks 12–13 | `chore/release-readiness` | Task 12 combined regression runs and final integration | Task 13 usability inspection/README work; independent final review of the integrated application | All feature work integrated. Inspection may overlap tests; apply resulting behavior/infrastructure fixes in a controlled sequence, then run final checks on the resulting code |

Shared files need an explicit owner during each overlap: dependency manifests and lockfile,
Prisma schema/migrations/role SQL, transaction helpers, shared contracts/barrels, app module,
router/providers/API client, shared calendar controls, Compose, CI, and shared test fixtures.
The main implementer establishes or assigns these changes before dispatch; agents do not make
competing edits to them. For tasks 8–9, this includes `archivedAt`, listing `version`, and the
common listing-row locking behavior. For tasks 10–11, keep identity/lifecycle helpers with the
main implementer and agree any shared calendar-control changes before the agent edits them.

Each assignment states its deliverable, prerequisite commit, owned files, agreed interfaces,
and focused checks. Use an isolated worktree for substantive parallel implementation, based
on the same verified integration commit. Each lane uses its own test database/Compose project
when it needs a writable stack; it must not reset the other lane's database. Read-only review
can inspect a fixed commit without another implementation checkout. Keep branches and handoffs
lightweight; do not introduce a separate task catalogue or coordination documents.

When a lane needs a shared-interface change, the main implementer resolves and communicates it
before dependent work continues. Agents report changes, check results, and integration needs.
The main implementer reviews and integrates one contribution at a time, resolves any overlap,
and runs the combined feature checks before marking tasks complete. Mocks and isolated tests
are development aids; they do not replace the real-database and browser checks in each task.
If two lanes become tightly coupled, finish the shared change sequentially and resume parallel
work afterward. Do not keep agents running merely to preserve the schedule.

Independent review checkpoints are the database/isolation foundation, integrated identity,
and the complete application. An early review may overlap work that does not rely on an
unresolved finding; block dependent work until correctness/security findings are addressed.
The final reviewer checks the integrated result. Any subsequent fixes need focused verification
and review of affected findings before the final completion claim. Review every contribution
as integration owner; a fresh reviewer for every numbered task is not required by this strategy.

## File structure and boundaries

```text
apps/api/src/
  main.ts, bootstrap.ts, app.module.ts, config.ts
  common/http/          request IDs, error filter, validation and CSRF
  common/time/          calendar dates, tenant today
  db/                   ordinary pool, tenant transactions, admin pool
  health/               health controller
  tenants/              public registry lookup
  listings/             search/detail and host inventory operations
  availability/         pure rules and calendar queries
  identity/             sessions, passwords, guards and permission mapping
  saved-listings/       private shortlist queries and mutations
  bookings/             host read-only queries
  admin/                platform auth, tenants and account administration
apps/api/prisma/         schema and forward migrations
apps/api/test/           real-database harness and integration tests
apps/web/src/
  app/                  router, query client, layouts, providers
  lib/                  API client and formatting
  features/portal/      search and listing detail
  features/auth/        sign-in, registration, password change
  features/saved/       current account's private shortlist
  features/host/        listings, editing, calendar, bookings
  features/admin/       tenant management and account administration
  components/           reused controls with actual consumers
packages/contracts/src/ shared primitives, feature schemas, supplied types
infra/db/               local database role initialization
data/, task-material/   unchanged supplied inputs
e2e/                    a few user journeys
```

Feature files below suggest ownership. Adjust names and splits to actual implementation needs;
preserve the feature boundaries and verification outcomes without building extra scaffolding.

## Shared conventions

These are implementation choices for review with the plan, not rules imported from the old spec.

```ts
type IsoDate = string; // Validated YYYY-MM-DD at external boundaries.
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type TenantContext = { id: string; slug: string; name: string; timezone: string };
type ApiError = {
  status: number; code: string; message: string; requestId: string;
  fields?: Record<string, string[]>;
};
type DateRange = { from: IsoDate; to: IsoDate };
type Permission =
  | 'saved-listings:manage' | 'listings:manage' | 'calendar:manage' | 'bookings:read'
  | 'tenants:manage' | 'accounts:manage';
```

Use `/api/v1/t/:slug` for tenant routes, `/api/v1/admin` for platform routes, and
`/api/health/live` and `/api/health/ready` for health. Body-provided tenant IDs never select
the tenant. Validate route parameters before they reach a database query, including in guards.

For detail endpoints, an absent or foreign resource returns the same `404 RESOURCE_NOT_FOUND`
shape apart from request-specific IDs. Errors use the actual HTTP status. Empty lists return
200. Validation errors return 400, unauthenticated requests 401, insufficient permissions 403,
stale versions and duplicate blocks 409, and throttling 429 with `Retry-After`.

## Stage 1 — Running application and real seeded data

### Task 1: Boot the API and web together

**Create:** root `package.json`, lockfile, TypeScript/ESLint configuration, `.gitignore`,
`.env.example`, `README.md`; workspace manifests; `apps/api/src/{main,bootstrap,app.module,config}.ts`,
`apps/api/src/common/http/{errors,request-id,validation}.ts`,
`apps/api/src/health/health.controller.ts`, `apps/api/test/health.test.ts`;
`apps/web/{index.html,vite.config.ts}`, `apps/web/src/{main.tsx,index.css}`,
`apps/web/src/app/{router.tsx,query-client.ts,App.test.tsx}`; `packages/contracts/src/index.ts`;
`apps/api/Dockerfile`, `apps/web/{Dockerfile,nginx.conf}`, `compose.yaml`, `.dockerignore`,
`.github/workflows/ci.yml`.

**Interfaces:** `createApp()` in `bootstrap.ts` returns a configured Nest application used by
both `main.ts` and tests; importing the factory never starts a server.
`GET /api/health/live` returns `{ status: 'ok' }`. Web requests use same-origin `/api`.

- [x] Copy only the original brief, contracts, and CSV files into their designated paths;
  compare their SHA-256 hashes with the originals. Record attribution and data counts in README.
  Completed during fresh-repository setup; the scaffold was subsequently verified with
  unit/component tests, lint, typecheck, builds, and local Compose startup.
- [x] Establish workspaces and the minimal test harness. Select supported stable dependency
  versions by checking official package engines and peer dependencies, use a supported Node LTS,
  and save exact versions and the lockfile. Record Node and required Docker setup in README.
- [x] Write the health test and a web test that shows API status. Run them and observe the
  application-level failure before implementing the app factories/components:

  ```ts
  const app = await createApp();
  await app.init();
  await request(app.getHttpServer()).get('/api/health/live')
    .expect(200).expect({ status: 'ok' });
  await app.close();
  ```

- [x] Implement bootstrap and a minimal landing page. Disable Nest's default JSON parser and
  install one bounded parser; wire validation/errors/request IDs through the same factory used
  in tests. Add Helmet, safe logging, and startup environment validation. Test malformed and
  oversized JSON as HTTP requests; return 400 and 413 without internal details.
- [x] Configure Vite's development proxy and nginx's `/api` proxy/history fallback. Build
  multi-stage images; the runtime image runs as a non-root user. Compose initially starts API,
  web, and PostgreSQL, with database credentials restricted to local development.
- [x] Add basic CI now: clean install, lint, typecheck, current unit/component tests, and build.
  Add database, seed, and browser checks in the tasks that introduce them. Do not advertise
  remote CI success before a run has actually executed on the chosen repository host.
- [x] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and
  `docker compose -f compose.yaml up --build -d`. Verify the landing page and health through
  nginx. Commit the verified scaffold and original input copies.

### Task 2: Database boundaries, migrations, and tenant resolution

**Create:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/001_inventory/migration.sql`,
`infra/db/roles.sql`, `apps/api/src/db/{database.module,tenant-db,tenant-lock,admin-db}.ts`,
`apps/api/src/tenants/{tenants.controller,tenants.service,tenants.repository,tenant.guard}.ts`,
`packages/contracts/src/{primitives,tenant,errors}.ts`, `apps/api/test/{setup,fixtures}.ts`,
`apps/api/test/{tenant-isolation,tenant-resolution}.test.ts`.
**Modify:** app module, config, Compose, readiness, contracts barrel, test scripts, and CI.

**Interfaces:** `TenantDb.run<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>`;
`TenantsRepository.findLiveBySlug(slug: string): Promise<TenantContext | null>`;
`GET /api/v1/t/:slug` exposes public tenant configuration only. ORM transaction types remain
inside database/repository files; domain logic receives plain data.
`lockLiveTenant(tx, tenantId, mode: 'shared' | 'exclusive'): Promise<TenantContext>` belongs to
the database layer. It acquires transaction-scoped coordination, then reads and returns the
live tenant in a separate SQL statement in that transaction. Date-dependent mutations use
this fresh configuration. Mutations and administration share the same key derivation.

- [x] Write integration cases for tenant A/B reads and writes, an unscoped read, a mismatched
  booking/listing tenant, and a reused connection after a scoped transaction. Run
  `npm run test:integration -w apps/api -- test/tenant-isolation.test.ts` and confirm failure.
  The fixture creates two tenants and one listing each; `appDb` uses the ordinary role and a
  one-connection pool for this case:

  ```ts
  const visible = await tenantDb.run(tenantA.id, tx => tx.listing.findMany());
  expect(visible.map(row => row.id)).toEqual([listingA.id]);
  expect(await appDb.listing.findMany()).toEqual([]);
  const next = await tenantDb.run(tenantB.id, tx => tx.listing.findMany());
  expect(next.map(row => row.id)).toEqual([listingB.id]);
  ```
- [x] Model tenants, listings, bookings, and blocked days. Preserve supplied IDs, date and money
  semantics; make `(listing_id, tenant_id)` child references target `(id, tenant_id)` on listings.
  Add positive capacity, nonnegative price, valid coordinates, and `check_in < check_out` checks.
- [x] Create migration-owner, ordinary application, and non-superuser privileged runtime roles.
  Force RLS on tenant-owned tables. The ordinary role has SELECT-only access to tenants,
  reads bookings, manages
  inventory/blocks, and cannot hard-delete listings or alter table definitions. Implement
  transaction-local context with parameter binding:

  ```ts
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  // Representative SQL policy expression:
  // tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ```

- [x] Establish the tenant-deletion coordination mechanism under the actual restricted role.
  Use a shared transaction-scoped advisory lock for tenant mutations and an exclusive lock
  for deletion, keyed consistently from the immutable tenant ID in a dedicated key namespace.
  Explicitly use READ COMMITTED in ordinary and privileged coordinated transactions. After
  acquiring the lock, re-read the live tenant in a separate SQL statement, using its current
  timezone for date-dependent writes. Do not combine the lock and lookup into one statement
  or inherit a database default that may keep an older snapshot. Keep the mutation in the
  same transaction. Do not use `SELECT FOR SHARE` on the SELECT-only tenant registry or grant
  tenant UPDATE merely to make that lock work. Test shared/exclusive contention, rollback
  release, and denial of direct tenant UPDATE using the ordinary connection. Check the actual
  driver/Prisma SQL behavior here before downstream tasks depend on this implementation;
  advisory-lock functions return PostgreSQL void, so verify a supported statement/result
  shape rather than assuming a raw SELECT will deserialize. Use transaction barriers to
  prove a waiter observes deletion after the lock is released, including with the database
  default set to Repeatable Read while the wrapper explicitly selects Read Committed.
  Also order a configuration update against a date-dependent write and assert that the
  resumed write uses the updated timezone, not the guard's earlier tenant snapshot.
- [x] Establish one lock order: tenant coordination first, then any user or listing row lock.
  Shared tenant locks allow unrelated host writes to proceed concurrently. Advisory locks
  coordinate cooperating code; RLS, foreign keys, and privileges still enforce isolation.
- [x] Add startup checks rejecting superuser/BYPASSRLS ordinary connections and superuser
  privileged connections. Run both negative startup cases in the integration suite. Keep
  AdminDb injectable only through the admin/platform module, seed entry point, and task 11's
  local platform-recovery command.
- [x] Implement strict slug validation, registry lookup, and the tenant guard. An unknown or
  deleted slug returns `404 TENANT_NOT_FOUND`. Malformed/control-character slugs return 400
  before lookup. Test all three over HTTP, including an encoded NUL.
- [x] Add the one-off migration Compose service, database readiness probe, and the real-PostgreSQL
  integration job in CI. Rerun focused
  integration tests, all unit tests, lint/typecheck, and migrations from an empty test database.
  Commit the working isolation boundary.

### Task 3: Deterministic seed and reusable availability rules

**Create:** `apps/api/src/seed/{main,parse-csv,map-data,seed}.ts`,
`apps/api/prisma/migrations/002_seed_runs/migration.sql`,
`apps/api/src/common/time/{dates,clock}.ts`, `apps/api/src/availability/availability.ts`,
`apps/api/src/availability/availability.test.ts`, `apps/api/src/common/time/dates.test.ts`,
`apps/api/test/seed.test.ts`, `packages/contracts/src/supplied.ts`.
**Modify:** package scripts, migration/seed Compose step, CI, README.

**Interfaces:** `overlaps(a: DateRange, b: DateRange): boolean`;
`isFree(bookings: BookingDto[], blocked: IsoDate[], stay: DateRange): boolean`;
`eachDay(range: DateRange): IsoDate[]`; `todayIn(timezone: string, now: Date): IsoDate`;
an injectable `Clock.now(): Date` supplies instants to application code and can be fixed by the test factory;
`runSeed(): Promise<{ listings: number; bookings: number; tenants: number }>`.
`BookingDto` comes unchanged from the supplied contracts; the seed does not invent guests/users
for historical bookings.

- [x] Write failing unit vectors and run `npm test -w apps/api -- src/availability/availability.test.ts`:

  ```ts
  expect(overlaps({ from: '2026-10-01', to: '2026-10-04' },
                  { from: '2026-10-04', to: '2026-10-06' })).toBe(false);
  expect(eachDay({ from: '2028-02-28', to: '2028-03-01' }))
    .toEqual(['2028-02-28', '2028-02-29']);
  // Repeat active/cancelled and blocked-night cases through isFree.
  ```

- [x] Review and selectively reuse the old pure functions and CSV mappers. Cover invalid dates,
  leap days, empty/inverted ranges, checkout turnover, cancelled stays, and time-zone midnight.
  Run date tests in both `Europe/Belgrade` and `America/New_York` processes.
- [x] Treat today as a tenant-wide business date, even when listings span different cities.
  Test one instant near midnight with different tenant timezones and verify listings in the
  same tenant share its cutoff. Do not add listing timezone fields or rewrite imported booking
  statuses as time passes. A past stay may still have the supplied status `confirmed`.
- [x] Write the real-database seed test: load 1,000 listings and 12,757 bookings across two
  tenants, run twice without duplicates, and reject a corrupt CSV before committing any rows.
  After the first import, change a seeded title and add an extra listing through test fixtures;
  rerunning must preserve both, with no count-based rejection or data repair.
- [x] Implement deterministic tenant assignment by sorting listing UUIDs and assigning alternating
  entries to the two tenants; bookings inherit their listing's tenant. Parse quoted CSV fields
  correctly and retain original IDs. Record an inventory-import version, input checksum, and
  completion marker in the same transaction as the imported rows. Serialize initialization
  with its own advisory lock namespace. A matching marker means already applied; do not infer
  completion from global counts or compare editable fields to the original CSV. Conflicting
  original IDs without a marker or a changed checksum fail explicitly rather than overwrite data.
- [x] Keep inventory import and task 6's demo-account bootstrap independently versioned and
  idempotent. Adding the account phase must work over an already imported database. Neither
  phase overwrites user edits, resets an existing password, recreates a deleted tenant, or
  reactivates retained records. Return original import counts from the marker on a no-op.
- [x] Fix time through dependency injection in unit/API tests; do not expose a public clock
  override. Browser write journeys will choose dates relative to API today on newly created
  listings, so the fixed historical CSV does not eventually make those journeys fail.
- [x] Keep demo seeding opt-in and refuse it under production configuration without an explicit
  demo-data switch. Do not put privileged credentials into the web image. Extend the one-off
  Compose job to run migrations followed by the enabled local seed.
- [x] Run unit/time-zone tests, `npm run test:integration -w apps/api -- test/seed.test.ts`,
  lint/typecheck, and clean-volume local startup. Inspect counts using the intended runtime
  roles. Add the seed tests to the existing CI integration job. Commit the seed and date/availability functions.

## Stage 2 — Complete public portal

### Task 4: Public search, facets, detail, and availability API

**Create:** `packages/contracts/src/{listing,availability,pagination}.ts`,
`apps/api/src/listings/{listings.controller,listings.service,listings.repository,listing.mapper}.ts`,
`apps/api/src/availability/{availability.service,availability.repository}.ts`,
`apps/api/test/public-listings.test.ts`.

**Interfaces:** `ListingSearch = { city?: string; guests?: number; minPriceCents?: number;
maxPriceCents?: number; from?: IsoDate; to?: IsoDate; page: number; pageSize: number }`;
`ListingView = ListingDto & { description: string | null; version: number }`.
`GET /t/:slug/listings` returns `Page<ListingDto> & { today: IsoDate }`;
`GET /t/:slug/listings/facets` returns `{ cities: string[] }`;
`GET /t/:slug/listings/:id` returns `ListingView`;
`GET /t/:slug/listings/:id/availability?from&to` returns
`{ today: IsoDate; days: { date: IsoDate; available: boolean }[] }`.
All routes have the `/api/v1` prefix.

- [x] Write real-HTTP fixtures for two tenants, archived listings, capacity/price/city filters,
  combined filters, pagination totals, foreign IDs, and every overlap boundary. Run
  `npm run test:integration -w apps/api -- test/public-listings.test.ts` and observe failures.
  Given a confirmed stay on October 1–4 and no other occupancy on the fixture listing:

  ```ts
  const response = await request(app.getHttpServer())
    .get(`/api/v1/t/${tenantA.slug}/listings`)
    .query({ from: '2026-10-04', to: '2026-10-06' }).expect(200);
  expect(response.body.items.map((item: ListingDto) => item.id)).toContain(listingA.id);
  const occupied = await request(app.getHttpServer())
    .get(`/api/v1/t/${tenantA.slug}/listings`)
    .query({ from: '2026-10-03', to: '2026-10-06' }).expect(200);
  expect(occupied.body.items.map((item: ListingDto) => item.id)).not.toContain(listingA.id);
  ```
- [x] Define strict schemas: page >= 1, pageSize 1–50 (default 20), valid UUIDs, bounded strings,
  integer cents, paired dates, `from < to`, maximum span 366 nights. Reject unknown query keys.
  Search with past dates remains a valid historical query; the picker guides new future searches.
- [x] Implement one shared search predicate for results and totals, stable title/id ordering,
  and tenant-scoped city facets. Use a bound `NOT EXISTS` overlap predicate:

  ```sql
  NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.tenant_id = l.tenant_id AND b.listing_id = l.id
      AND b.status <> 'cancelled'
      AND b.check_in < $to AND b.check_out > $from
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocked_days d
    WHERE d.tenant_id = l.tenant_id AND d.listing_id = l.id
      AND d.date >= $from AND d.date < $to
  )
  ```

- [x] Map rows explicitly, converting database decimals/dates deliberately. Both archived and
  foreign public detail IDs answer the same resource-not-found response. Public availability
  exposes availability only, never booking or host details.
- [x] Compare SQL search and HTTP calendar results with `isFree` using identical fixtures.
  Add seeded-data smoke assertions calculated from the input CSVs, without borrowing unverified
  golden counts from the old spec.
- [x] Run focused/full integration tests, unit tests, lint/typecheck. Inspect indexes and query
  plans for the actual search on seeded data; add only indexes justified by predicates and plans.
  Commit the public API.

### Task 5: Search and detail screens with accessible date controls

**Create:** `apps/web/src/lib/{api,format}.ts`,
`apps/web/src/app/{TenantProvider,PortalLayout,ErrorScreen}.tsx`,
`apps/web/src/features/portal/{SearchPage,ListingPage,Filters,ListingCard}.tsx`,
`apps/web/src/components/{MonthCalendar,DateRangeField,Pagination}.tsx`,
`apps/web/src/features/portal/portal.test.tsx`, `apps/web/src/components/calendar.test.tsx`,
`apps/web/src/test/{setup,server}.ts`, `playwright.config.ts`, `e2e/portal.spec.ts`.
**Modify:** root browser-test script, Compose test configuration, and CI.

**Interfaces:** `api.get<T>(path: string, query?: Record<string, unknown>): Promise<T>` and
`ApiProblem` preserving `ApiError`; `DateRangeField` uses controlled
`value: { from: IsoDate | null; to: IsoDate | null }` and emits that same shape, including clears.
`MonthCalendar` receives month, API days, today, optional selection and callbacks; it does no fetching.
The search form separates draft dates from effective URL filters. Clearing either input
removes both date parameters from the URL/query and resets the page to 1. An incomplete new
selection remains a draft; only a valid pair is submitted. Back/forward navigation restores
the effective pair into the controls. Direct API queries with only one date still receive 400.

- [x] Write component tests with intercepted HTTP responses for filtering, empty/error/loading
  states, wrong tenant, URL restoration, clearing either date, leap month, and keyboard navigation.
  Run `npm test -w apps/web -- src/features/portal/portal.test.tsx src/components/calendar.test.tsx`
  and observe missing-behavior failures.
  Pin the controlled-component boundary directly:

  ```tsx
  const onChange = vi.fn();
  const { rerender } = render(<DateRangeField
    value={{ from: '2026-10-01', to: '2026-10-04' }}
    today="2026-09-22" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Check-in'), { target: { value: '' } });
  expect(onChange).toHaveBeenCalledWith({ from: null, to: '2026-10-04' });
  rerender(<DateRangeField value={{ from: '2026-11-01', to: '2026-11-04' }}
    today="2026-09-22" onChange={onChange} />);
  expect((screen.getByLabelText('Check-in') as HTMLInputElement).value).toBe('2026-11-01');
  ```
- [x] Add a search-level test starting on page 2 with an active date range. Clear each input
  in separate cases and assert that both URL date parameters disappear, page resets to 1,
  and the next intercepted API request has neither date. Enter just one new date and assert
  no partial-range request is sent; complete the pair and verify exactly that pair is applied.
- [x] Implement the API client, tenant provider, and error handling. Query keys always include
  tenant slug and effective filters. Changes to URL search parameters drive fetching; form
  drafts do not silently diverge from submitted URL values:

  ```tsx
  const [params, setParams] = useSearchParams();
  const filters = parseSearchParams(params);
  const results = useQuery({
    queryKey: ['listings', slug, filters],
    queryFn: () => api.get(`/t/${slug}/listings`, filters),
  });
  // Filters.tsx defines parseSearchParams(params: URLSearchParams): ListingSearch
  // and toSearchParams(filters: ListingSearch): URLSearchParams using task 4 defaults.
  const submit = (next: ListingSearch) => setParams(toSearchParams({ ...next, page: 1 }));
  ```

- [x] Build search cards, filters, and pagination. Keep integer cents in submitted state;
  convert decimal price input with string parsing, rejecting excess fractional digits. Format
  output with Intl. Display rating null as an unrated listing, not zero stars.
- [x] Build detail and two-month availability. Fetch each displayed month explicitly; missing
  data displays loading, not availability. Use controlled date props and fixed-reference date
  parsing; reject past clicks in the picker and synchronize external value changes. Label the
  tenant business date and timezone; keep historical months browsable in the availability view.
- [x] Keep the UI responsive and keyboard operable. Verify an unknown tenant, archived detail,
  server failure, and slow response. Add a visible sign-in entry point only when task 7 lands.
- [x] Establish Playwright now with one real-stack portal journey: filter, open detail, navigate
  calendars, clear a date, and use browser back/forward. Add it to CI with failure traces.
  Use isolated Compose/test data; no public endpoint controls the application's clock.
- [x] Run web tests, lint/typecheck/build, `npm run test:browser`, and inspect narrow-screen
  layout against the real seeded stack. Commit the portal and its first browser check.

## Stage 3 — Identity, access, and saved listings

### Task 6: Sessions, authentication, and permissions API

**Create:** `apps/api/prisma/migrations/003_identity/migration.sql`,
`packages/contracts/src/{auth,permissions}.ts`,
`apps/api/src/identity/{identity.module,passwords,sessions.repository,auth.service,auth.controller,session.guard,permissions.guard}.ts`,
`apps/api/src/admin/{admin.module,platform-auth.controller,platform-auth.service,platform-sessions.repository}.ts`,
`apps/api/src/common/http/csrf.guard.ts`, `apps/api/test/auth.test.ts`,
`apps/api/src/identity/permissions.test.ts`.
**Modify:** Prisma schema, config, module registration, seed, and integration CI.

**Interfaces:** `Principal = { id: string; realm: 'tenant' | 'platform'; tenantId: string | null;
role: 'client' | 'host' | 'superadmin'; mustChangePassword: boolean; permissions: Permission[] }`;
guards attach a validated principal. Tenant `/auth/register`, `/auth/login`, `/auth/logout`,
`/auth/me`, `/auth/password` routes sit beneath `/t/:slug`; platform login/logout/me/password
sit beneath `/admin/auth`. Registration never accepts a role. `me` returns the principal.

- [x] Write HTTP tests for registration, wrong password, same email in two tenants, session
  crossover, expiration, logout, password change, role injection, missing CSRF, and throttling.
  Run `npm run test:integration -w apps/api -- test/auth.test.ts` and observe failures.
  Capture `cookieA` from a real login on tenant A; replay it against tenant B:

  ```ts
  await request(app.getHttpServer()).get(`/api/v1/t/${tenantB.slug}/auth/me`)
    .set('Cookie', cookieA).expect(401);
  await request(app.getHttpServer()).post(`/api/v1/t/${tenantA.slug}/auth/logout`)
    .set('Cookie', cookieA).expect(403); // Missing Origin and X-Requested-By.
  ```
- [x] Use separate tenant-user/tenant-session and platform-user/platform-session tables.
  Tenant users have non-null tenant IDs; composite session/user foreign keys prevent realm
  mismatch without nullable-key exceptions. Tenant tables use RLS. Only platform identity and
  administration access platform tables through the restricted privileged pool. Tenant users
  include `disabledAt` and a credential version; session issuance checks both after acquiring
  the user lock. Only privileged account administration can change role or disabled state.
- [x] Implement Argon2id and 32-byte random session tokens. Hash tokens with SHA-256 for lookup,
  expire at seven days, and never refresh expiration silently. Cookies use distinct tenant-ID
  and platform names, HttpOnly, SameSite=Lax, and Secure when served through HTTPS. Session
  lookup still validates the realm, live user, and live tenant regardless of cookie name.
- [x] Implement permissions as a small explicit mapping and keep authorization separate:

  ```ts
  const rolePermissions: Record<Principal['role'], Permission[]> = {
    client: ['saved-listings:manage'],
    host: ['saved-listings:manage', 'listings:manage', 'calendar:manage', 'bookings:read'],
    superadmin: ['tenants:manage', 'accounts:manage'],
  };
  // Test each protected route with a client, foreign host, own host, and superadmin.
  ```

- [x] Apply same-origin/custom-header CSRF checks before browser mutations, including login and
  registration. Set configurable per-IP and per-account login limits and per-IP registration
  limits before expensive hashing. Bound authenticated password-change/reset attempts by actor
  and target account as applicable. Return Retry-After and use indistinguishable login failures
  for unknown, disabled, and wrong-password accounts. Use a dummy password hash check for
  unknown accounts. Validate password length before hashing; test each limit without sleeps.
- [x] Make every tenant identity mutation participate in task 2's shared live-tenant coordination
  from the outset: registration, session issuance, password changes, and logout. Tenant locks
  precede user locks. Platform identity has no tenant lock but uses the same user-race protection.
- [x] Coordinate login session issuance and password change on the same user row in both realms.
  Password hashing/verification may happen before the transaction to avoid holding locks during
  expensive work; once locked, re-read and compare the credential version/hash used in validation
  and revalidate session/account state. Reject stale verification. Password change updates the
  hash, revokes existing sessions, and issues its replacement in that transaction. A delayed
  old-password login must not create a usable session after the password change commits.
- [x] Add transaction-barrier tests in both realms: pause login after old-password verification,
  commit a password change, then resume login and require rejection with no new session. Test
  the opposite ordering (login commits first, then its session is revoked), and concurrent
  password changes (the stale verification cannot overwrite the winner). Use no timing sleeps.
- [x] Restricted first-login sessions can only change password, inspect their own session, or
  log out. This restriction applies equally to clients and hosts after an assisted reset or
  promotion; task 11 reuses it. A disabled user cannot sign in or use an existing session.
  Bootstrap local demo accounts as a separate transactionally marked initialization
  phase from task 3's inventory import. Test upgrading an inventory-only database and rerunning
  after a password change; neither inventory edits nor passwords may be overwritten. Keep
  credentials out of logs and add tests for privileged-role misuse and credential leakage.
- [x] Run auth integration tests, unit tests, lint/typecheck, and the complete API suite. Commit
  identity and permission enforcement. Do not claim tenant isolation from unit tests alone.

### Task 7: Registration, sign-in, and account UI

**Create:** `apps/web/src/features/auth/{AuthProvider,LoginPage,RegisterPage,AccountPage,PasswordPage,RequirePermission}.tsx`,
`apps/web/src/features/auth/auth.test.tsx`.
**Modify:** router, layouts, API client, and browser tests (`e2e/auth.spec.ts` is introduced here).

**Interfaces:** `api.post/put/patch/delete<T>(path, body?)` attaches CSRF headers and same-origin
credentials; mutations are not automatically retried. `AuthProvider` scopes cached state by
realm, tenant, and principal ID. `RequirePermission` is UX only; the server remains authoritative.

- [x] Write failing component tests for field errors, 401 reset, 429 feedback, temporary-password
  restriction, realm changes, and logout clearing private cached data.
  Use a test-owned protected fixture route, not the host inventory page introduced in task 9.
  First prove an unrestricted host sees its marker. With `mustChangePassword=true`, prove
  the marker is replaced by the password-change screen:

  ```tsx
  expect(await screen.findByRole('heading', { name: 'Change your password' })).toBeTruthy();
  expect(screen.queryByText('Protected host content')).toBeNull();
  ```
- [x] Implement public/client navigation, host/admin entry points, forms, and session loading.
  Add an account page with identity, password-change, and logout controls. On logout, 401, or
  principal change, cancel in-flight private queries and clear the old account's private cache
  in that realm. An old response must not repopulate another account's cache. Do not keep
  passwords or tokens in persistent browser storage.
- [x] Preserve safe relative return paths after login; reject cross-origin return URLs. Route
  every `mustChangePassword` principal directly to password change, including reset clients.
  Submit forms once and surface API field errors.
- [x] Extend browser CI with registration, login, password change, logout and cross-portal
  navigation. Run `npm test -w apps/web -- src/features/auth/auth.test.tsx`, lint/typecheck/build,
  and the authentication browser journey.
  Commit the authentication UI.

### Task 8: Private saved listings for clients and hosts

**Create:** `apps/api/prisma/migrations/004_saved_listings/migration.sql`,
`packages/contracts/src/saved-listings.ts`,
`apps/api/src/saved-listings/{saved-listings.module,saved-listings.controller,saved-listings.service,saved-listings.repository}.ts`,
`apps/api/test/saved-listings.test.ts`, `apps/web/src/features/saved/{SavedListingsPage,SaveButton}.tsx`,
`apps/web/src/features/saved/saved-listings.test.tsx`, `e2e/saved-listings.spec.ts`.
**Modify:** Prisma schema, tenant database wrapper, router, listing cards/detail, account navigation,
contracts barrel, and browser CI.

**Interfaces:** tenant routes `/t/:slug/me/saved-listings` GET and `/:listingId` PUT/DELETE,
all requiring an unrestricted tenant session and `saved-listings:manage`.
PUT saves an active listing idempotently and returns 204; DELETE removes only the caller's
entry and returns 204 even when absent. GET returns `Page<SavedListingView>`, sorted by saved
time then listing ID, where
`SavedListingView = { listingId: string; savedAt: string; listing: ListingDto | null }`.
`listing: null` means unavailable; no archived listing facts or public detail link are exposed.
GET supports the standard bounded pagination and an optional, at-most-50 `listingIds` UUID
filter so cards can fetch their saved state in one request. Its response remains account-scoped.
`TenantDb.runForUser<T>(tenantId: string, userId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>`
sets tenant and user context transaction-locally; IDs come from the validated principal, never
from client ownership fields.

- [x] Write failing API tests with two clients and a host in tenant A and one client in tenant B.
  Cover save/remove, duplicate PUT, missing DELETE, anonymous/restricted sessions, foreign and
  archived listing IDs, pagination, and rejected `userId`/`tenantId` input. Run
  `npm run test:integration -w apps/api -- test/saved-listings.test.ts` and observe failures.
  Save a fixture listing as A's first client; with that client's valid session cookie:

  ```ts
  await request(app.getHttpServer()).put(`/api/v1/t/${tenantA.slug}/me/saved-listings/${listingA.id}`)
    .set('Cookie', firstClientCookie).set('Origin', appOrigin)
    .set('X-Requested-By', 'greenstate-web').expect(204);
  const other = await request(app.getHttpServer())
    .get(`/api/v1/t/${tenantA.slug}/me/saved-listings`).set('Cookie', secondClientCookie).expect(200);
  expect(other.body.items).toEqual([]);
  // Repeat the read and removal attempt as the tenant's host; the first client's row remains.
  ```

- [x] Add a unique `(tenant_id, user_id, listing_id)` record with a saved timestamp and composite
  foreign keys to both tenant user and listing. Require tenant AND user context in its RLS
  USING/WITH CHECK policies. Repositories also filter by the authenticated owner. Under the
  ordinary role, prove missing user context, another user, and reused pooled connections cannot
  expose or modify a previous user's rows. No host permission grants access to other shortlists.
- [x] Implement shared live-tenant coordination for PUT/DELETE. PUT locks the listing after
  tenant coordination and checks that it is active, coordinating with task 9's archive path;
  archived/foreign/missing listings return the same not-found response. DELETE can remove an
  existing unavailable entry. Neither request accepts a user ID or tenant ID as ownership input.
- [x] Retain saved rows when a listing is archived. The owner list returns an unavailable entry
  with a remove action, no booking/details payload, and no detail link; restoration exposes the
  active listing again. Test with database archive fixtures here, then real archive/restore
  endpoints in task 9. Tenant deletion blocks access while retaining rows.
- [x] Build Save/Remove controls on portal cards/detail and a paginated Saved listings page.
  Anonymous users are sent through sign-in using a safe relative return path and can then save;
  no unauthenticated pending save is stored. Hosts retain these controls alongside their panel.
  Query keys include tenant, principal ID, and filters; use task 7's cancellation/cache clearing
  on account changes. Test a delayed response from one account cannot populate another's page.
- [x] Add component and browser checks for save→reload→saved page→remove, unavailable entries,
  empty/error/loading states, and two same-tenant accounts. Run API/web checks, lint/typecheck,
  build, and `npm run test:browser`; add the new journey to CI. Commit the complete shortlist.

## Stage 4 — Host workflows

### Task 9: Create, edit, archive, and restore listings

**Create:** `packages/contracts/src/host-listings.ts`,
`apps/api/src/listings/{host-listings.controller,host-listings.service}.ts`,
`apps/api/test/host-listings.test.ts`,
`apps/web/src/features/host/{HostLayout,ListingsPage,ListingForm}.tsx`,
`apps/web/src/features/host/listings.test.tsx`.
**Modify:** listing repository/schema, router, API client, and browser suite (`e2e/host.spec.ts`).

**Interfaces:** `/t/:slug/host/listings` supports GET/POST; `/:id` supports GET/PATCH;
`/:id/archive` and `/:id/restore` use POST. `ListingWrite` includes title, description, city,
country, latitude, longitude, propertyType, maxGuests, bedrooms and pricePerNightCents.
New listings have EUR, null rating, zero reviews and the tenant's current creation date.
PATCH/archive/restore require the expected `version`.
Host inventory GET accepts `status=active|archived|all`, default active. Archived entries remain
discoverable after reload and their links target host detail/edit/calendar routes.
Archiving is allowed with active or future bookings; confirmation warns that existing stays
remain unchanged and accessible to hosts. It never cancels bookings or deletes saved entries.

- [x] Write failing API tests for host/client/foreign-host permissions, validation, creation,
  optimistic concurrency and archive/restore visibility. Add a form test for a stale-version response.
  Use two authorized requests with the same `version`, Origin and CSRF headers; regardless of
  completion order, assert:

  ```ts
  const responses = await Promise.all([firstEdit, secondEdit]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
  expect(responses.find(response => response.status === 409)?.body.code).toBe('STALE_VERSION');
  ```
- [x] Add capacity-edit tests with a fixed tenant-local today: reject a reduction below guests
  on any noncancelled booking with `checkOut > today`, including a stay already in progress.
  Allow equal capacity, cancelled-only conflicts, and bookings checking out today or earlier;
  preserve every historical booking unchanged. Return `409 CAPACITY_CONFLICT` for a protected
  stay and explain the conflicting capacity in the form without changing the user's input.
- [x] Implement tenant-owned mutations and explicit field allowlists. Reject attempts to change
  tenant, rating, reviews, or ID. Within the tenant-coordinated transaction, acquire the listing
  row lock, check capacity against its bookings, then apply the atomic version predicate:

  ```ts
  const changed = await tx.listing.updateMany({
    where: { id, tenantId, version: expectedVersion },
    data: { ...validatedFields, version: { increment: 1 } },
  });
  // Zero rows: scoped existence check distinguishes not-found from stale version.
  ```

- [x] Reuse task 2's shared live-tenant advisory coordination for mutations. Do not add a row
  lock on the SELECT-only tenant table. Coordinate archive/calendar/capacity changes with a
  listing-row lock after the tenant lock. Recheck live tenant and ownership inside the transaction.
- [x] Build the inventory table, create/edit forms and explicit archive/restore actions.
  Preserve user input on a conflict; offer to reload the server's current version. Allow editing
  archived inventory but no new calendar blocks until restored. Add an Archived filter/tab;
  navigate away and reload before finding and restoring an archived listing in the test.
- [x] Test archiving with an active and a future noncancelled booking: confirmation explains
  the effect, the API succeeds, booking rows are unchanged, and host links still work. Using
  task 8's client account, verify saved→archive→unavailable/removable→restore→available. Also
  race save with archive under the listing lock; never create a new save after archive wins.
- [x] Now that the real host route exists, test first-login restrictions against that route
  with a positive control showing an unrestricted host can reach Create listing. Extend the
  host browser journey with create/edit/archive/rediscover/restore and run it in CI.
- [x] Run `npm run test:integration -w apps/api -- test/host-listings.test.ts`, relevant web
  tests, lint/typecheck, and verify create→public visibility→archive→hidden→restore in the browser.
  Commit the inventory workflow.

### Task 10: Host calendar and booking views

**Create:** `packages/contracts/src/{host-calendar,bookings}.ts`,
`apps/api/src/availability/{host-calendar.controller,host-calendar.service}.ts`,
`apps/api/src/bookings/{bookings.controller,bookings.service,bookings.repository}.ts`,
`apps/api/test/host-calendar.test.ts`, `apps/api/test/bookings.test.ts`,
`apps/web/src/features/host/{CalendarPage,BookingsPage}.tsx`,
`apps/web/src/features/host/calendar.test.tsx`.

**Interfaces:** `GET /t/:slug/host/listings/:id/calendar?from&to` returns dated available/booked/
blocked cells plus API today; `POST /t/:slug/host/listings/:id/blocks` accepts `{ date, reason?: string }`;
`DELETE /t/:slug/host/listings/:id/blocks/:blockId` removes that block. `GET /t/:slug/host/bookings` returns
`Page<BookingDto & { listingTitle: string }>` with optional listing/date/status filters.

- [x] Write failing integration tests for occupied/past/duplicate block rejection, cancellation,
  removal, concurrent duplicate submissions, archive races, foreign IDs, and booking read-only
  behavior. Verify changing blocks immediately changes public availability/search.
  With the clock fixed before October 10, POST two authorized blocks for the same free day:

  ```ts
  const results = await Promise.all([firstBlockRequest, secondBlockRequest]);
  expect(results.map(result => result.status).sort()).toEqual([201, 409]);
  const calendar = await request(app.getHttpServer())
    .get(`/api/v1/t/${tenantA.slug}/listings/${listingA.id}/availability`)
    .query({ from: '2026-10-10', to: '2026-10-11' }).expect(200);
  expect(calendar.body.days).toEqual([{ date: '2026-10-10', available: false }]);
  ```
- [x] Inside one tenant-scoped transaction, acquire shared live-tenant advisory coordination
  then the listing-row lock, check archive state and today from the freshly read tenant
  configuration, then check overlap and
  write the block. Removing blocks follows the same lock order. Enforce a unique
  `(tenant_id, listing_id, date)` constraint and map duplicate violations to 409.
- [x] Booked cells show read-only booking information; blocked cells allow removal. The UI
  invalidates affected calendar/search queries after a mutation and never predicts success
  after a rejected write. Use the shared calendar with explicit click permissions.
- [x] Build paginated booking views with readable dates/status and listing links. There are no
  booking mutation routes. Keep cancelled bookings visible with their status. Listing links
  use host routes and work for archived inventory; historical guest counts are not rewritten
  when current capacity changes.
- [x] Label date cutoffs as the tenant business date and show the configured timezone. Display
  imported booking status separately from a date-derived past/current/future label; a confirmed
  stay with checkout on/before today is past. Add a fixture for this combination and permit
  historical calendar navigation so supplied bookings remain inspectable as the data ages.
- [x] Extend the host browser journey with block/removal and booking history, including archived
  listing navigation. For new blocks, choose dates relative to API today on a new listing.
- [x] Run focused API/web tests, the full host suite, lint/typecheck, and verify the workflow
  in a browser using a seeded host. Commit calendar and bookings.

## Stage 5 — Administration and delivery

### Task 11: Tenant and account administration, including recovery and soft deletion

**Create:** `packages/contracts/src/admin.ts`,
`apps/api/src/admin/{tenants.controller,tenants.service,tenants.repository,accounts.controller,accounts.service,recover-platform-admin}.ts`,
`apps/api/test/{admin,account-lifecycle,platform-recovery}.test.ts`,
`apps/web/src/features/admin/{AdminLayout,TenantsPage,TenantForm,AccountsPage,HostForm,ResetPasswordForm}.tsx`,
`apps/web/src/features/admin/admin.test.tsx`.
**Modify:** identity services, seed regression tests, root scripts, README, and admin browser journey.

**Interfaces:** `/admin/tenants` GET/POST; `/admin/tenants/:id` GET/PATCH/DELETE;
`/admin/tenants/:id/hosts` POST creates a host;
`/admin/tenants/:id/accounts` GET provides paginated account metadata with role/email filters.
Under `/admin/tenants/:id/accounts/:userId`, POST `/disable` and `/enable` accept host accounts
only, POST `/password-reset` accepts clients or hosts, and POST `/promote-host` accepts an
existing client. Reset and promotion accept `{ temporaryPassword: string }` and return 204,
never credentials. The caller must have platform `accounts:manage`; ordinary hosts cannot
administer accounts or read other users' saved data. Repeated disable/enable is idempotent;
promotion of a non-client returns 409. Disable/enable of a client returns 400.
Tenant creation input is name, slug, timezone, optional
colour/contact. Tenant update excludes slug; submitted slug changes receive 400 validation errors.
Host input is name, email and temporary password; the API forces host role and first-login change.
Tenant DELETE returns 204 after soft deletion and session revocation.
`npm run admin:recover -- --email admin@example.test` recovers an existing platform account
using explicitly supplied database-administration credentials and a new password from a hidden
terminal prompt (stdin in controlled tests). It never creates accounts or runs as an HTTP route.

- [x] Write failing API tests for all admin permissions, duplicate/reserved slugs, invalid
  timezone/colour, host provisioning and soft deletion. Test a logged-in host's next request
  after deletion and an overlapping host write with transaction barriers, not timing sleeps.
  After deleting a fixture tenant through an authenticated admin request, assert both access
  denial and retention using the privileged test reader:

  ```ts
  await request(app.getHttpServer()).get(`/api/v1/t/${tenantA.slug}`).expect(404);
  await request(app.getHttpServer()).get(`/api/v1/t/${tenantA.slug}/auth/me`)
    .set('Cookie', hostCookie).expect(404); // Tenant resolution fails before session lookup.
  expect(await adminDb.listing.count({ where: { tenantId: tenantA.id } })).toBe(1);
  expect(await adminDb.tenantSession.count({
    where: { tenantId: tenantA.id, revokedAt: null },
  })).toBe(0);
  ```
- [x] Implement platform-only administration. Slugs are unique across live and deleted tenants;
  reserve route words such as `admin` and `api`. Slugs are immutable after creation. Exclude
  slug from the strict update schema and show it read-only in the edit form. Test rejected
  rename attempts and reuse after deletion. Use safe colour validation and plain text names.
- [x] Tenant deletion takes task 2's exclusive tenant advisory lock, checks current state,
  sets `deleted_at`, and revokes all tenant sessions in one privileged transaction. It uses
  the same immutable-ID key and explicit READ COMMITTED isolation as ordinary mutations.
  Configuration updates take the exclusive tenant lock so timezone changes are ordered with
  date-dependent writes. Host provisioning and account lifecycle actions take shared tenant
  coordination, then the affected user lock; all recheck the live tenant after locking. They
  cannot recreate access after deletion. Identity, saved-list, and host operations already
  participate from their own tasks. Test both orderings of deletion versus registration/login,
  host creation, saved-list mutations, reset/promotion/enable, and listing/block writes.
  A mutation that commits first may succeed; once deletion commits, waiting/new
  mutations must reject. This does not promise to retract already authorized in-flight reads.
- [x] Provision hosts with Argon2id and `mustChangePassword=true`. The temporary password never
  appears in logs or responses. A same-tenant existing email returns `409 ACCOUNT_EXISTS`
  without changing its account; the UI offers a separate explicit promotion for a client.
  Do not make superadmin a universal host role.
- [x] Write failing lifecycle tests for platform permissions, foreign user IDs, disabled login,
  existing-session rejection, re-enable without session resurrection, reset of both roles,
  and promotion preserving account ID/saved rows. Run
  `npm run test:integration -w apps/api -- test/account-lifecycle.test.ts` and observe failures.
  Using an admin session with Origin/custom-header checks, reset a client that has a saved row:

  ```ts
  await request(app.getHttpServer())
    .post(`/api/v1/admin/tenants/${tenantA.id}/accounts/${clientA.id}/password-reset`)
    .set('Cookie', adminCookie).set('Origin', appOrigin).set('X-Requested-By', 'greenstate-web')
    .send({ temporaryPassword: newTemporaryPassword }).expect(204);
  await request(app.getHttpServer()).get(`/api/v1/t/${tenantA.slug}/auth/me`)
    .set('Cookie', oldClientCookie).expect(401);
  // Log in using the temporary password: me/logout/password work; saved-list reads return 403
  // until password change succeeds. The account ID and saved row remain unchanged.
  ```

- [x] Disable a host by setting `disabledAt` and revoking every tenant session atomically.
  Re-enable only clears disabled state; it does not restore revoked sessions or clear a pending
  password-change requirement. Retain its role, account ID, and saved rows. Subsequent requests
  must fail while disabled; already-authorized in-flight operations may finish. This is distinct
  from the stronger tenant-deletion write coordination. Do not introduce account deletion or demotion.
- [x] Reset either tenant role with a new Argon2id hash/credential version, revoke all sessions,
  and set `mustChangePassword=true`, without clearing `disabledAt`. Promotion applies the same
  reset while explicitly changing client to host and preserving its account/saved data. Never
  retain the old password on promotion: an unverified email match does not establish identity.
  Require admin confirmation of identity and safe temporary-password delivery outside the app;
  add no email subsystem. No reset/promotion response issues a tenant session to the admin.
  Apply task 6's actor/target throttling before hashing for host provisioning, reset, and
  promotion, with API tests proving excess attempts receive 429 without performing the hash.
- [x] Reuse task 6's user-row coordination. Extend transaction-barrier cases for delayed login
  and password change versus reset/promotion/disable: stale validated credentials cannot issue
  sessions or overwrite the new credential, and login-first sessions are revoked by the later
  operation. Include disabled reset→still disabled→enable→forced password change. Test old
  passwords, old cookies, saved-list privacy, and client/host permissions after every transition.
- [x] Implement the local platform recovery command with explicit database-administration
  credentials unavailable to the web image. Read the replacement password without echo; reject
  password command-line flags, redact failures, and never print hashes/tokens/passwords. Lock
  the existing platform user, update its password/version and revoke sessions atomically using
  task 6's race protection. Fail on unknown account or missing/insufficient credentials. Run
  `npm run test:integration -w apps/api -- test/platform-recovery.test.ts`; verify captured output
  contains no secret, old login/session fails, replacement login works, and a delayed old login
  cannot survive recovery. Document invocation and required credentials in README.
- [x] Build admin tables/forms and an explicit deletion confirmation naming the tenant and
  explaining that access is disabled while records are retained. Tenant branding is applied
  through validated values, never injected HTML or arbitrary CSS.
- [x] Build account search/filter, host disable/enable controls, assisted reset, and explicit
  promotion confirmation. Show role/disabled state and explain session revocation and required
  password change. Display no other account's saved list. Keep recovery credentials out of
  URL parameters, persistent browser state, telemetry, and logs; clear password inputs on success.
- [x] Add the new-tenant→host first-login→listing visibility journey in `e2e/admin.spec.ts` and
  CI now. Add client→save→promote→temporary-password change→host access with shortlist retained,
  host disable/re-enable, and assisted client reset to the real-browser coverage. Extend seed
  restart tests after soft deletion, host disabling, promotion, and reset: no reactivation, role
  rollback, or credential reset.
- [x] Run `npm run test:integration -w apps/api -- test/admin.test.ts test/account-lifecycle.test.ts test/platform-recovery.test.ts`, admin component tests,
  all identity/host regressions, lint/typecheck, and manually create a new tenant and host.
  Sign in, change its password, create a listing and open its public page. Commit administration.

### Task 12: Complete browser and security regression verification

**Create:** `e2e/security.spec.ts`.
**Modify:** existing Playwright configuration, portal/auth/saved/host/admin journeys, CI, root scripts,
Compose test configuration, and API integration tests where failures are found.

**Interfaces:** browser tests target the nginx-served app and real PostgreSQL. Seed fixtures
have stable IDs; created tenant/host/listing identifiers are unique per run. Tests do not reset
the shared database between parallel journeys.

- [x] Review and complete the portal, authentication, saved-list, host, and admin journeys introduced with
  their features. Add missing cross-feature scenarios rather than rebuilding a late test harness.
  After the admin/host setup in `e2e/admin.spec.ts`, an anonymous browser must find the unique
  listing only on its new tenant's portal:

  ```ts
  await page.goto(`/${createdSlug}`);
  await expect(page.getByRole('link', { name: createdListingTitle })).toBeVisible();
  await page.goto(`/${otherTenantSlug}`);
  await expect(page.getByRole('link', { name: createdListingTitle })).toHaveCount(0);
  ```
- [x] Add browser checks for anonymous protected routes, client forbidden actions, session
  crossover, same-tenant saved-list privacy, disabled accounts, soft-deleted tenant access,
  and logout/reset/disable in another tab. Invalidate auth state on
  relevant window focus and react to subsequent 401s. Fail journeys on unexpected console errors.
- [x] Run `npm run test:browser` twice against the same seeded stack. A repeat run must not
  depend on manual cleanup. Use bounded waits for UI/network state, not arbitrary sleeps.
- [x] Verify the CI pipeline grown from task 1 includes clean install, lint, typecheck,
  unit/component, real-database integration (including seed), build, and all selected browser
  journeys. Collect failing browser traces.
  Run role tests under restricted connections; schema/role provisioning uses owner credentials,
  while runtime host provisioning and lifecycle tests use the non-superuser privileged role.
- [x] Execute malformed JSON, unexpected keys, SQL-injection strings, XSS-like text, CSRF,
  unauthorized ownership/role changes, missing tenant/user context, expensive-auth throttling,
  and credential-redaction regressions (including reset/promotion/recovery input).
  Test ordinary-role misconfiguration refusal. Fix concrete failures with reproducing tests.
- [x] Run all checks, inspect an actual CI run once publishing is authorized, and distinguish
  local success from remote CI success in the report. Commit the verified automation and fixes.

### Task 13: Final usability, clean-start verification, and handoff

**Modify:** `README.md`, `.env.example`, Dockerfiles/nginx/Compose and the specific UI files
where verified usability defects occur. Do not add another process document.

- [x] Inspect portal, account/saved-list, host, and admin screens at mobile and desktop sizes, including empty and
  failure states. Complete forms and calendar actions by keyboard. Check focus, labels,
  contrast, status text, and destructive-action confirmation. Fix observed defects.
- [x] Review the complete diff against the design and original brief. Request an
  independent review using the selected execution workflow; investigate findings before changes.
- [x] Verify clean-volume startup with `docker compose -f compose.yaml up --build -d` using an
  isolated Compose project name so no existing developer database is destroyed. Verify a second
  startup preserves data and the migration job exits rather than running in the API process.
- [x] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`,
  `npm run build`, and `npm run test:browser`. If a check cannot run, report why and the scope
  left unverified. Inspect runtime role attributes, security headers and cookie settings.
- [x] Write concise README instructions: prerequisites, startup, demo accounts, seed behavior,
  useful commands, architecture, identity/isolation choices, soft deletion, limitations, and
  which features were verified. Explain saved-list privacy/unavailable entries, host disable versus
  tenant deletion, assisted reset/promotion and outside-app identity checking, local platform
  recovery, and the tenant business date. Preserve imported status and explain historical calendar
  browsing. Document local HTTP settings without calling them production-safe.
- [x] Commit reviewed fixes and docs. Present completion evidence and any remaining issues.
  Publishing/remote repository setup happens only through the user's chosen host and visibility.

## Coverage of the design

| Design requirement | Delivery tasks |
|---|---|
| All public portal features and URL-driven filters | 3, 4, 5, 12 |
| Tenant-local accounts, sessions, permissions, password changes | 6, 7, 11, 12 |
| Private saved listings for clients/hosts and owner isolation | 6, 7, 8, 12 |
| Unavailable saved entries across archive/restoration | 8, 9, 12 |
| Host listing creation/editing/archive/restore, including existing bookings | 9, 10, 12 |
| Individual blocked days and read-only bookings | 3, 10, 12 |
| Tenant configuration, host provisioning, soft deletion | 2, 11, 12 |
| Host disable/re-enable and assisted client/host reset | 6, 7, 11, 12 |
| Explicit promotion with new credentials and retained saved data | 6, 8, 11, 12 |
| Local platform-admin recovery and secret-safe invocation | 6, 11, 13 |
| RLS, composite keys, restricted roles, transaction boundaries | 2, 6, 8, 9, 10, 11, 12 |
| READ COMMITTED, separate lock/read statements, fresh tenant configuration | 2, 9, 10, 11 |
| Shared schemas, error handling, logging, health | 1, 2, 4, 6 |
| Input validation, CSRF, expensive-auth throttling, safe cookies | 1, 4, 6, 11, 12 |
| Correct dates/money, concurrent edits, availability agreement | 3, 4, 5, 9, 10 |
| Tenant business date, preserved booking status and historical browsing | 3, 5, 10, 13 |
| Paired date clearing and archived inventory rediscovery | 5, 9, 10 |
| Credential-change/lifecycle races and restart-safe initialization | 3, 6, 11 |
| Immutable slugs and capacity protection for active/future stays | 9, 11 |
| Accessible responsive screens and reliable states | 5, 7, 8, 9, 10, 11, 13 |
| Docker, repeatable seed, incremental CI/browser tests, review and README | 1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13 |
| Selective reuse without old agent/process framework | All tasks |

## Execution decision

The user approved the review decisions and selected hybrid execution. This remains a 13-task
plan with one integration owner, the bounded overlaps above, and independent review at the
database, identity, and final checkpoints. Implementation progress is preserved in the per-task commits and milestone pull requests. The
execution strategy changes scheduling and ownership, not feature scope or verification requirements.

# GreenState Development Task

Fresh implementation of the GreenState accommodation rental challenge.

Status: implementation is underway on `feat/foundation`. The API/frontend scaffold,
HTTP boundary tests, tenant-isolated PostgreSQL access, lifecycle coordination, and local Docker
startup, deterministic data import, and date/availability rules are implemented. Public portal
screens and account/host/admin features follow; remote CI has not run yet.

## Planning

- [Approved design](docs/superpowers/specs/2026-09-22-rental-system-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-22-rental-system-implementation.md)

Follow the 13-task plan, with one integration owner, bounded parallel work, and commits at
verified task boundaries. Foundation tasks 1–3 are complete. The next milestone is the public portal (tasks 4–5).

Use short-lived milestone branches, starting with `feat/foundation` for tasks 1–3.
Parallel work uses `feat/task-<number>-<short-name>` branches/worktrees based on the active
milestone. Sequential tasks receive their own verified commits without requiring extra branches.
Review each milestone through a pull request into `main`, preserving those commits; start the
next milestone from the updated `main`. The implementation plan lists all six milestone branches.

## Run locally

Install Docker with Compose v2 or newer, then run from the repository root:

```sh
docker compose up --build -d --wait
```

Open <http://localhost:8080>. The landing page reports the API connection through nginx;
`/api/health/live` returns `{"status":"ok"}`. The database-backed `/api/health/ready` endpoint reports readiness. Both application containers
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
files or conflicting original IDs fail rather than overwrite data. Account bootstrap will receive
its own completion marker in the identity milestone. Demo accounts do not exist yet.

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
npm run test:stack  # requires the running Compose stack
```

Tests use the same Nest application factory as production. The current suite covers liveness,
safe request metadata/error responses, the 32 KiB JSON body limit, startup configuration, and
frontend connection states. CI runs clean install, these checks, production builds, and real
PostgreSQL integration tests. Browser suites arrive with the corresponding product journeys.

After starting the local database, run:

```sh
npm run test:integration
```

The suite creates uniquely named `greenstate_test_*` databases and drops only those databases
afterward; it never resets the development database. It covers tenant/child-table isolation,
connection-context cleanup, restricted grants, constraints, startup credential rejection, tenant
resolution, real shared/exclusive lock contention, and deterministic import/retention. Test
database ownership matches Compose. `test:stack` verifies request-secret redaction through both
nginx and the API, including proxy-generated errors. Set `COMPOSE_PROJECT_NAME` and
`STACK_BASE_URL` if using a custom Compose project or port.

`infra/db/roles.sql` creates separate local migration (`gs_owner`), ordinary (`gs_app`), and
privileged (`gs_admin`) credentials. The ordinary role cannot bypass forced row-level security,
change ownership, modify the tenant registry, write bookings, or hard-delete listings. The
privileged role is not a superuser. Runtime startup rejects excessive role/schema privileges.
All coordinated transactions use READ COMMITTED explicitly; tenant writes take a shared advisory
lock, and lifecycle/configuration changes take the exclusive lock before rereading the tenant.
The privileged pool is kept out of ordinary feature-module providers. nginx logs allowlisted
method/path/status/request-ID metadata; its free-form per-request error logs are suppressed
because they include raw query strings. Proxy failures remain visible through HTTP status logs.

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

# GreenState Development Task

Fresh implementation of the GreenState accommodation rental challenge.

Status: implementation is underway on `feat/foundation`. The API/frontend scaffold,
HTTP boundary tests, local Docker startup, and basic CI configuration are implemented.
Tenant data and product features follow in the remaining tasks; remote CI has not run yet.

## Planning

- [Approved design](docs/superpowers/specs/2026-09-22-rental-system-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-22-rental-system-implementation.md)

Follow the 13-task plan, with one integration owner, bounded parallel work, and commits at
verified task boundaries. The next deliverable is the database isolation boundary (task 2).

Use short-lived milestone branches, starting with `feat/foundation` for tasks 1–3.
Parallel work uses `feat/task-<number>-<short-name>` branches/worktrees based on the active
milestone. Sequential tasks receive their own verified commits without requiring extra branches.
Review each milestone through a pull request into `main`, preserving those commits; start the
next milestone from the updated `main`. The implementation plan lists all six milestone branches.

## Run locally

Install Docker with Compose v2 or newer, then run from the repository root:

```sh
docker compose up --build -d
```

Open <http://localhost:8080>. The landing page reports the API connection through nginx;
`/api/health/live` returns `{"status":"ok"}`. Both application containers run as non-root.
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
```

Tests use the same Nest application factory as production. The current suite covers liveness,
safe request metadata/error responses, the 32 KiB JSON body limit, startup configuration, and
frontend connection states. CI runs clean install, these checks, and production builds. Database
and browser suites are added with their corresponding implementation tasks.

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

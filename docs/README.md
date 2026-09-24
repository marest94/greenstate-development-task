# Documentation guide

Start here for a short walkthrough of the implemented application. The [original challenge](../task-material/Full%20Stack%20Challenge.pdf) and [requirements map](requirements-map.md) show how the submission answers the brief. The [README](../README.md) remains the source for setup commands, demo credentials, and detailed API behavior.

## Start the application

From the repository root, with Docker Compose v2 or newer:

```sh
docker compose up --build -d --wait
```

Open <http://localhost:8080/greenstate>. The second seeded portal is <http://localhost:8080/citystays>; platform administration is at <http://localhost:8080/admin/login>. The local Compose stack imports the supplied data and creates the example accounts listed under [Local demo accounts](../README.md#local-demo-accounts). Those accounts require a password change on first sign-in. If their passwords were changed in this local database, use the changed credentials or a fresh demo stack; seed reruns preserve account changes.

The root page and `/api/health/live` provide quick connectivity checks. `/api/health/ready` also checks the database. `docker compose down` stops services while preserving the named database volume.

## A short review route

1. **Public portal:** On `/greenstate`, search by city, guests, price, and stay dates. Open a listing and inspect its availability. Try the same listing URL under `/citystays` to see the tenant boundary. Compare each portal's name, browser title, and readable primary-color treatment; public details do not display raw coordinates.
2. **Client:** Register a client or use the seeded client account. After sign-in, the default destination is the tenant root; a safe requested return path takes precedence, including after a required password change. Save a listing, open `/:slug/saved`, then sign out. Saved listings are private to the account and portal.
3. **Host:** Sign in with the seeded host account; the default destination is `/:slug/host/listings`. Create a listing and follow the success link in inventory to edit it, then at `/:slug/host/calendar` select a property and block a free range. Open the listing calendar and read-only booking history. An archived listing disappears from public search but remains manageable by hosts.
4. **Platform admin:** Sign in at `/admin/login`; the default destination is `/admin/tenants`. Create a tenant, configure it, and provision a host. Inspect tenant counts and account actions. A newly created tenant starts without imported inventory; the seed import is deliberately confined to the two local demo tenants.

The public portal requires no sign-in. Host accounts are provisioned by a platform administrator. The admin account belongs to a separate platform realm, not to a tenant portal.

## Where to look next

| Question | Document |
| --- | --- |
| How do the pieces and trust boundaries fit? | [Architecture](architecture.md) |
| What happens during search, saves, editing, calendar changes, and administration? | [Flows](flows.md) |
| Which brief items are implemented, and where is their evidence? | [Requirements map](requirements-map.md) |
| What is stored, and which date and deletion rules matter? | [Data model](data-model.md) |
| What was verified and what remains outside scope? | [Dated review notes](review-notes.md) |
| How are API diagnostics and dependencies maintained? | [Security maintenance](security-maintenance.md) |
| Why were these choices made? | [Original design spec](superpowers/specs/2026-09-22-rental-system-design.md) |

For code navigation, start with [web routes](../apps/web/src/app/router.tsx), [API modules](../apps/api/src/app.module.ts), [shared contracts](../packages/contracts/src/index.ts), and the [Prisma schema](../apps/api/prisma/schema.prisma). The original design and implementation plan record intent; the linked source files are the current implementation.

## Historical records

The [public UI refresh](history/ui-refresh.md) and [host/admin workflow notes](history/host-admin-workflows.md) describe earlier implementation and review milestones. Their local preview URLs, branch names, and test counts are historical snapshots. The [design and implementation records](superpowers/) explain earlier decisions; use the documents above and current source for the present behavior.

## Run checks

From the repository root, `npm ci` with Node 24.21.0 and npm 11 installs source-development dependencies. The README documents the environment and isolated browser-stack setup. The main commands are:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration  # requires local PostgreSQL
npm run test:stack        # requires the Compose stack
npm run test:browser      # requires seeded Compose stack and Chromium
```

CI runs these layers with PostgreSQL and the composed application; see [CI configuration](../.github/workflows/ci.yml). See [review notes](review-notes.md) for the date and limits of recorded verification. A command listed here is an instruction, not a claim that it ran for this handoff.

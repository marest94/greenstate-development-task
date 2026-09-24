# Review notes — 2026-09-24

These notes describe the handoff after `main` commit `0465447` (PR #12, workspace redirects, browser identity, and tenant branding). The application tests below were recorded on 23 September at source commit `71ee848`, before PR #12. This documentation pass does not claim a fresh application test run. Use [CI](../.github/workflows/ci.yml) or the commands in the [documentation guide](README.md#run-checks) to verify the current code.

## Recorded evidence

The [README verification record](../README.md#run-locally) reports a local run on 23 September 2026 at `71ee848`: 74 API unit tests, 222 web component tests, 271 PostgreSQL integration tests, two stack checks, and 34 browser cases; lint, typecheck, production build, and dependency audit were also reported there. Those counts are historical evidence and do not verify PR #12. Browser cases cover desktop and a 375-pixel Chromium viewport, not additional browser engines.

The [CI workflow](../.github/workflows/ci.yml) defines clean install, lint, typecheck, unit/component tests, production build, PostgreSQL integration tests, a composed-stack check, and Playwright browser tests. The [dependency audit workflow](../.github/workflows/dependency-audit.yml) is separate. A passing local command does not establish that branch protection requires either workflow.

## Scope and useful discussion points

- **Brief scope:** Public search and availability; tenant client accounts; host inventory, calendar blocks, and read-only booking history; platform tenant and host administration. [Requirements map](requirements-map.md) links every numbered brief item.
- **Assumptions:** Tenant-local account identities; tenant business timezone for dates across all its cities; half-open stays; soft tenant deletion; versioned listing edits. These choices are explained in [architecture](architecture.md), [data model](data-model.md), and the [original design](superpowers/specs/2026-09-22-rental-system-design.md).
- **Excluded behavior:** Booking creation/editing, payment, email delivery/recovery, MFA, uploads, production deployment, and an audit-log UI. This is a local challenge application with public demo credentials and one API instance; production TLS, backups, and shared rate limiting are separate work.
- **Verification limits:** Current browser automation uses Chromium at two viewport sizes. A full assistive-technology audit and Safari/Firefox verification have not been recorded. No load or scalability benchmark is claimed.

Earlier review findings predate later fixes and tests. Check the present code and current CI before treating an older finding as still open. [Security maintenance](security-maintenance.md) describes current diagnostics and dependency checks.

# Host and superadmin workflows

Implemented in the existing isolated UI branch after the user approved the three implementation plans.

## Host availability

Open `/:slug/host/calendar`, or choose **Availability** in the host navigation.

- Shared 14-day desktop / 7-day mobile timeline, with property and city search, archive status, pagination, sticky names and date headings.
- Click a first and last night in the same property row. Choosing a different property starts a new selection. Date inputs provide an equivalent input method; mobile uses a bottom sheet.
- Preview free nights, bookings and existing manual blocks before saving. Existing block reasons are preserved. Booking details remain read-only.
- Range writes are atomic: any occupied night rejects the entire add. Removing blocks only removes manual blocks. Past/archived additions are rejected; existing blocks can still be removed.
- UI last night is inclusive; HTTP `to` is exclusive. Edits in this version are confined to the displayed timeline. The API accepts at most 31 nights.
- Save preserves the current view and refreshes host and public availability. Changing URL/date/filter state clears the draft and aborts its pending client request. Server state is authoritative.

New endpoints: `GET /api/v1/t/:slug/host/calendar` and `POST /api/v1/t/:slug/host/listings/:id/block-range`. Existing single-listing calendar remains available. Portfolio reads use one repeatable-read transaction with bounded listing rows and batched spans; range writes use the existing live-tenant/listing locks.

## Inventory and editor

Inventory supports literal title/city search, property type and name/price ordering. Filters are server-side and URL-backed; page-size is retained. Direct Edit, Calendar, Bookings and active-listing Preview links are available per row.

Listing fields are organized into Basics, Capacity, Pricing and Location. Valid supplied coordinates show the existing OpenStreetMap preview. Unsaved changes prompt on internal navigation and browser unload; failed saves retain the draft, accepted saves clear it. Archive controls are disabled while edits are unsaved. Existing version conflict handling remains unchanged.

## Superadmin

Tenant rows show active/archived listing counts, total accounts and enabled hosts. The tenant detail screen derives setup progress from those totals. Counts use separate tenant-scoped aggregates and do not multiply records through joins.

`GET /api/v1/admin/tenants/:id/summary` returns the authenticated summary; ordinary tenant read/create/update DTOs remain unchanged. Host creation and credential/access actions use focused dialogs with tenant/account context, existing identity confirmation, request cancellation and focus restoration. Successful actions focus the persistent accounts heading so disappearing filtered rows do not lose keyboard focus.

No new dependency or database migration was introduced. Platform accounts do not impersonate tenant hosts. Production deployment is separate from this change.

## Verification and review

- Complete unit/component suite, typecheck and lint.
- Full PostgreSQL integration suite, including existing tenant isolation and races; additional overlapping-range and midnight checks.
- Desktop and 375px mobile browser coverage for portfolio range editing across two properties, existing host/editor/calendar/admin flows and public gallery/map browsing.
- Independent review found invalid timeline input, stale URL-owned drafts and disappearing-row focus problems; each was reproduced with a regression test and fixed. Reviewer verified all three fixes.
- Existing public-map browser test was corrected to recognize grouped pins when earlier host tests create properties at the same coordinates.

Implementation notes: field groups use visible headings inside the existing disabled form fieldset, preserving current validation and form semantics. Private UI reads refresh through TanStack Query; there is no real-time cross-browser synchronization. Ranges are rechecked by the server before each write.

## Final validation record

The full PostgreSQL run passed 263 tests across 25 files; two additional range concurrency/midnight tests subsequently passed in the 19-test calendar file. The final complete unit/component run passed 52 API and 197 web tests (249 total). Typecheck, ESLint and production Docker build passed. The final desktop/mobile browser run passed all 20 tests in 47.8 seconds after a clean local API restart to avoid accumulated test-login rate limits.

## Release polish — 2026-09-23

A final review caught a missing dirty-form guard on restoring archived listings. Both archive and restore now require saving or explicitly discarding edits. The editor includes a Discard changes control, and single-night/block calendar copy uses singular labels. Regression coverage includes the archived draft/restore flow and a full 20-property calendar page on desktop and mobile.

The release check passed 250 unit/component tests, lint and typecheck. The production Docker build and focused desktop/mobile host/admin browser checks passed. A fresh independent release review covered the entire public/host/admin branch and found no additional blocker. Delivery is through a GitHub pull request; no merge or production deployment is performed by this task.

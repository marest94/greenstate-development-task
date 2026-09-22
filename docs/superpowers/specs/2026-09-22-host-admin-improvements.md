# Host and superadmin workflow improvements

## Approved direction

The user approved implementing the six improvements discussed in this task, in order: portfolio calendar, individual-property range editing, host inventory discovery, listing editor clarity, tenant overview, and onboarding/account actions. Calendar overview and editing ship together. Work continues in the existing isolated `greenstate-ui` clone on `ui/property-browsing`.

## Availability deliverable

Add `/:slug/host/calendar`, linked from HostLayout. Show one property per row, sticky property names and date headings, a shared 14-night desktop timeline and a 7-night mobile timeline. Use a semantic table, labelled cell buttons, text plus color for available/booked/manually blocked states, and tenant business date. Search by title, filter by city and active/archived status, paginate 20 properties by default (maximum 50). Date navigation and filters are URL-backed; filter changes reset pagination. Range changes clear selection. Empty, error and retry states must be explicit.

Click a night to select a property and start date; click another night in that row to choose the inclusive final night. Clicking another property starts a new selection. Provide labelled date inputs as an equivalent keyboard/touch workflow. A desktop side panel and mobile bottom sheet show property, first/last night, occupied nights, existing manual blocks, reason, and explicit action preview. Booking clicks show all overlapping read-only bookings, their imported statuses and date-derived periods.

API intervals remain half-open: UI October 10–12 nights sends from October 10, to October 13. Writes are bounded to 31 nights. A range containing a non-cancelled booking is rejected atomically when adding blocks. Existing manual blocks are left unchanged, including reasons; only free nights are added. Preview distinguishes new blocks from already-blocked nights. Removal deletes only manual blocks in the selected interval, including legacy blocks overlapping bookings. Bookings are never modified. Empty changes return changed=0 honestly. Past or archived properties reject new blocks, but their existing blocks may be removed.

Use the existing live-tenant shared lock then listing lock. Validate the tenant business date after acquiring locks, using fresh tenant configuration. Reject cross-tenant identifiers. Preserve strict CSRF and permission checks. Retain typed drafts on error; refresh after conflicts. Save uses server-confirmed results, preserves view/filters/scroll and invalidates tenant public availability/search caches. Unmount or account changes abort pending requests and prevent late private state restoration.

The portfolio API performs a bounded set of queries for the page, bookings and manual blocks, never one HTTP request per property. Use a repeatable-read snapshot scoped to this repository operation so page counts, properties and spans agree. Do not change the default transaction isolation for unrelated endpoints.

## Host inventory and editor deliverable

Inventory adds literal case-insensitive title and city search, property-type filter and title/price ascending/price descending sorts with deterministic ID tie-breaks. Filters are server-side, preserve page size, and reset page when applied. Actions: Edit, Calendar, Bookings and Preview (active listings only). Preserve existing archive semantics.

Editor groups fields into Basics, Capacity, Pricing, Location; all groups remain visible. Preview only finite, validated coordinates. Preserve the existing version conflict workflow and money parser. Track meaningful differences against accepted server values; warn on internal navigation and browser unload while dirty. Saving successfully clears the warning before any navigation; failed save preserves the draft. Archive does not silently discard a dirty draft. Reset/reload explicitly replaces it. Reuse the existing map technology and attribution.

## Superadmin deliverable

Tenant list shows active/archived listing counts, total account count, enabled host count, status and existing direct links. Counts cover the whole tenant, never just a displayed page. Aggregate separately to avoid multiplying listings by users. Use a dedicated summary schema for list rows and an authenticated tenant-summary endpoint for the detail checklist; don't add fake defaults to write responses.

Tenant detail checklist derives facts: tenant created, enabled host exists, active listing exists. Explain that an enabled host creates listings through the tenant host workspace; platform authentication does not impersonate a host. Link to manage accounts and public portal. Deleted tenants keep retained counts but show access disabled, without active onboarding actions.

Account actions open a focused accessible dialog/panel with tenant name and slug, account email where applicable, keyboard focus management, cancellation, and pending state. Keep existing identity-confirmation and password requirements, session revocation, authorization and deleted-tenant protections. Never persist temporary passwords or transmit credentials in links. Clear drafts when target/action changes; late completion cannot affect another tenant/account.

## Acceptance and constraints

No database schema migration or new dependency is expected. Tenant isolation, server-authoritative availability and imported booking semantics remain unchanged. Validate contracts, atomic writes and races against real PostgreSQL; test user interaction, dirty navigation and account dialogs; run the existing unit/component suite and appropriate authenticated/public Playwright suites. Review desktop and 375px mobile in the local demo. No production deployment, remote push or merge is part of this request.

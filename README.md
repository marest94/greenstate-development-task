# GreenState Development Task

Fresh implementation of the GreenState accommodation rental challenge.

Status: design and implementation plan approved; hybrid execution selected. Repository
setup and original-input verification are complete. Application implementation has not
started, so there is no application startup command or test suite yet.

## Planning

- [Approved design](docs/superpowers/specs/2026-09-22-rental-system-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-22-rental-system-implementation.md)

Follow the 13-task plan, with one integration owner, bounded parallel work, and commits at
verified task boundaries. The next deliverable is task 1's runnable API/frontend scaffold.

Application development uses `codex/implementation`; parallel work uses separate
`codex/task-<number>-<short-name>` branches/worktrees. `main` holds the initial baseline
and reviewed milestones, integrated through pull requests.

## Original challenge material

The following files were supplied with the original GreenState challenge. They are retained
unchanged; no old application code, credentials, generated artifacts, or agent configuration
was copied into this repository.

- `task-material/Full Stack Challenge.pdf`: original brief.
- `task-material/contracts.ts`: original domain contracts, kept as source material.
- `data/listings.csv`: 1,000 listings.
- `data/bookings.csv`: 12,757 bookings.

The SHA-256 checksums below were compared with the originals during repository setup.

| File | SHA-256 |
|---|---|
| `task-material/Full Stack Challenge.pdf` | `f07f0e2f665b4935027f9c6573fff3a16fb6c4326132141b22f28ff1dc67c2bc` |
| `task-material/contracts.ts` | `d3b46cc388e1defa94fc191511a7aa80418c0314c713ab2be3badf72ff081711` |
| `data/listings.csv` | `05c4ceb34325652c9cd65f0912fcaef4d02513c3bab93fa438fc3150fb5c200e` |
| `data/bookings.csv` | `2b547c5439db31c8659264c6fb63c245a75aa59411e572c94878a55c523ebcf6` |

CREATE TABLE seed_runs (
    key TEXT PRIMARY KEY,
    version INTEGER NOT NULL CHECK (version > 0),
    checksum TEXT NOT NULL,
    counts JSONB NOT NULL,
    completed_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Markers are immutable to runtime roles. Later account bootstrap has its own key/version.
GRANT SELECT, INSERT ON seed_runs TO gs_admin;

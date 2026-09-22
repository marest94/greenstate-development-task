ALTER TABLE blocked_days ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE blocked_days ADD CONSTRAINT blocked_days_id_key UNIQUE (id);
ALTER TABLE blocked_days ADD COLUMN reason text;
ALTER TABLE blocked_days ADD CONSTRAINT blocked_days_reason_length CHECK (reason IS NULL OR length(reason) <= 500);
-- The existing (listing_id, date) primary key is stronger than tenant/listing/date uniqueness:
-- listing IDs are globally unique, and the composite foreign key enforces their tenant.
ALTER TABLE tenant_users ADD COLUMN name varchar(120);

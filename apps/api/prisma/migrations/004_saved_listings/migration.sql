CREATE TABLE saved_listings (
  tenant_id uuid NOT NULL, user_id uuid NOT NULL, listing_id uuid NOT NULL,
  saved_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, user_id, listing_id),
  FOREIGN KEY (user_id, tenant_id) REFERENCES tenant_users(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (listing_id, tenant_id) REFERENCES listings(id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX saved_listings_owner_order_idx ON saved_listings (tenant_id, user_id, saved_at DESC, listing_id);
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_listings FORCE ROW LEVEL SECURITY;
CREATE POLICY saved_listings_owner_scope ON saved_listings
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = nullif(current_setting('app.user_id', true), '')::uuid);
GRANT SELECT, INSERT, DELETE ON saved_listings TO gs_app, gs_admin;

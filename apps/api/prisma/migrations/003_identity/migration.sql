CREATE TABLE tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  email varchar(254) NOT NULL, password_hash text NOT NULL, role text NOT NULL DEFAULT 'client',
  must_change_password boolean NOT NULL DEFAULT false, disabled_at timestamptz(3),
  credential_version integer NOT NULL DEFAULT 1, created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, email), UNIQUE (id, tenant_id),
  CHECK (role IN ('client', 'host')), CHECK (credential_version > 0),
  CHECK (email = lower(btrim(email)) AND length(email) > 3), CHECK (length(password_hash) BETWEEN 60 AND 512)
);
CREATE TABLE tenant_sessions (
  token_hash char(64) PRIMARY KEY, tenant_id uuid NOT NULL, user_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at timestamptz(3) NOT NULL,
  FOREIGN KEY (user_id, tenant_id) REFERENCES tenant_users(id, tenant_id) ON DELETE RESTRICT,
  CHECK (token_hash ~ '^[0-9a-f]{64}$'), CHECK (expires_at = created_at + interval '168 hours')
);
CREATE INDEX tenant_sessions_tenant_id_user_id_idx ON tenant_sessions(tenant_id, user_id);
CREATE TABLE platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(254) NOT NULL UNIQUE, password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT false, credential_version integer NOT NULL DEFAULT 1,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (credential_version > 0), CHECK (email = lower(btrim(email)) AND length(email) > 3),
  CHECK (length(password_hash) BETWEEN 60 AND 512)
);
CREATE TABLE platform_sessions (
  token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at timestamptz(3) NOT NULL,
  CHECK (token_hash ~ '^[0-9a-f]{64}$'), CHECK (expires_at = created_at + interval '168 hours')
);
CREATE INDEX platform_sessions_user_id_idx ON platform_sessions(user_id);
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_users_scope ON tenant_users USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_sessions_scope ON tenant_sessions USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT ON tenant_users, tenant_sessions TO gs_app, gs_admin;
GRANT INSERT (id, tenant_id, email, password_hash) ON tenant_users TO gs_app;
GRANT UPDATE (password_hash, credential_version, must_change_password) ON tenant_users TO gs_app;
GRANT INSERT, DELETE ON tenant_sessions TO gs_app, gs_admin;
GRANT INSERT ON tenant_users TO gs_admin;
GRANT UPDATE (password_hash, credential_version, must_change_password, role, disabled_at) ON tenant_users TO gs_admin;
GRANT SELECT, INSERT ON platform_users TO gs_admin;
GRANT UPDATE (password_hash, credential_version, must_change_password) ON platform_users TO gs_admin;
GRANT SELECT, INSERT, DELETE ON platform_sessions TO gs_admin;

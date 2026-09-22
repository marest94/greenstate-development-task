-- The bootstrap provides the public schema and grants CREATE on it to the migration owner.

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "primary_color" TEXT,
    "contact_email" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "property_type" TEXT NOT NULL,
    "max_guests" INTEGER NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "price_per_night_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER NOT NULL,
    "created_at" DATE NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guests" INTEGER NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_days" (
    "tenant_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "blocked_days_pkey" PRIMARY KEY ("listing_id","date")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "listings_tenant_id_archived_at_city_idx" ON "listings"("tenant_id", "archived_at", "city");

-- CreateIndex
CREATE INDEX "listings_tenant_id_price_per_night_cents_id_idx" ON "listings"("tenant_id", "price_per_night_cents", "id");

-- CreateIndex
CREATE UNIQUE INDEX "listings_id_tenant_id_key" ON "listings"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_listing_id_check_in_check_out_idx" ON "bookings"("tenant_id", "listing_id", "check_in", "check_out");

-- CreateIndex
CREATE INDEX "blocked_days_tenant_id_listing_id_date_idx" ON "blocked_days"("tenant_id", "listing_id", "date");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_listing_id_tenant_id_fkey" FOREIGN KEY ("listing_id", "tenant_id") REFERENCES "listings"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_days" ADD CONSTRAINT "blocked_days_listing_id_tenant_id_fkey" FOREIGN KEY ("listing_id", "tenant_id") REFERENCES "listings"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints beyond Prisma's schema language.
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_shape CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 1 AND 63);
ALTER TABLE tenants ADD CONSTRAINT tenants_primary_color CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE listings ADD CONSTRAINT listings_values CHECK (
    max_guests BETWEEN 1 AND 12 AND bedrooms BETWEEN 0 AND 20 AND price_per_night_cents >= 0
    AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
    AND currency = 'EUR' AND country ~ '^[A-Z]{2}$'
    AND property_type IN ('apartment', 'studio', 'house', 'loft', 'room')
    AND review_count >= 0 AND version > 0
    AND ((rating IS NULL AND review_count = 0) OR (rating IS NOT NULL AND rating BETWEEN 0 AND 5 AND review_count > 0))
);
ALTER TABLE bookings ADD CONSTRAINT bookings_values CHECK (
    check_in < check_out AND guests BETWEEN 1 AND 12 AND status IN ('confirmed', 'completed', 'cancelled')
);

-- Neither runtime credential owns schema objects or receives DDL privileges.
GRANT SELECT ON tenants TO gs_app, gs_admin;
GRANT INSERT ON tenants TO gs_admin;
GRANT UPDATE (name, timezone, primary_color, contact_email, deleted_at) ON tenants TO gs_admin;
GRANT SELECT, INSERT ON listings TO gs_app, gs_admin;
GRANT UPDATE (title, city, country, latitude, longitude, property_type, max_guests, bedrooms,
    price_per_night_cents, archived_at, version) ON listings TO gs_app, gs_admin;
GRANT SELECT ON bookings TO gs_app, gs_admin;
GRANT INSERT ON bookings TO gs_admin;
GRANT SELECT, INSERT, DELETE ON blocked_days TO gs_app, gs_admin;

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings FORCE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE blocked_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_days FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON listings TO gs_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_scope ON bookings TO gs_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_scope ON blocked_days TO gs_app
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

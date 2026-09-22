ALTER TABLE listings ADD COLUMN description text;
ALTER TABLE listings ADD CONSTRAINT listings_description_length CHECK (description IS NULL OR length(description) <= 5000);
GRANT UPDATE (description) ON listings TO gs_app, gs_admin;

-- 001_init_schemas.sql
-- Initializes schemas, extensions, and base settings

-- UUID support (required everywhere)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS vendor;
CREATE SCHEMA IF NOT EXISTS public;

-- Optional: comment to document purpose
COMMENT ON SCHEMA vendor IS 'Stores all vendor-specific catalogs, inventory, categories, fitment, logs.';
COMMENT ON SCHEMA public IS 'Stores the merged StinkinSupplies catalog, pricing, routing, and search structures.';
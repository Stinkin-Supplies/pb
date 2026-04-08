-- MIGRATION: Add OEM Cross-Reference Table
-- Run this in your Hetzner Postgres database

BEGIN;

-- Create OEM cross-reference table
CREATE TABLE IF NOT EXISTS catalog_oem_crossref (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL,                    -- Your DS/PU part number
  oem_number TEXT NOT NULL,              -- OEM part number (e.g., "14-1977")
  oem_manufacturer TEXT NOT NULL,        -- "Harley-Davidson", "Honda", etc.
  page_reference TEXT,                   -- Page in catalog
  source_file TEXT,                      -- "FatBook_2026-ref.pdf"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate cross-references
  CONSTRAINT unique_oem_ref UNIQUE (sku, oem_number, oem_manufacturer)
);

-- Create indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_oem_sku 
  ON catalog_oem_crossref(sku);

CREATE INDEX IF NOT EXISTS idx_oem_number 
  ON catalog_oem_crossref(oem_number);

CREATE INDEX IF NOT EXISTS idx_oem_manufacturer 
  ON catalog_oem_crossref(oem_manufacturer);

-- Create composite index for OEM number searches
CREATE INDEX IF NOT EXISTS idx_oem_lookup 
  ON catalog_oem_crossref(oem_number, oem_manufacturer);

COMMIT;

-- Verify table was created
SELECT 
  tablename, 
  schemaname 
FROM pg_tables 
WHERE tablename = 'catalog_oem_crossref';

-- Show indexes
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'catalog_oem_crossref';

-- Sample insert (for testing)
-- INSERT INTO catalog_oem_crossref 
--   (sku, oem_number, oem_manufacturer, page_reference, source_file)
-- VALUES 
--   ('1975', '14-1977', 'Harley-Davidson', '511', 'FatBook_2026-ref.pdf'),
--   ('1975', '63790-77', 'Harley-Davidson', '511', 'FatBook_2026-ref.pdf'),
--   ('DS-193711', '1975704', 'Harley-Davidson', '2013', 'FatBook_2026-ref.pdf');

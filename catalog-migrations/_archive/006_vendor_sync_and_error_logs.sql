-- 006_vendor_sync_and_error_logs.sql
-- Tracks all vendor sync operations + errors for MAP compliance proof

SET search_path TO vendor;

-- =============================
-- vendor_sync_log
-- Every time you pull data from WPS/PU
-- =============================
CREATE TABLE vendor_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    vendor_code TEXT NOT NULL,
    sync_type TEXT NOT NULL,           -- 'full_catalog', 'price_file', 'map_check'
    started_at TIMESTAMP DEFAULT NOW(),
    finished_at TIMESTAMP,
    records_processed INTEGER,
    success BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX vendor_sync_log_vendor_idx
    ON vendor_sync_log (vendor_code);


-- =============================
-- vendor_error_log
-- Every error during sync/import
-- =============================
CREATE TABLE vendor_error_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    vendor_code TEXT NOT NULL,
    sync_log_id UUID REFERENCES vendor_sync_log(id) ON DELETE CASCADE,

    error_message TEXT,
    raw_payload TEXT,
    stack_trace TEXT,
    severity TEXT,            -- 'warning', 'error', 'fatal'
    occurred_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX vendor_error_log_vendor_idx
    ON vendor_error_log (vendor_code);

CREATE INDEX vendor_error_log_sync_idx
    ON vendor_error_log (sync_log_id);
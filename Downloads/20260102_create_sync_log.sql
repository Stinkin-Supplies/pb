-- ============================================================
-- supabase/migrations/20260102_create_sync_log.sql
-- ============================================================
-- Tracks every sync run. Used by the cooldown guard to prevent
-- double-pulls against the 2-per-day Parts Unlimited limit.
-- Run this in Supabase SQL Editor BEFORE using the sync route.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sync_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor        text        NOT NULL,               -- e.g. 'parts-unlimited'
  status        text        NOT NULL,               -- 'success' | 'error'
  completed_at  timestamptz NOT NULL DEFAULT now(),

  -- Result counts
  total_parts   integer     NOT NULL DEFAULT 0,
  upserted      integer     NOT NULL DEFAULT 0,
  skipped       integer     NOT NULL DEFAULT 0,
  discontinued  integer     NOT NULL DEFAULT 0,
  errors        integer     NOT NULL DEFAULT 0,
  duration_ms   integer     NOT NULL DEFAULT 0,

  -- Error details (null on success)
  error_message text
);

-- Index for fast "last successful sync" lookup (used by cooldown guard)
CREATE INDEX IF NOT EXISTS sync_log_vendor_status_idx
  ON public.sync_log (vendor, status, completed_at DESC);

-- Index for dashboard log display
CREATE INDEX IF NOT EXISTS sync_log_completed_at_idx
  ON public.sync_log (completed_at DESC);

-- RLS: only service role can write, admins can read
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- No public read — sync logs are internal only
-- Service role bypasses RLS automatically

COMMENT ON TABLE public.sync_log IS
  'Audit log of every vendor sync run. Used by cooldown guard to protect pull limits.';
COMMENT ON COLUMN public.sync_log.vendor IS
  'Vendor slug, e.g. parts-unlimited';
COMMENT ON COLUMN public.sync_log.duration_ms IS
  'How long the sync took in milliseconds';

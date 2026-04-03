// app/api/admin/sync-log/route.ts
// ─────────────────────────────────────────────────────────────
// Returns paginated sync_log rows for the admin SyncLogViewer.
//
// GET /api/admin/sync-log?vendor=wps&status=success&page=0&limit=25
//
// Reads from the sync_log table in Supabase.
// Protected by SYNC_SECRET header.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────
  const secret = req.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url          = new URL(req.url);
  const vendor       = url.searchParams.get('vendor') || 'all';
  const statusFilter = url.searchParams.get('status') || 'all';
  const page         = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10));
  const limit        = Math.min(100, parseInt(url.searchParams.get('limit') || '25', 10));
  const offset       = page * limit;

  // ── Build query ───────────────────────────────────────────
  let query = supabase
    .from('sync_log')
    .select('*', { count: 'exact' })
    .order('completed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (vendor !== 'all') {
    query = query.eq('vendor', vendor);
  }

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[sync-log]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Normalize rows to match SyncLogViewer expected shape ──
  const logs = (data ?? []).map(row => ({
    id:           row.id,
    vendor:       row.vendor       ?? null,
    status:       row.status       ?? null,
    upserted:     row.upserted     ?? row.items_upserted     ?? null,
    skipped:      row.skipped      ?? row.items_skipped      ?? null,
    errors:       row.errors       ?? row.error_count        ?? 0,
    duration_ms:  row.duration_ms  ?? row.duration           ?? null,
    error_message: row.error       ?? row.error_message      ?? null,
    completed_at: row.completed_at ?? row.created_at         ?? null,
    // PO-specific fields from webhook inserts
    event:        row.event        ?? null,
    vendor_order_id: row.vendor_order_id ?? null,
    stripe_session_id: row.stripe_session_id ?? null,
  }));

  return NextResponse.json({ logs, total: count ?? 0, page, limit });
}

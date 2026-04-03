type SyncLogEntry = {
  vendor: string;
  event?: string | null;
  status?: string | null;
  vendor_order_id?: string | null;
  stripe_session_id?: string | null;
  error_message?: string | null;
  raw_response?: unknown;
  completed_at?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export async function writeSyncLog(supabase: any, entry: SyncLogEntry) {
  try {
    const timestamp =
      (entry.completed_at as string | null | undefined) ??
      (entry.created_at as string | null | undefined) ??
      new Date().toISOString();

    await supabase.from("sync_log").insert({
      ...entry,
      vendor: String(entry.vendor ?? "").toLowerCase(),
      completed_at: timestamp,
      created_at: timestamp,
    });
  } catch (e: any) {
    console.warn("[sync-log] Failed to write sync log:", e.message);
  }
}

export const runtime = "nodejs";
export const maxDuration = 300;

// ============================================================
// app/api/cron/backup-catalog-db/route.ts
// ============================================================
// Daily backup of the catalog Postgres database (self-hosted on Hetzner)
// to Supabase Storage -- a different provider/failure domain than the
// database itself, so a Hetzner-side incident (disk failure, a bad script,
// account issue) can't take out the backups along with the primary.
//
// Built after catalog_unified was TRUNCATEd to zero rows by a script with
// no dry-run and no backup in place. See HANDOFF_LOG.md.
//
// One gzipped JSON file per table, per day, at:
//   catalog-db-backups/<YYYY-MM-DD>/<table>.json.gz
// Backups older than RETENTION_DAYS are pruned on each run.
//
// Auth matches the existing admin/cron pattern (isAuthorizedAdmin):
// Authorization: Bearer <CRON_SECRET or SYNC_SECRET>, or x-sync-secret header.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gzipSync } from "zlib";
import getCatalogDb from "@/lib/db/catalog";
import { isAuthorizedAdmin } from "@/lib/adminAuth";

const BUCKET = process.env.SUPABASE_DB_BACKUPS_BUCKET || "catalog-db-backups";
const RETENTION_DAYS = 14;

// Every table whose loss would mean redoing real work. Add to this list as
// new tables earn their place in the catalog pipeline.
const BACKUP_TABLES = [
  "catalog_unified",
  "pu_catalog",
  "wps_catalog",
  "vtwin_catalog",
  "canonical_products",
  "catalog_variant_groups",
  "catalog_variant_members",
  "catalog_variant_candidates",
  "catalog_review_flags",
  "catalog_oem_crossref",
  "catalog_fitment_v2",
  "product_fitment_year_model",
  "vendor_offers",
  "catalog_media",
];

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) {
    throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function pruneOldBackups(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: folders, error } = await supabase.storage.from(BUCKET).list("");
  if (error || !folders) return { pruned: 0, error: error?.message };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  let pruned = 0;
  for (const folder of folders) {
    // Folder names are YYYY-MM-DD; skip anything that doesn't parse.
    const folderDate = new Date(folder.name);
    if (isNaN(folderDate.getTime()) || folderDate >= cutoff) continue;

    const { data: files } = await supabase.storage.from(BUCKET).list(folder.name);
    if (files && files.length > 0) {
      await supabase.storage
        .from(BUCKET)
        .remove(files.map((f) => `${folder.name}/${f.name}`));
      pruned++;
    }
  }
  return { pruned };
}

export async function GET(req: Request) {
  if (!isAuthorizedAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const supabase = getSupabaseAdmin();

  // Self-provision the bucket on first run; ignore "already exists".
  await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {});

  const dateStr = new Date().toISOString().slice(0, 10);
  const db = getCatalogDb();

  const results: Record<string, { rows: number; bytes: number } | { error: string }> = {};

  for (const table of BACKUP_TABLES) {
    try {
      const { rows } = await db.query(`SELECT * FROM ${table}`);
      const json = JSON.stringify(rows);
      const gzipped = gzipSync(Buffer.from(json, "utf-8"));

      const path = `${dateStr}/${table}.json.gz`;
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, gzipped, {
          contentType: "application/gzip",
          upsert: true,
        });

      if (uploadErr) {
        results[table] = { error: uploadErr.message };
        continue;
      }
      results[table] = { rows: rows.length, bytes: gzipped.length };
    } catch (err) {
      results[table] = { error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  const pruneResult = await pruneOldBackups(supabase);

  const failures = Object.entries(results).filter(([, r]) => "error" in r);
  const durationMs = Date.now() - start;

  console.log(`[DB Backup] ${dateStr} -- ${BACKUP_TABLES.length - failures.length}/${BACKUP_TABLES.length} tables backed up, ${failures.length} failures, pruned ${pruneResult.pruned} old day(s), ${durationMs}ms`);

  return NextResponse.json({
    date: dateStr,
    bucket: BUCKET,
    results,
    failures: failures.length,
    pruned: pruneResult,
    durationMs,
  }, { status: failures.length > 0 ? 207 : 200 });
}

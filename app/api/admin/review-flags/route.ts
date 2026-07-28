// app/api/admin/review-flags/route.ts
// The "manual review bucket" — GET lists unresolved catalog_review_flags
// (written by AdminEditPanel's "Flag Issue" mode, or backfilled directly by
// Claude during bulk taxonomy passes), PATCH resolves one.
//
// Auth: same as app/api/admin/products/[id]/route.ts -- X-Admin-Token header
// or ?token= + ADMIN_SECRET env var.

import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  const param = new URL(req.url).searchParams.get("token");

  if (!secret) return false;
  const header = req.headers.get("x-admin-token");
  if (header && header === secret) return true;
  if (param && param === secret) return true;
  return false;
}

async function ensureFlagsTable(db: ReturnType<typeof getCatalogDb>) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS catalog_review_flags (
      id           SERIAL PRIMARY KEY,
      product_id   INT NOT NULL,
      flag_type    TEXT NOT NULL,
      flag_notes   TEXT,
      flagged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved     BOOLEAN NOT NULL DEFAULT false,
      resolved_at  TIMESTAMPTZ,
      CONSTRAINT catalog_review_flags_product_flag UNIQUE (product_id, flag_type)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_catalog_review_flags_unresolved
    ON catalog_review_flags (resolved, flagged_at DESC)
    WHERE resolved = false
  `);
}

// ── GET — list flags ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getCatalogDb();
  const status = new URL(req.url).searchParams.get("status") ?? "unresolved";

  try {
    await ensureFlagsTable(db);
    const result = await db.query(
      `
      SELECT f.*, cu.name, cu.sku, cu.slug, cu.display_category, cu.display_subcategory, cu.source_vendor
      FROM catalog_review_flags f
      JOIN catalog_unified cu ON cu.id = f.product_id
      WHERE f.resolved = $1
        AND cu.is_active = true
      ORDER BY f.flagged_at DESC
      LIMIT 500
      `,
      [status === "resolved"]
    );
    return NextResponse.json({ flags: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ── POST — flag a product (product_id + flag_type in body) ────────
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getCatalogDb();
  const body = await req.json();
  const { product_id, flag_type, flag_notes } = body as {
    product_id?: number;
    flag_type?: string;
    flag_notes?: string;
  };

  if (!product_id || !flag_type) {
    return NextResponse.json({ error: "product_id and flag_type required" }, { status: 400 });
  }

  await ensureFlagsTable(db);
  await db.query(
    `INSERT INTO catalog_review_flags (product_id, flag_type, flag_notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (product_id, flag_type)
     DO UPDATE SET flag_notes = EXCLUDED.flag_notes, flagged_at = now(), resolved = false, resolved_at = NULL`,
    [product_id, flag_type, flag_notes ?? null]
  );

  return NextResponse.json({ ok: true });
}

// ── PATCH — resolve/unresolve a flag by id ─────────────────────────
export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getCatalogDb();
  const body = await req.json();
  const { id, resolved } = body as { id?: number; resolved?: boolean };

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await db.query(
    `UPDATE catalog_review_flags
     SET resolved = $1, resolved_at = CASE WHEN $1 THEN now() ELSE NULL END
     WHERE id = $2`,
    [resolved ?? true, id]
  );

  return NextResponse.json({ ok: true });
}

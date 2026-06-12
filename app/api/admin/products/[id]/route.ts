// app/api/admin/products/[id]/route.ts
// PATCH — update display_category / display_subcategory / fits_all_models /
//         pack_qty on catalog_unified, then push a single-document update to
//         Typesense (no full reindex needed).
// POST  — create a review flag in catalog_review_flags.
//
// Auth: checks X-Admin-Token header or ?admin=1 + ADMIN_SECRET env var.
// Minimal — tighten auth when you add real user sessions.

import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

// ── Typesense single-doc update ────────────────────────────────
async function typesenseUpdate(id: number, fields: Record<string, unknown>) {
  const host   = process.env.TYPESENSE_HOST;
  const apiKey = process.env.TYPESENSE_ADMIN_API_KEY ?? process.env.TYPESENSE_API_KEY;
  const col    = process.env.TYPESENSE_COLLECTION ?? "products";

  if (!host || !apiKey) {
    console.warn("[AdminEdit] Typesense env vars missing — skipping live update");
    return;
  }

  const url = `${host.replace(/\/$/, "")}/collections/${col}/documents/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-TYPESENSE-API-KEY": apiKey,
    },
    body: JSON.stringify(fields),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[AdminEdit] Typesense PATCH failed:", res.status, body);
  }
}

// ── Auth check ─────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  const param = new URL(req.url).searchParams.get("token");

  if (!secret) return false;
  const header = req.headers.get("x-admin-token");
  if (header && header === secret) return true;
  if (param && param === secret) return true;
  return false;
}

// ── Ensure review flags table exists ──────────────────────────
// Idempotent — safe to call on every request, skips if already created.
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
  // Index for fast unresolved queries
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_catalog_review_flags_unresolved
    ON catalog_review_flags (resolved, flagged_at DESC)
    WHERE resolved = false
  `);
}

// ── PATCH ─────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const productId = parseInt(id, 10);
  if (isNaN(productId)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }

  const body = await req.json();
  const { action } = body;

  const db = getCatalogDb();

  // No `action` field — ProductManager.jsx flat-body update (inline edit or
  // full edit modal save). Route to generic whitelisted-column handler.
  if (action === undefined) {
    return handleGenericUpdate(db, productId, body);
  }

  // ── FLAG action ──
  if (action === "flag") {
    const { flagType, flagNotes } = body as { flagType: string; flagNotes?: string };

    if (!flagType) {
      return NextResponse.json({ error: "flagType required" }, { status: 400 });
    }

    await ensureFlagsTable(db);

    await db.query(
      `INSERT INTO catalog_review_flags (product_id, flag_type, flag_notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, flag_type)
       DO UPDATE SET flag_notes = EXCLUDED.flag_notes, flagged_at = now(), resolved = false`,
      [productId, flagType, flagNotes ?? null]
    );

    return NextResponse.json({ ok: true, action: "flagged" });
  }

  // ── UPDATE action ──
  if (action === "update") {
    const {
      display_category,
      display_subcategory,
      fits_all_models,
      pack_qty,
    } = body as {
      display_category?:    string;
      display_subcategory?: string;
      fits_all_models?:     boolean;
      pack_qty?:            number;
    };

    // Build dynamic SET clause — only include fields that were sent
    const setClauses: string[] = [];
    const values: unknown[]    = [];
    let   idx = 1;

    if (display_category !== undefined) {
      setClauses.push(`display_category = $${idx++}`);
      values.push(display_category || null);
    }
    if (display_subcategory !== undefined) {
      setClauses.push(`display_subcategory = $${idx++}`);
      values.push(display_subcategory || null);
    }
    if (fits_all_models !== undefined) {
      setClauses.push(`fits_all_models = $${idx++}`);
      values.push(fits_all_models);
    }
    if (pack_qty !== undefined) {
      const qty = Math.max(1, Math.trunc(Number(pack_qty)) || 1);
      setClauses.push(`pack_qty = $${idx++}`);
      values.push(qty);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    setClauses.push(`updated_at = now()`);
    values.push(productId);

    const sql = `
      UPDATE catalog_unified
      SET ${setClauses.join(", ")}
      WHERE id = $${idx}
      RETURNING id, display_category, display_subcategory, fits_all_models, pack_qty
    `;

    const result = await db.query(sql, values);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const updated = result.rows[0];

    // Push single-document update to Typesense (non-blocking — don't await failure)
    const tsFields: Record<string, unknown> = {};
    if (display_category    !== undefined) tsFields.display_category    = updated.display_category;
    if (display_subcategory !== undefined) tsFields.display_subcategory = updated.display_subcategory;
    if (fits_all_models     !== undefined) tsFields.fits_all_models     = updated.fits_all_models;
    if (pack_qty            !== undefined) tsFields.pack_qty            = updated.pack_qty;

    if (Object.keys(tsFields).length > 0) {
      typesenseUpdate(productId, tsFields).catch((e) =>
        console.error("[AdminEdit] Typesense update error:", e)
      );
    }

    return NextResponse.json({ ok: true, action: "updated", product: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── Whitelisted columns for generic flat-body PATCH ─────────────
// ProductManager.jsx sends bare field bodies like { price: 12.34 }
// (inline cell edit) or the full content/pricing/era object (edit modal),
// with no `action` wrapper. Map external field names -> real columns and
// validate/cast values here. Add new editable fields to this map.
const GENERIC_FIELD_MAP: Record<string, { column: string; cast?: (v: unknown) => unknown }> = {
  name:               { column: "name" },
  description:        { column: "description" },
  brand:              { column: "brand" },
  category:           { column: "category" },
  price:              { column: "computed_price", cast: v => (v === null || v === "" ? null : Number(v)) },
  msrp:               { column: "msrp",           cast: v => (v === null || v === "" ? null : Number(v)) },
  map_price:          { column: "map_price",      cast: v => (v === null || v === "" ? null : Number(v)) },
  features:           { column: "features",       cast: v => (Array.isArray(v) ? v : []) },
  is_active:          { column: "is_active" },
  is_discontinued:    { column: "is_discontinued" },
  is_harley_fitment:  { column: "is_harley_fitment" },
  is_universal:       { column: "is_universal" },
  has_map_policy:     { column: "has_map_policy" },
  pack_qty:           { column: "pack_qty", cast: v => Math.max(1, Math.trunc(Number(v)) || 1) },
  // Era flags — same key in body and column
  era_flathead:       { column: "era_flathead" },
  era_knucklehead:    { column: "era_knucklehead" },
  era_panhead:        { column: "era_panhead" },
  era_shovelhead:     { column: "era_shovelhead" },
  era_ironhead:       { column: "era_ironhead" },
  era_evo_sportster:  { column: "era_evo_sportster" },
  era_evolution:      { column: "era_evolution" },
  era_twin_cam:       { column: "era_twin_cam" },
  era_milwaukee8:     { column: "era_milwaukee8" },
  era_chopper:        { column: "era_chopper" },
};

async function handleGenericUpdate(db: ReturnType<typeof getCatalogDb>, productId: number, body: Record<string, unknown>) {
  const setClauses: string[] = [];
  const values: unknown[]    = [];
  let idx = 1;

  for (const [key, val] of Object.entries(body)) {
    const mapping = GENERIC_FIELD_MAP[key];
    if (!mapping) continue; // ignore unknown/unwhitelisted fields silently
    setClauses.push(`${mapping.column} = $${idx++}`);
    values.push(mapping.cast ? mapping.cast(val) : val);
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: "No recognized fields to update" }, { status: 400 });
  }

  setClauses.push(`updated_at = now()`);
  values.push(productId);

  const sql = `
    UPDATE catalog_unified
    SET ${setClauses.join(", ")}
    WHERE id = $${idx}
    RETURNING *
  `;

  const result = await db.query(sql, values);

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const updated = result.rows[0];

  // Push changed fields to Typesense
  const tsFields: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    const mapping = GENERIC_FIELD_MAP[key];
    if (mapping) tsFields[mapping.column] = updated[mapping.column];
  }
  if (Object.keys(tsFields).length > 0) {
    typesenseUpdate(productId, tsFields).catch((e) =>
      console.error("[AdminEdit] Typesense update error:", e)
    );
  }

  return NextResponse.json({ ok: true, action: "updated", product: updated });
}

// ── GET — list unresolved flags (handy for admin dashboard) ────
export async function GET(req: NextRequest, { params: _ }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getCatalogDb();

  try {
    await ensureFlagsTable(db);
    const result = await db.query(`
      SELECT f.*, cu.name, cu.sku, cu.display_category, cu.display_subcategory, cu.source_vendor
      FROM catalog_review_flags f
      JOIN catalog_unified cu ON cu.id = f.product_id
      WHERE f.resolved = false
      ORDER BY f.flagged_at DESC
      LIMIT 200
    `);
    return NextResponse.json({ flags: result.rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

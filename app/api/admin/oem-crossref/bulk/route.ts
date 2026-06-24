// app/api/admin/oem-crossref/bulk/route.ts
//
// Bulk operations on catalog_oem_crossref
//
// DELETE  — bulk delete by IDs or by filter
// PATCH   — bulk set oem_manufacturer by IDs or filter
// POST    — bulk add a new OEM # to the unique SKUs of the selection
//
// Payload shape for every method:
//   { mode: "ids",    ids: number[] }
//   { mode: "filter", search?: string, brand?: string, source?: string }
//
// PATCH also requires: { field: "oem_manufacturer", value: string }
// POST  also requires: { oem_number: string, oem_manufacturer: string, source_file?: string }

import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

// ── Build the WHERE clause from the bulk target ───────────────────────────────
// Returns { where: string, params: any[], nextIdx: number }
function buildWhere(
  body: Record<string, unknown>,
  startIdx = 1
): { where: string; params: unknown[]; nextIdx: number } {
  const params: unknown[] = [];
  let idx = startIdx;

  if (body.mode === "ids") {
    const ids = body.ids as number[];
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error("ids must be a non-empty array");
    }
    params.push(ids);
    return { where: `id = ANY($${idx})`, params, nextIdx: idx + 1 };
  }

  if (body.mode === "filter") {
    const clauses: string[] = [];
    const { search, brand, source } = body as Record<string, string>;

    if (search) {
      params.push(`%${search}%`);
      clauses.push(
        `(oem_number ILIKE $${idx} OR sku ILIKE $${idx} OR oem_manufacturer ILIKE $${idx} OR page_reference ILIKE $${idx})`
      );
      idx++;
    }
    if (brand) {
      params.push(brand);
      clauses.push(`oem_manufacturer = $${idx++}`);
    }
    if (source) {
      params.push(source);
      clauses.push(`source_file = $${idx++}`);
    }

    const where = clauses.length ? clauses.join(" AND ") : "TRUE";
    return { where, params, nextIdx: idx };
  }

  throw new Error("mode must be 'ids' or 'filter'");
}

// ── DELETE — bulk remove rows ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { where, params } = buildWhere(body);

    const db = getCatalogDb();
    const result = await db.query(
      `DELETE FROM catalog_oem_crossref WHERE ${where}`,
      params
    );

    return NextResponse.json({ deleted: result.rowCount ?? 0 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// ── PATCH — bulk update oem_manufacturer ──────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { field, value } = body as { field: string; value: string };

    if (field !== "oem_manufacturer") {
      return NextResponse.json({ error: "Only oem_manufacturer can be bulk-updated" }, { status: 400 });
    }
    if (!value || typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    // value goes in as $1, WHERE params start at $2
    const { where, params } = buildWhere(body, 2);

    const db = getCatalogDb();
    const result = await db.query(
      `UPDATE catalog_oem_crossref SET oem_manufacturer = $1 WHERE ${where}`,
      [value.trim(), ...params]
    );

    return NextResponse.json({ updated: result.rowCount ?? 0 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// ── POST — bulk add an OEM # to the unique SKUs of the selection ──────────────
//
// Strategy: collect distinct SKUs from the selection, then INSERT … ON CONFLICT DO NOTHING
// using the unique key (sku, oem_number, oem_manufacturer).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { oem_number, oem_manufacturer, source_file = "bulk_add" } = body as {
      oem_number: string;
      oem_manufacturer: string;
      source_file?: string;
    };

    if (!oem_number?.trim())       return NextResponse.json({ error: "oem_number is required" }, { status: 400 });
    if (!oem_manufacturer?.trim()) return NextResponse.json({ error: "oem_manufacturer is required" }, { status: 400 });

    const { where, params } = buildWhere(body);

    const db = getCatalogDb();

    // Step 1: collect distinct SKUs from the selection
    const skuResult = await db.query<{ sku: string }>(
      `SELECT DISTINCT sku FROM catalog_oem_crossref WHERE ${where}`,
      params
    );
    const skus = skuResult.rows.map(r => r.sku);

    if (skus.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: 0 });
    }

    // Step 2: bulk insert, skip dupes via ON CONFLICT DO NOTHING
    // Build multi-row VALUES list
    const valueRows = skus.map((_, i) => {
      const base = i * 4;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });

    const insertParams: string[] = [];
    for (const sku of skus) {
      insertParams.push(sku, oem_number.trim(), oem_manufacturer.trim(), source_file);
    }

    // No conflict target named: the live unique constraint on this table has
    // drifted between (sku, oem_number, oem_manufacturer) and (sku, oem_number)
    // across past ingestion passes. An unqualified DO NOTHING skips a row on
    // ANY unique-constraint violation, so it works regardless of which shape
    // is currently live — unlike a hardcoded target, which throws if it
    // doesn't match.
    const insertResult = await db.query(
      `INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source_file)
       VALUES ${valueRows.join(", ")}
       ON CONFLICT DO NOTHING`,
      insertParams
    );

    const inserted = insertResult.rowCount ?? 0;
    const skipped  = skus.length - inserted;

    return NextResponse.json({ inserted, skipped });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

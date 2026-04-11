/**
 * app/api/admin/oem-crossref/route.ts
 *
 * GET  /api/admin/oem-crossref  — paginated, searchable, filterable list
 * POST /api/admin/oem-crossref  — insert a single row
 * DELETE /api/admin/oem-crossref?id=123 — remove a row by id
 *
 * Column mapping (catalog_oem_crossref):
 *   sku              = WPS part number
 *   oem_number       = HardDrive / HD OEM part number
 *   oem_manufacturer = aftermarket brand (James Gaskets, Cometic, etc.)
 *   page_reference   = brand's own part number
 *   source_file      = origin CSV filename
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

const PAGE_SIZE = 50;

// Whitelisted sort columns to prevent SQL injection
const SORT_MAP: Record<string, string> = {
  oem_number:       "oem_number",
  sku:              "sku",
  oem_manufacturer: "oem_manufacturer",
  page_reference:   "page_reference",
  source_file:      "source_file",
  id:               "id",
  created_at:       "created_at",
};

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const search  = (searchParams.get("search") ?? "").trim();
  const brand   = (searchParams.get("brand")  ?? "").trim();   // filter by oem_manufacturer
  const source  = (searchParams.get("source") ?? "").trim();   // filter by source_file
  const page    = Math.max(0, parseInt(searchParams.get("page")  ?? "0", 10));
  const limit   = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? String(PAGE_SIZE), 10)));
  const sortKey = searchParams.get("sort") ?? "oem_number";
  const dir     = searchParams.get("dir")  === "asc" ? "ASC" : "DESC";
  const safeSort = SORT_MAP[sortKey] ?? "oem_number";

  const db = getCatalogDb();

  try {
    const conditions: string[] = [];
    const params: unknown[]    = [];
    let   p = 1;

    if (search) {
      conditions.push(`(
        oem_number       ILIKE $${p}  OR
        sku              ILIKE $${p}  OR
        oem_manufacturer ILIKE $${p}  OR
        page_reference   ILIKE $${p}
      )`);
      params.push(`%${search}%`);
      p++;
    }
    if (brand) {
      conditions.push(`oem_manufacturer ILIKE $${p++}`);
      params.push(`%${brand}%`);
    }
    if (source) {
      conditions.push(`source_file = $${p++}`);
      params.push(source);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM catalog_oem_crossref ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data page
    const dataResult = await db.query(
      `SELECT
         id,
         oem_number,
         sku,
         oem_manufacturer,
         page_reference,
         source_file,
         created_at
       FROM catalog_oem_crossref
       ${where}
       ORDER BY ${safeSort} ${dir}
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, limit, page * limit]
    );

    // Unique brands for filter dropdown
    const brandsResult = await db.query(
      `SELECT DISTINCT oem_manufacturer
       FROM catalog_oem_crossref
       WHERE oem_manufacturer IS NOT NULL AND oem_manufacturer <> ''
       ORDER BY oem_manufacturer`
    );

    // Unique source files for filter dropdown
    const sourcesResult = await db.query(
      `SELECT DISTINCT source_file
       FROM catalog_oem_crossref
       WHERE source_file IS NOT NULL AND source_file <> ''
       ORDER BY source_file`
    );

    return NextResponse.json({
      rows:    dataResult.rows,
      total,
      page,
      limit,
      brands:  brandsResult.rows.map((r: { oem_manufacturer: string }) => r.oem_manufacturer),
      sources: sourcesResult.rows.map((r: { source_file: string }) => r.source_file),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oem-crossref GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { oem_number, sku, oem_manufacturer, page_reference, source_file } = body;
  if (!oem_number || !sku || !oem_manufacturer) {
    return NextResponse.json(
      { error: "oem_number, sku, and oem_manufacturer are required" },
      { status: 400 }
    );
  }

  const db = getCatalogDb();
  try {
    const result = await db.query(
      `INSERT INTO catalog_oem_crossref
         (sku, oem_number, oem_manufacturer, page_reference, source_file)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (sku, oem_number, oem_manufacturer) DO UPDATE
         SET page_reference = EXCLUDED.page_reference,
             source_file    = EXCLUDED.source_file
       RETURNING *`,
      [sku, oem_number, oem_manufacturer, page_reference ?? null, source_file ?? "manual"]
    );
    return NextResponse.json({ row: result.rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oem-crossref POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: "Valid numeric id required" }, { status: 400 });
  }

  const db = getCatalogDb();
  try {
    const result = await db.query(
      `DELETE FROM catalog_oem_crossref WHERE id = $1 RETURNING id`,
      [Number(id)]
    );
    if (!result.rowCount) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oem-crossref DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

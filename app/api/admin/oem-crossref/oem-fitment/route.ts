/**
 * app/api/admin/oem-crossref/oem-fitment/route.ts
 *
 * GET    ?oem_number=xxx          — products + union fitment for this OEM #
 * POST   { oem_number, family_name, year_from, year_to, model_code? }
 *          — add fitment rows to all products that carry this OEM #
 * DELETE { oem_number, family_name, year_from, year_to, model_code? }
 *          — remove matching fitment rows from all those products
 *
 * Products are located via catalog_unified.oem_numbers @> ARRAY[oem_number]
 * so this works even when catalog_oem_crossref has been partially populated.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Find all product_ids in catalog_unified that have this OEM # */
async function productIdsForOem(db: ReturnType<typeof getCatalogDb>, oem: string) {
  const { rows } = await db.query<{ id: number }>(
    `SELECT id FROM catalog_unified WHERE $1 = ANY(oem_numbers)`,
    [oem]
  );
  return rows.map(r => r.id);
}

/** Find model_year_ids matching a family + year range, optionally filtered by model_code */
async function matchingModelYearIds(
  db: ReturnType<typeof getCatalogDb>,
  family_name: string,
  year_from: number,
  year_to: number,
  model_code?: string
) {
  const params: unknown[] = [family_name, year_from, year_to];
  let extra = "";
  if (model_code) {
    params.push(model_code);
    extra = `AND hm.model_code = $${params.length}`;
  }
  const { rows } = await db.query<{ id: number }>(
    `SELECT hmy.id
     FROM harley_model_years hmy
     JOIN harley_models hm ON hm.id = hmy.model_id
     JOIN harley_families hf ON hf.id = hm.family_id
     WHERE hf.name = $1
       AND hmy.year >= $2
       AND hmy.year <= $3
       ${extra}`,
    params
  );
  return rows.map(r => r.id);
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const oem = (searchParams.get("oem_number") ?? "").trim();
  if (!oem) return NextResponse.json({ error: "oem_number required" }, { status: 400 });

  const db = getCatalogDb();
  try {
    // Products that carry this OEM #
    const { rows: products } = await db.query(
      `SELECT
         cu.id,
         cu.name,
         cu.sku,
         cu.brand,
         cu.source_vendor,
         (SELECT COUNT(*)::int FROM catalog_fitment_v2 WHERE product_id = cu.id) AS fitment_count
       FROM catalog_unified cu
       WHERE $1 = ANY(cu.oem_numbers)
       ORDER BY cu.brand, cu.name`,
      [oem]
    );

    if (products.length === 0) {
      return NextResponse.json({ oem_number: oem, products: [], fitment: [], families: [] });
    }

    const productIds = products.map((p: { id: number }) => p.id);

    // Union fitment across all those products, grouped by family + model_code.
    // Group by hf.id + hm.model_code (not hm.id) so that multiple harley_models
    // rows sharing the same model_code collapse into one display row.
    const { rows: fitment } = await db.query(
      `SELECT
         hf.name           AS family_name,
         hm.model_code,
         MIN(hm.name)      AS model_name,
         MIN(hmy.year)     AS year_from,
         MAX(hmy.year)     AS year_to,
         COUNT(DISTINCT hmy.year)::int AS year_count,
         COUNT(DISTINCT cfv.model_year_id)::int AS model_year_count
       FROM catalog_fitment_v2 cfv
       JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
       JOIN harley_models hm ON hm.id = hmy.model_id
       JOIN harley_families hf ON hf.id = hm.family_id
       WHERE cfv.product_id = ANY($1)
       GROUP BY hf.id, hf.name, hm.model_code
       ORDER BY hf.name, MIN(hm.name), MIN(hmy.year)`,
      [productIds]
    );

    // Available families for the add form
    const { rows: familyRows } = await db.query(
      `SELECT DISTINCT hf.name AS family_name
       FROM harley_families hf
       ORDER BY hf.name`
    );
    const families = familyRows.map((r: { family_name: string }) => r.family_name);

    return NextResponse.json({ oem_number: oem, products, fitment, families });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oem-fitment GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST — add fitment ────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const oem         = String(body.oem_number ?? "").trim();
  const family_name = String(body.family_name ?? "").trim();
  const year_from   = parseInt(String(body.year_from), 10);
  const year_to     = parseInt(String(body.year_to), 10);
  const model_code  = body.model_code ? String(body.model_code).trim() : undefined;

  if (!oem || !family_name || isNaN(year_from) || isNaN(year_to)) {
    return NextResponse.json(
      { error: "oem_number, family_name, year_from, year_to are required" },
      { status: 400 }
    );
  }
  if (year_from > year_to) {
    return NextResponse.json({ error: "year_from must be ≤ year_to" }, { status: 400 });
  }

  const db = getCatalogDb();
  try {
    const productIds    = await productIdsForOem(db, oem);
    if (productIds.length === 0) {
      return NextResponse.json({ error: "No products found for this OEM #" }, { status: 404 });
    }

    const modelYearIds  = await matchingModelYearIds(db, family_name, year_from, year_to, model_code);
    if (modelYearIds.length === 0) {
      return NextResponse.json(
        { error: `No model years found for ${family_name} ${year_from}–${year_to}` },
        { status: 404 }
      );
    }

    // Bulk insert — ON CONFLICT DO NOTHING handles dupes
    const { rowCount } = await db.query(
      `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
       SELECT p, my, 'oem_crossref', 0.95
       FROM unnest($1::int[]) AS p
       CROSS JOIN unnest($2::int[]) AS my
       ON CONFLICT (product_id, model_year_id) DO NOTHING`,
      [productIds, modelYearIds]
    );

    return NextResponse.json({
      ok: true,
      inserted: rowCount ?? 0,
      products_affected: productIds.length,
      model_years_matched: modelYearIds.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oem-fitment POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── DELETE — remove fitment ───────────────────────────────────────────────────
export async function DELETE(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const oem         = String(body.oem_number ?? "").trim();
  const family_name = String(body.family_name ?? "").trim();
  const year_from   = parseInt(String(body.year_from), 10);
  const year_to     = parseInt(String(body.year_to), 10);
  const model_code  = body.model_code ? String(body.model_code).trim() : undefined;

  if (!oem || !family_name || isNaN(year_from) || isNaN(year_to)) {
    return NextResponse.json(
      { error: "oem_number, family_name, year_from, year_to are required" },
      { status: 400 }
    );
  }

  const db = getCatalogDb();
  try {
    const productIds   = await productIdsForOem(db, oem);
    if (productIds.length === 0) {
      return NextResponse.json({ error: "No products found for this OEM #" }, { status: 404 });
    }
    const modelYearIds = await matchingModelYearIds(db, family_name, year_from, year_to, model_code);

    if (modelYearIds.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const { rowCount } = await db.query(
      `DELETE FROM catalog_fitment_v2
       WHERE product_id = ANY($1::int[])
         AND model_year_id = ANY($2::int[])`,
      [productIds, modelYearIds]
    );

    return NextResponse.json({ ok: true, deleted: rowCount ?? 0 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oem-fitment DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

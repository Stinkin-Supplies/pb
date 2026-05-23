/**
 * app/api/admin/fitment/route.ts
 * GET  /api/admin/fitment?q=&page=&limit=   — paginated catalog_fitment_v2 list
 */

import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function GET(req: NextRequest) {
  const p     = req.nextUrl.searchParams;
  const q     = p.get("q")?.trim() || "";
  const page  = Math.max(1, parseInt(p.get("page") || "1"));
  const limit = Math.min(500, parseInt(p.get("limit") || "200"));
  const offset = (page - 1) * limit;

  const db = getCatalogDb();
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (q) {
    // Match on product_id (numeric), sku, name, model code, family name, year
    conditions.push(`(
      cu.sku ILIKE $${idx}
      OR cu.name ILIKE $${idx}
      OR hm.model_code ILIKE $${idx}
      OR hf.name ILIKE $${idx}
      OR cfv.product_id::text = $${idx + 1}
      OR hmy.year::text = $${idx + 1}
    )`);
    values.push(`%${q}%`, q);
    idx += 2;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRes, rowsRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM catalog_fitment_v2 cfv
       JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
       JOIN harley_models hm       ON hm.id  = hmy.model_id
       JOIN harley_families hf     ON hf.id  = hm.family_id
       LEFT JOIN catalog_unified cu ON cu.id = cfv.product_id
       ${where}`,
      values
    ),
    db.query(
      `SELECT
         cfv.id,
         cfv.product_id,
         cfv.fitment_source,
         cu.sku,
         cu.name,
         hf.name  AS family_name,
         hm.name  AS model_name,
         hm.model_code,
         hmy.year
       FROM catalog_fitment_v2 cfv
       JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
       JOIN harley_models hm       ON hm.id  = hmy.model_id
       JOIN harley_families hf     ON hf.id  = hm.family_id
       LEFT JOIN catalog_unified cu ON cu.id = cfv.product_id
       ${where}
       ORDER BY cfv.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
  ]);

  return NextResponse.json({
    rows:  rowsRes.rows,
    total: countRes.rows[0]?.total ?? 0,
    page,
    limit,
  });
}

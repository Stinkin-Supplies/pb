import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function GET(req: NextRequest) {
  const p       = req.nextUrl.searchParams;
  const page    = parseInt(p.get("page") || "0");
  const limit   = Math.min(parseInt(p.get("limit") || "50"), 100);
  const offset  = page * limit;
  const q       = p.get("q") || "";
  const family  = p.get("family") || "";
  const missing = p.get("missing") || "";

  const db = getCatalogDb();

  const where: string[] = ["cu.is_active = true"];
  const vals: any[]     = [];
  let idx = 1;

  if (q) {
    where.push(`(cu.name ILIKE $${idx} OR cu.sku ILIKE $${idx} OR cu.internal_sku ILIKE $${idx} OR cu.brand ILIKE $${idx})`);
    vals.push(`%${q}%`); idx++;
  }
  if (family) {
    where.push(`EXISTS (SELECT 1 FROM catalog_fitment_readable cfr WHERE cfr.product_id = cu.id AND cfr.family = $${idx})`);
    vals.push(family); idx++;
  }
  if (missing === "fitment") {
    where.push(`NOT EXISTS (SELECT 1 FROM catalog_fitment_readable cfr WHERE cfr.product_id = cu.id)`);
    where.push(`(cu.fits_all_models IS NULL OR cu.fits_all_models = false)`);
    where.push(`(cu.is_universal IS NULL OR cu.is_universal = false)`);
  }
  if (missing === "oem") {
    where.push(`NOT EXISTS (SELECT 1 FROM catalog_oem_crossref oc WHERE oc.sku = cu.sku)`);
  }
  if (missing === "both") {
    where.push(`NOT EXISTS (SELECT 1 FROM catalog_fitment_readable cfr WHERE cfr.product_id = cu.id)`);
    where.push(`NOT EXISTS (SELECT 1 FROM catalog_oem_crossref oc WHERE oc.sku = cu.sku)`);
    where.push(`(cu.fits_all_models IS NULL OR cu.fits_all_models = false)`);
    where.push(`(cu.is_universal IS NULL OR cu.is_universal = false)`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const [countRes, rowsRes, statsRes] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS count FROM catalog_unified cu ${whereSql}`, vals),
    db.query(
      `SELECT
        cu.id, cu.sku, cu.internal_sku, cu.name, cu.brand,
        cu.source_vendor, cu.is_harley_fitment, cu.category,
        cu.vendor_sku, cu.fits_all_models, cu.is_universal,
        cp.fits_all_models AS cp_fits_all,
        (SELECT COUNT(*)::int FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id) AS fitment_count,
        (SELECT COUNT(*)::int FROM catalog_oem_crossref oc WHERE oc.sku = cu.sku)     AS oem_count
       FROM catalog_unified cu
       LEFT JOIN catalog_products cp ON cp.sku = cu.sku
       ${whereSql}
       ORDER BY cu.brand ASC, cu.name ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...vals, limit, offset]
    ),
    db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id))::int AS with_fitment,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM catalog_oem_crossref oc WHERE oc.sku = cu.sku))::int AS with_oem,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id)
          AND NOT EXISTS (
          SELECT 1 FROM catalog_oem_crossref oc WHERE oc.sku = cu.sku))::int AS missing_both
      FROM catalog_unified cu
      WHERE cu.is_active = true
    `, []),
  ]);

  const s = statsRes.rows[0];
  return NextResponse.json({
    products: rowsRes.rows.map(r => ({
      ...r,
      fits_all_models: r.fits_all_models || r.cp_fits_all || false,
    })),
    total: countRes.rows[0]?.count ?? 0,
    stats: {
      total:       s.total,
      withFitment: s.with_fitment,
      withOem:     s.with_oem,
      missingBoth: s.missing_both,
    },
  });
}

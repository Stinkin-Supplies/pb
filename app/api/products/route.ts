/**
 * app/api/products/route.ts
 * Products API — queries catalog_unified directly from Postgres
 * Use for product detail pages, cart, checkout (not search)
 */

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function GET(req: NextRequest) {
  const p    = req.nextUrl.searchParams;
  const sku  = p.get("sku");
  const slug = p.get("slug");
  const ids  = p.get("ids")?.split(",").filter(Boolean);

  // Single product by SKU or slug
  if (sku || slug) {
    const col = sku ? "sku" : "slug";
    const val = sku || slug;

    const { rows } = await pool.query(
      `SELECT
        cu.*,
        -- WPS images from catalog_media
        COALESCE(
          (SELECT array_agg(cm.url ORDER BY cm.priority)
           FROM catalog_media cm
           JOIN catalog_products cp ON cp.id = cm.product_id
           WHERE cp.sku = cu.sku AND cu.source_vendor = 'WPS'),
          cu.image_urls
        ) AS all_images
       FROM catalog_unified cu
       WHERE cu.${col} = $1 AND cu.is_active = true
       LIMIT 1`,
      [val]
    );

    if (!rows.length) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  }

  // Multiple products by IDs (for cart)
  if (ids?.length) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await pool.query(
      `SELECT * FROM catalog_unified WHERE id IN (${placeholders}) AND is_active = true`,
      ids
    );
    return NextResponse.json(rows);
  }

  // Paginated list with filters
  const page     = parseInt(p.get("page")     || "1");
  const limit    = parseInt(p.get("limit")    || "24");
  const offset   = (page - 1) * limit;
  const brand    = p.get("brand");
  const category = p.get("category");
  const vendor   = p.get("vendor");
  const inStock  = p.get("in_stock") === "true";
  const harley   = p.get("harley")   === "true";
  const dragPart = p.get("drag")     === "true";
  const oldbook  = p.get("oldbook")  === "true";

  const conditions: string[] = ["is_active = true"];
  const values: any[] = [];
  let idx = 1;

  if (brand)    { conditions.push(`brand = $${idx++}`);         values.push(brand); }
  if (category) { conditions.push(`category = $${idx++}`);      values.push(category); }
  if (vendor)   { conditions.push(`source_vendor = $${idx++}`); values.push(vendor); }
  if (inStock)  conditions.push("in_stock = true");
  if (harley)   conditions.push("is_harley_fitment = true");
  if (dragPart) conditions.push("drag_part = true");
  if (oldbook)  conditions.push("in_oldbook = true");

  const where = conditions.join(" AND ");

  const [{ rows }, { rows: [{ count }] }] = await Promise.all([
    pool.query(
      `SELECT id, sku, name, brand, category, msrp, cost, image_url,
              in_stock, stock_quantity, source_vendor, slug,
              is_harley_fitment, fitment_hd_families, fitment_year_start, fitment_year_end,
              drag_part, in_oldbook, in_fatbook, features
       FROM catalog_unified
       WHERE ${where}
       ORDER BY sort_priority DESC, name ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
    pool.query(`SELECT COUNT(*) FROM catalog_unified WHERE ${where}`, values),
  ]);

  return NextResponse.json({
    products:    rows,
    total:       parseInt(count),
    page,
    total_pages: Math.ceil(parseInt(count) / limit),
  });
}

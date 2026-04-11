/**
 * app/api/products/group/route.ts
 *
 * GET /api/products/group?slug=head-gasket-kit-eng-100142
 *
 * Returns all brand/vendor options (product_group_members) for a product group,
 * enriched with live inventory from catalog_unified. Used by the product detail
 * page to render the brand option radio cards without vendor names exposed.
 *
 * Response shape:
 * {
 *   group: { id, oem_number, member_count, vendor_count, brand_count }
 *   options: [
 *     {
 *       vendor_sku, vendor, brand, display_brand, internal_sku,
 *       msrp, map_price, in_stock, stock_quantity,
 *       warehouse_wi, warehouse_ny, warehouse_tx, warehouse_nv, warehouse_nc,
 *       image_url, slug,
 *       is_canonical,
 *     }
 *   ]
 *   oem_numbers:     string[]   // all OEM#s this group covers
 *   page_references: string[]   // all brand part#s in this group
 * }
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug     = (searchParams.get("slug")     ?? "").trim();
  const groupId  = searchParams.get("group_id");

  if (!slug && !groupId) {
    return NextResponse.json({ error: "slug or group_id required" }, { status: 400 });
  }

  const db = getCatalogDb();

  try {
    // Resolve group
    let group: Record<string, unknown> | null = null;

    if (groupId) {
      const { rows } = await db.query(
        `SELECT id, oem_number, group_signal, member_count, vendor_count, brand_count,
                canonical_name, canonical_brand, any_in_stock, price_min, price_max
         FROM product_groups WHERE id = $1`,
        [Number(groupId)]
      );
      group = rows[0] ?? null;
    } else {
      // Look up by slug — could be on the group itself OR on a unified product
      const { rows } = await db.query(`
        SELECT pg.id, pg.oem_number, pg.group_signal, pg.member_count,
               pg.vendor_count, pg.brand_count,
               pg.canonical_name, pg.canonical_brand, pg.any_in_stock,
               pg.price_min, pg.price_max
        FROM product_groups pg
        WHERE pg.slug = $1
        UNION ALL
        SELECT pg.id, pg.oem_number, pg.group_signal, pg.member_count,
               pg.vendor_count, pg.brand_count,
               pg.canonical_name, pg.canonical_brand, pg.any_in_stock,
               pg.price_min, pg.price_max
        FROM product_groups pg
        JOIN product_group_members pgm ON pgm.group_id = pg.id
        JOIN catalog_unified cu ON cu.id = pgm.unified_id
        WHERE cu.slug = $1
        LIMIT 1
      `, [slug]);
      group = rows[0] ?? null;
    }

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Fetch all members enriched with live catalog_unified data
    const { rows: members } = await db.query(`
      SELECT
        pgm.vendor_sku,
        pgm.vendor,
        pgm.brand,
        pgm.display_brand,
        pgm.internal_sku,
        pgm.is_canonical,
        -- Live inventory from catalog_unified
        cu.msrp,
        cu.map_price,
        cu.cost,
        cu.in_stock,
        cu.stock_quantity,
        cu.warehouse_wi,
        cu.warehouse_ny,
        cu.warehouse_tx,
        cu.warehouse_nv,
        cu.warehouse_nc,
        cu.image_url,
        cu.image_urls,
        cu.slug,
        cu.name,
        cu.description,
        cu.weight,
        cu.upc
      FROM product_group_members pgm
      JOIN catalog_unified cu ON cu.id = pgm.unified_id
      WHERE pgm.group_id = $1
      ORDER BY
        pgm.is_canonical DESC,   -- canonical first
        cu.in_stock DESC,         -- in-stock before OOS
        cu.stock_quantity DESC,   -- most stock first
        pgm.display_brand ASC     -- then alphabetical brand
    `, [group.id]);

    // Fetch all OEM numbers and brand part numbers for this group
    const { rows: crossrefs } = await db.query(`
      SELECT DISTINCT c.oem_number, c.page_reference
      FROM product_group_members pgm
      JOIN catalog_oem_crossref c ON c.sku = pgm.vendor_sku
      WHERE pgm.group_id = $1
        AND (c.oem_number IS NOT NULL OR c.page_reference IS NOT NULL)
    `, [group.id]);

    const oem_numbers     = [...new Set(crossrefs.map(r => r.oem_number).filter(Boolean))];
    const page_references = [...new Set(crossrefs.map(r => r.page_reference).filter(Boolean))];

    return NextResponse.json({
      group: {
        id:             group.id,
        oem_number:     group.oem_number,
        group_signal:   group.group_signal,
        member_count:   group.member_count,
        vendor_count:   group.vendor_count,
        brand_count:    group.brand_count,
        canonical_name: group.canonical_name,
        any_in_stock:   group.any_in_stock,
        price_min:      group.price_min,
        price_max:      group.price_max,
      },
      options: members,
      oem_numbers,
      page_references,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[products/group GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

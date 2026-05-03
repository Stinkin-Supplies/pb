/**
 * app/api/products/group/route.ts
 * Falls back to catalog_unified when product_groups is empty.
 * Fixed: removed vendor_sku (not in catalog_unified schema)
 */
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug    = (searchParams.get("slug") ?? "").trim();
  const groupId =  searchParams.get("group_id");
  if (!slug && !groupId) {
    return NextResponse.json({ error: "slug or group_id required" }, { status: 400 });
  }
  const db = getCatalogDb();
  try {
    // ── 1. Try product_groups ─────────────────────────────────────
    const groupQuery = groupId
      ? `SELECT id, oem_number, group_signal, member_count, vendor_count, brand_count,
                canonical_name, canonical_brand, any_in_stock, price_min, price_max
         FROM product_groups WHERE id = $1 LIMIT 1`
      : `SELECT pg.id, pg.oem_number, pg.group_signal, pg.member_count,
                pg.vendor_count, pg.brand_count, pg.canonical_name, pg.canonical_brand,
                pg.any_in_stock, pg.price_min, pg.price_max
         FROM product_groups pg WHERE pg.slug = $1
         UNION ALL
         SELECT pg.id, pg.oem_number, pg.group_signal, pg.member_count,
                pg.vendor_count, pg.brand_count, pg.canonical_name, pg.canonical_brand,
                pg.any_in_stock, pg.price_min, pg.price_max
         FROM product_groups pg
         JOIN product_group_members pgm ON pgm.group_id = pg.id
         JOIN catalog_unified cu ON cu.id = pgm.unified_id
         WHERE cu.slug = $1
         LIMIT 1`;
    const { rows: groupRows } = await db.query(groupQuery, [groupId ?? slug]);
    const group = groupRows[0] ?? null;
    if (group) {
      const { rows: members } = await db.query(`
        SELECT pgm.vendor_sku, pgm.vendor, pgm.brand, pgm.display_brand,
               pgm.internal_sku, pgm.is_canonical,
               cu.msrp, cu.map_price, cu.cost, cu.in_stock, cu.stock_quantity,
               cu.warehouse_wi, cu.warehouse_ny, cu.warehouse_tx,
               cu.warehouse_nv, cu.warehouse_nc,
               cu.image_url, cu.image_urls, cu.slug, cu.name,
               cu.description, cu.weight, cu.upc
        FROM product_group_members pgm
        JOIN catalog_unified cu ON cu.id = pgm.unified_id
        WHERE pgm.group_id = $1
        ORDER BY pgm.is_canonical DESC, cu.in_stock DESC,
                 cu.stock_quantity DESC, pgm.display_brand ASC
      `, [group.id]);
      const { rows: crossrefs } = await db.query(`
        SELECT DISTINCT c.oem_number, c.page_reference
        FROM product_group_members pgm
        JOIN catalog_oem_crossref c ON c.sku = pgm.vendor_sku
        WHERE pgm.group_id = $1
          AND (c.oem_number IS NOT NULL OR c.page_reference IS NOT NULL)
      `, [group.id]);
      return NextResponse.json({
        group: {
          id: group.id, oem_number: group.oem_number,
          group_signal: group.group_signal, member_count: group.member_count,
          vendor_count: group.vendor_count, brand_count: group.brand_count,
          canonical_name: group.canonical_name, any_in_stock: group.any_in_stock,
          price_min: group.price_min, price_max: group.price_max,
        },
        options: members,
        oem_numbers:     [...new Set(crossrefs.map((r: any) => r.oem_number).filter(Boolean))],
        page_references: [...new Set(crossrefs.map((r: any) => r.page_reference).filter(Boolean))],
        source: "product_groups",
      });
    }

    // ── 2. Fallback: catalog_unified direct ───────────────────────
    const { rows } = await db.query(`
      SELECT
        cu.id, cu.sku, cu.internal_sku, cu.slug, cu.name, cu.brand,
        cu.category, cu.subcategory, cu.description, cu.features, cu.weight,
        cu.msrp, cu.map_price, cu.has_map_policy, cu.cost,
        cu.in_stock, cu.stock_quantity,
        cu.image_url, cu.image_urls, cu.upc,
        cu.oem_part_number, cu.source_vendor,
        cu.is_harley_fitment, cu.is_universal,
        cu.fitment_hd_families, cu.fitment_hd_codes, cu.fitment_hd_models,
        cu.fitment_year_start, cu.fitment_year_end,
        cu.closeout, cu.drag_part, cu.in_oldbook, cu.in_fatbook,
        cu.warehouse_wi, cu.warehouse_ny, cu.warehouse_tx,
        cu.warehouse_nv, cu.warehouse_nc
      FROM catalog_unified cu
      WHERE cu.slug = $1
      LIMIT 1
    `, [slug]);
    const cu = rows[0] ?? null;
    if (!cu) {
      return NextResponse.json({ error: "Product not found", slug }, { status: 404 });
    }
    return NextResponse.json({
      group: {
        id:             cu.id,
        oem_number:     cu.oem_part_number ?? null,
        group_signal:   "singleton",
        member_count:   1,
        vendor_count:   1,
        brand_count:    1,
        canonical_name: cu.name,
        any_in_stock:   cu.in_stock,
        price_min:      cu.msrp,
        price_max:      cu.msrp,
      },
      options: [{
        vendor_sku:     cu.sku,           // cu.sku = the SKU field that exists
        vendor:         cu.source_vendor,
        brand:          cu.brand,
        display_brand:  cu.brand,
        internal_sku:   cu.internal_sku ?? cu.sku,
        is_canonical:   true,
        msrp:           cu.msrp,
        map_price:      cu.map_price,
        cost:           cu.cost,
        in_stock:       cu.in_stock,
        stock_quantity: cu.stock_quantity,
        warehouse_wi:   cu.warehouse_wi,
        warehouse_ny:   cu.warehouse_ny,
        warehouse_tx:   cu.warehouse_tx,
        warehouse_nv:   cu.warehouse_nv,
        warehouse_nc:   cu.warehouse_nc,
        image_url:      cu.image_url,
        image_urls:     cu.image_urls ?? [],
        slug:           cu.slug,
        name:           cu.name,
        description:    cu.description,
        features:       cu.features,
        weight:         cu.weight,
        upc:            cu.upc,
      }],
      fitment: {
        isHarleyFitment:   cu.is_harley_fitment,
        isUniversal:       cu.is_universal,
        fitmentHdFamilies: cu.fitment_hd_families ?? [],
        fitmentHdCodes:    cu.fitment_hd_codes    ?? [],
        fitmentHdModels:   cu.fitment_hd_models   ?? [],
        fitmentYearStart:  cu.fitment_year_start,
        fitmentYearEnd:    cu.fitment_year_end,
      },
      oem_numbers:     cu.oem_part_number ? [cu.oem_part_number] : [],
      page_references: [],
      source: "catalog_unified",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[products/group GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
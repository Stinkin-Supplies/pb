/**
 * app/api/products/group/route.ts
 * Falls back to catalog_unified when product_groups is empty.
 * Fixed: removed vendor_sku (not in catalog_unified schema)
 */
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

type CrossrefRow = { oem_number: string | null; page_reference: string | null; source_file?: string | null };
type OemFitmentSummaryRow = {
  year_start: number | null;
  year_end: number | null;
  catalog_files: string[] | null;
  sections: string[] | null;
  oem_parts: string[] | null;
};

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
        oem_numbers:     [...new Set((crossrefs as CrossrefRow[]).map((r) => r.oem_number).filter(Boolean))],
        page_references: [...new Set((crossrefs as CrossrefRow[]).map((r) => r.page_reference).filter(Boolean))],
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
        cu.oem_numbers, cu.source_vendor, cu.pdp_payload,
        cu.is_harley_fitment, cu.is_universal,
        cu.fitment_hd_families, cu.fitment_hd_codes, cu.fitment_hd_models,
        cu.fitment_year_start, cu.fitment_year_end,
        cu.closeout, cu.drag_part,
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

    // Pull cross-reference and fitment provenance directly from source fitment tables
    const { rows: crossrefs } = await db.query(`
      SELECT DISTINCT c.oem_number, c.page_reference, c.source_file
      FROM catalog_oem_crossref c
      WHERE c.sku = $1 OR c.sku = $2
    `, [cu.sku, cu.internal_sku ?? cu.sku]);

    const { rows: oemFitmentRows } = await db.query(`
      SELECT
        MIN(catalog_year_start) AS year_start,
        MAX(catalog_year_end) AS year_end,
        array_remove(array_agg(DISTINCT catalog_file), NULL) AS catalog_files,
        array_remove(array_agg(DISTINCT section), NULL) AS sections,
        array_remove(array_agg(DISTINCT oem_part_no), NULL) AS oem_parts
      FROM oem_fitment
      WHERE matched_sku = $1 OR matched_sku = $2
    `, [cu.sku, cu.internal_sku ?? cu.sku]);

    const { rows: puFitmentRows } = await db.query(`
      SELECT
        year_start, year_end, hd_families, hd_models, hd_codes, is_harley, is_universal, parsed_from
      FROM pu_fitment
      WHERE regexp_replace(upper(sku), '[^A-Z0-9]+', '', 'g')
            = regexp_replace(upper($1), '[^A-Z0-9]+', '', 'g')
      LIMIT 1
    `, [cu.sku]);

    const { rows: catalogFitmentRows } = await db.query(`
      SELECT
        cp.id AS catalog_product_id,
        (SELECT COUNT(*) FROM catalog_fitment_v2 cf WHERE cf.product_id = cp.id) AS fitment_v2_rows,
        (SELECT COUNT(*) FROM catalog_fitment_archived ca WHERE ca.product_id = cp.id) AS fitment_archived_rows,
        (SELECT MIN(year_start) FROM catalog_fitment_archived ca WHERE ca.product_id = cp.id) AS archived_year_start,
        (SELECT MAX(year_end) FROM catalog_fitment_archived ca WHERE ca.product_id = cp.id) AS archived_year_end
      FROM catalog_products cp
      WHERE cp.sku = $1
      LIMIT 1
    `, [cu.sku]);

    const oemFitment = (oemFitmentRows[0] as OemFitmentSummaryRow | undefined) ?? null;
    const puFitment = puFitmentRows[0] ?? null;
    const catalogFitment = catalogFitmentRows[0] ?? null;

    const payloadFitment = cu.pdp_payload?.fitment ?? null;
    const payloadOemNumbers = Array.isArray(cu.pdp_payload?.oem_numbers) ? cu.pdp_payload.oem_numbers : [];
    const mergedOem = [
      ...new Set([
        ...(Array.isArray(cu.oem_numbers) ? cu.oem_numbers : []),
        ...payloadOemNumbers,
        ...(crossrefs as CrossrefRow[]).map((r) => r.oem_number).filter(Boolean),
        ...(Array.isArray(oemFitment?.oem_parts) ? oemFitment.oem_parts : []),
      ].filter(Boolean))
    ];

    return NextResponse.json({
      group: {
        id:             cu.id,
        oem_number:     mergedOem[0] ?? null,
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
        pdp_payload:    cu.pdp_payload ?? null,
      }],
      fitment: {
        isHarleyFitment:   payloadFitment?.is_harley_fitment ?? puFitment?.is_harley ?? cu.is_harley_fitment,
        isUniversal:       payloadFitment?.is_universal ?? puFitment?.is_universal ?? cu.is_universal,
        fitmentHdFamilies: payloadFitment?.fitment_hd_families ?? puFitment?.hd_families ?? cu.fitment_hd_families ?? [],
        fitmentHdCodes:    payloadFitment?.fitment_hd_codes ?? puFitment?.hd_codes ?? cu.fitment_hd_codes ?? [],
        fitmentHdModels:   payloadFitment?.fitment_hd_models ?? puFitment?.hd_models ?? cu.fitment_hd_models ?? [],
        fitmentYearStart:  payloadFitment?.fitment_year_start ?? oemFitment?.year_start ?? puFitment?.year_start ?? catalogFitment?.archived_year_start ?? cu.fitment_year_start,
        fitmentYearEnd:    payloadFitment?.fitment_year_end ?? oemFitment?.year_end ?? puFitment?.year_end ?? catalogFitment?.archived_year_end ?? cu.fitment_year_end,
      },
      fitment_sources: {
        catalog_fitment_v2_rows: catalogFitment?.fitment_v2_rows ?? 0,
        catalog_fitment_archived_rows: catalogFitment?.fitment_archived_rows ?? 0,
        pu_fitment_parsed_from: puFitment?.parsed_from ?? null,
        oem_fitment_catalog_files: oemFitment?.catalog_files ?? [],
        oem_fitment_sections: oemFitment?.sections ?? [],
      },
      oem_numbers:     mergedOem,
      page_references: [...new Set((crossrefs as CrossrefRow[]).map((r) => r.page_reference).filter(Boolean))],
      oem_sources: [...new Set((crossrefs as CrossrefRow[]).map((r) => r.source_file).filter(Boolean))],
      source: "catalog_unified",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[products/group GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

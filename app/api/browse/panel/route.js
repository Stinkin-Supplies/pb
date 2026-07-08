import { getCatalogDb } from '@/lib/db/catalog';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get('id') ?? '', 10);

  if (!id || isNaN(id)) {
    return Response.json({ error: 'id required' }, { status: 400 });
  }

  const db = getCatalogDb();

  const [variantsResult, fitmentResult, oemResult] = await Promise.allSettled([

    // ── 1. Variant members ───────────────────────────────────────────────────
    // All members of the same variant group as this product.
    db.query(`
      SELECT
        cvm.product_id,
        cvm.option_1_name,
        cvm.option_1_value,
        cvm.option_2_name,
        cvm.option_2_value,
        cvm.sort_order,
        cu.name,
        cu.slug,
        cu.computed_price AS price,
        cu.vendor_sku,
        cu.source_vendor
      FROM catalog_variant_members cvm
      JOIN catalog_unified cu ON cu.id = cvm.product_id
      WHERE cvm.group_id = (
        SELECT variant_group_id
        FROM catalog_unified
        WHERE id = $1
          AND variant_group_id IS NOT NULL
        LIMIT 1
      )
        AND cu.is_active = true
      ORDER BY cvm.sort_order, cvm.option_1_value
    `, [id]),

    // ── 2. Fitment rows → compressed to year ranges per model ────────────────
    db.query(`
      SELECT
        hm.model_code,
        hm.name                   AS model_name,
        hf.name                   AS family_name,
        MIN(hmy.year)             AS year_from,
        MAX(hmy.year)             AS year_to,
        COUNT(DISTINCT hmy.year)  AS year_count
      FROM catalog_fitment_v2 cf
      JOIN harley_model_years hmy ON hmy.id  = cf.model_year_id
      JOIN harley_models hm       ON hm.id   = hmy.model_id
      JOIN harley_families hf     ON hf.id   = hm.family_id
      WHERE cf.product_id = $1
      -- grouped by model_name too: a code like FLHX was reused for a
      -- different model name in an earlier era; keep those eras separate
      GROUP BY hm.model_code, hm.name, hf.name
      ORDER BY hf.name, hm.model_code, year_from
    `, [id]),

    // ── 3. OEM cross-reference — direct + chain products ────────────────────
    // Two-tier CTE:
    //   direct_products  — products sharing an exact OEM number with this product
    //   chain_products   — products one hop away via oem_supersession, not already in direct
    // Tag logic on frontend:
    //   is_kit=true  → "KIT INCLUDES OEM"
    //   via_chain    → "OEM CHAIN"
    //   else         → "EXACT OEM MATCH"
    db.query(`
      WITH my_oems AS (
        SELECT oem_number
        FROM catalog_oem_crossref
        WHERE product_id = $1
          AND oem_format IN ('hd_oem', 'hd_oem_nodash')
          AND expanded_from = FALSE
      ),
      direct_products AS (
        SELECT DISTINCT ON (cu.id)
          cu.id,
          cu.name,
          cu.slug,
          cu.brand,
          cu.computed_price AS price,
          cu.is_kit,
          coc.oem_number,
          FALSE AS via_chain
        FROM my_oems mo
        JOIN catalog_oem_crossref coc ON coc.oem_number = mo.oem_number
        JOIN catalog_unified cu       ON cu.id = coc.product_id
        WHERE coc.product_id <> $1
          AND cu.is_active = true
        ORDER BY cu.id, cu.computed_price
        LIMIT 12
      ),
      chain_products AS (
        SELECT DISTINCT ON (cu.id)
          cu.id,
          cu.name,
          cu.slug,
          cu.brand,
          cu.computed_price AS price,
          cu.is_kit,
          coc.oem_number,
          TRUE AS via_chain
        FROM my_oems mo
        JOIN oem_supersession os
          ON os.from_oem_norm = normalize_oem(mo.oem_number)
          OR os.to_oem_norm   = normalize_oem(mo.oem_number)
        JOIN catalog_oem_crossref coc
          ON normalize_oem(coc.oem_number) IN (os.from_oem_norm, os.to_oem_norm)
          AND coc.oem_format IN ('hd_oem', 'hd_oem_nodash')
          AND coc.expanded_from = FALSE
        JOIN catalog_unified cu ON cu.id = coc.product_id
        WHERE cu.is_active = true
          AND coc.product_id <> $1
          AND cu.id NOT IN (SELECT id FROM direct_products)
        ORDER BY cu.id, cu.computed_price
        LIMIT 8
      )
      SELECT id, name, slug, brand, price, is_kit, oem_number, via_chain
      FROM direct_products
      UNION ALL
      SELECT id, name, slug, brand, price, is_kit, oem_number, via_chain
      FROM chain_products
      ORDER BY via_chain, name
    `, [id]),

  ]);

  return Response.json({
    variants: variantsResult.status === 'fulfilled' ? variantsResult.value.rows : [],
    fitment:  fitmentResult.status  === 'fulfilled' ? fitmentResult.value.rows  : [],
    oem:      oemResult.status      === 'fulfilled' ? oemResult.value.rows      : [],
  });
}

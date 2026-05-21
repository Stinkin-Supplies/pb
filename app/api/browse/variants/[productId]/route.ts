import { NextRequest, NextResponse } from 'next/server';
import getCatalogDb from '@/lib/db/catalog';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const id = parseInt(productId);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });

  const db = getCatalogDb();

  try {
    const groupRow = await db.query(`
      SELECT cvg.id as group_id, cvg.display_name, cvg.source_vendor, cvg.family_key
      FROM catalog_variant_groups cvg
      JOIN catalog_variant_members cvm ON cvm.group_id = cvg.id
      WHERE cvm.product_id = $1
    `, [id]);

    if (groupRow.rows.length === 0) {
      return NextResponse.json({ hasVariants: false, variants: [] });
    }

    const { group_id, display_name, source_vendor, family_key } = groupRow.rows[0];

    // DISTINCT ON deduplicates PU products with identical names but different vendor_skus.
    // Image falls back to cu.image_url (LeMans CDN) when catalog_media has no entry.
    const siblings = await db.query(`
      SELECT DISTINCT ON (COALESCE(cvm.option_1_value, cu.id::text))
        cu.id,
        cu.sku,
        cu.name,
        cu.brand AS brand_name,
        cu.slug,
        cu.msrp,
        cu.is_active,
        cvm.option_1_name,
        cvm.option_1_value,
        cvm.sort_order,
        COALESCE(vo.total_qty, 0) AS stock_qty,
        COALESCE(vo.msrp, cu.msrp) AS offer_price,
        COALESCE(
          (SELECT json_agg(fb ORDER BY fb->>'family')
           FROM (
             SELECT json_build_object(
               'family', hf.name,
               'min_year', MIN(hmy.year),
               'max_year', MAX(hmy.year)
             ) AS fb
             FROM catalog_fitment_v2 cfv
             JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
             JOIN harley_models hm ON hm.id = hmy.model_id
             JOIN harley_families hf ON hf.id = hm.family_id
             WHERE cfv.product_id = cu.id
             GROUP BY hf.name
           ) sub),
          '[]'::json
        ) AS fitment_by_family,
        COALESCE(
          (SELECT cm.url FROM catalog_media cm
           WHERE cm.product_id = cu.id
           ORDER BY cm.priority ASC, cm.id ASC LIMIT 1),
          cu.image_url
        ) AS image_url,
        cu.oem_numbers
      FROM catalog_variant_members cvm
      JOIN catalog_unified cu ON cu.id = cvm.product_id
      LEFT JOIN vendor_offers vo ON vo.catalog_product_id = cu.id
      WHERE cvm.group_id = $1
      ORDER BY
        COALESCE(cvm.option_1_value, cu.id::text),
        (COALESCE(vo.total_qty, 0) > 0) DESC,
        COALESCE(vo.msrp, cu.msrp) ASC,
        cu.id ASC
    `, [group_id]);

    // Find sibling groups — linked by family_key (explicit, cross-vendor)
    // or by base name prefix (auto, same vendor).
    const baseName = display_name.replace(/\s*-\s*[^-]+$/, '').trim();
    const siblingRows = await db.query(`
      SELECT DISTINCT ON (cvg.id)
        cvg.id,
        cvg.display_name,
        cu.slug AS representative_slug
      FROM catalog_variant_groups cvg
      JOIN catalog_variant_members cvm ON cvm.group_id = cvg.id
      JOIN catalog_unified cu ON cu.id = cvm.product_id
      WHERE cvg.id != $1
        AND cvm.sort_order = 0
        AND (
          ($4::text IS NOT NULL AND cvg.family_key = $4)
          OR ($4::text IS NULL AND cvg.source_vendor = $2 AND cvg.display_name ILIKE $3)
        )
      ORDER BY cvg.id, cvg.display_name
      LIMIT 10
    `, [group_id, source_vendor, `${baseName}%`, family_key ?? null]);

    const siblingGroups = siblingRows.rows.map(r => ({
      id: r.id,
      displayName: r.display_name,
      representativeSlug: r.representative_slug,
    }));

    return NextResponse.json({
      hasVariants: true,
      group: { id: group_id, displayName: display_name },
      currentProductId: id,
      variants: siblings.rows,
      siblingGroups: siblingGroups.length > 0 ? siblingGroups : undefined,
    });

  } catch (e) {
    console.error('variants route error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

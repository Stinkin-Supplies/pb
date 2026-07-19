// Run: node pdp_fallback_patch.js
// From: ~/Desktop/Stinkin-Supplies/scripts/ingest/
// Patches app/shop/[slug]/page.jsx to fall back to catalog_unified
// when a product slug is not found in catalog_products

const fs = require('fs');
const FILE = 'app/shop/[slug]/page.jsx';

let content = fs.readFileSync(FILE, 'utf8');

// Find the notFound() line after the try/catch and insert the fallback before it
const TARGET = `  if (!productRow) notFound();`;

if (!content.includes(TARGET)) {
  console.error('Target line not found — may already be patched or file changed');
  process.exit(1);
}

const FALLBACK = `  // Fallback: catalog_unified for PU-only products not in catalog_products
  if (!productRow) {
    try {
      const { rows: urows } = await catalogDb.query(
        \`SELECT
          cu.id,
          cu.sku,
          cu.slug,
          cu.name,
          COALESCE(cu.display_brand, cu.brand) AS brand,
          cu.category,
          cu.description,
          cu.weight,
          cu.brand_part_number   AS manufacturer_part_number,
          COALESCE(cu.msrp, cu.cost, 0) AS price,
          cu.msrp,
          cu.map_price,
          cu.is_active,
          cu.is_discontinued,
          cu.created_at,
          CASE WHEN cu.image_url IS NOT NULL
               THEN ARRAY[cu.image_url]
               ELSE '{}'::text[]
          END AS images,
          COALESCE(cu.stock_quantity, 0) AS stock_quantity,
          ARRAY[cu.source_vendor]        AS vendor_codes,
          cu.upc,
          cu.features,
          cu.fitment_year_start,
          cu.fitment_year_end,
          cu.fitment_hd_families,
          cu.is_harley_fitment,
          cu.is_universal,
          cu.in_oldbook,
          cu.in_fatbook,
          cu.drag_part
        FROM public.catalog_unified cu
        WHERE cu.slug = $1
        LIMIT 1\`,
        [slug]
      );
      if (urows[0]) { productRow = urows[0]; productRow._fromUnified = true; }
    } catch (err) {
      console.error('[PDP] unified fallback failed:', err.message);
    }
  }

`;

content = content.replace(TARGET, FALLBACK + TARGET);
fs.writeFileSync(FILE, content);
console.log('✓ Patched', FILE);

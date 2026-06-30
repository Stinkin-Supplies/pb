import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const model     = req.nextUrl.searchParams.get('model');
  const category  = req.nextUrl.searchParams.get('category');
  const subcat    = req.nextUrl.searchParams.get('subcat');

  // Return model list for selector
  if (!model) {
    const { rows } = await pool.query(`
      SELECT DISTINCT hf.name AS family, hm.model_code
      FROM harley_families hf
      JOIN harley_models hm ON hm.family_id = hf.id
      WHERE EXISTS (SELECT 1 FROM oem_fitment f WHERE hm.model_code = ANY(f.model_codes))
      ORDER BY hf.name, hm.model_code
    `);
    return NextResponse.json({ models: rows });
  }

  // Return parts timeline for a model
  const params: (string | number)[] = [model];
  let catFilter = '';
  if (category) { params.push(category); catFilter += ` AND cu.display_category = $${params.length}`; }
  if (subcat)   { params.push(subcat);   catFilter += ` AND cu.display_subcategory = $${params.length}`; }

  const { rows } = await pool.query(`
    SELECT
      COALESCE(cu.display_category, 'Unmatched')    AS category,
      COALESCE(cu.display_subcategory, '—')          AS subcategory,
      COALESCE(cu.name, '(no product match)')        AS part_name,
      f.oem_part_no,
      f.catalog_year_start                           AS year_start,
      f.catalog_year_end                             AS year_end,
      f.matched_product_id                           AS product_id,
      cu.sku,
      cu.computed_price,
      cu.source_vendor
    FROM oem_fitment f
    LEFT JOIN catalog_unified cu ON cu.id = f.matched_product_id
    WHERE $1 = ANY(f.model_codes)
      AND NOT f.fits_all_models
      ${catFilter}
    ORDER BY
      COALESCE(cu.display_category, 'Unmatched'),
      COALESCE(cu.display_subcategory, '—'),
      COALESCE(cu.name, f.oem_part_no),
      f.catalog_year_start
  `, params);

  // Group into category > subcategory > part_name > spans
  const tree: Record<string, Record<string, Record<string, {
    oem_part_no: string; year_start: number; year_end: number;
    product_id: number | null; sku: string | null;
    computed_price: string | null; source_vendor: string | null;
  }[]>>> = {};

  for (const r of rows) {
    const cat  = r.category;
    const sub  = r.subcategory;
    const name = r.part_name;
    if (!tree[cat]) tree[cat] = {};
    if (!tree[cat][sub]) tree[cat][sub] = {};
    if (!tree[cat][sub][name]) tree[cat][sub][name] = [];
    tree[cat][sub][name].push({
      oem_part_no:    r.oem_part_no,
      year_start:     parseInt(r.year_start),
      year_end:       parseInt(r.year_end),
      product_id:     r.product_id ?? null,
      sku:            r.sku ?? null,
      computed_price: r.computed_price ?? null,
      source_vendor:  r.source_vendor ?? null,
    });
  }

  // Get year range for this model
  const { rows: yearRows } = await pool.query(`
    SELECT MIN(f.catalog_year_start) AS min_year, MAX(f.catalog_year_end) AS max_year
    FROM oem_fitment f
    WHERE $1 = ANY(f.model_codes) AND NOT f.fits_all_models
  `, [model]);

  // Get category list for this model (for filter UI)
  const { rows: catRows } = await pool.query(`
    SELECT DISTINCT cu.display_category, cu.display_subcategory
    FROM oem_fitment f
    JOIN catalog_unified cu ON cu.id = f.matched_product_id
    WHERE $1 = ANY(f.model_codes) AND NOT f.fits_all_models
      AND cu.display_category IS NOT NULL
    ORDER BY 1, 2
  `, [model]);

  return NextResponse.json({
    model,
    min_year: parseInt(yearRows[0]?.min_year ?? '1954'),
    max_year: parseInt(yearRows[0]?.max_year ?? '2026'),
    categories: catRows,
    tree,
  });
}

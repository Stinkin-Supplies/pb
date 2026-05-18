// app/api/harley/[family]/[model]/products/route.ts
// Products by family + filter_group with year range + category filters
// Extends harley2/style-products pattern using existing lib infrastructure

import { NextRequest, NextResponse } from 'next/server';
import getCatalogDb from '@/lib/db/catalog';
import { normalizeHarleyProductRow } from '@/lib/harley/catalog';
import { HARLEY_CATEGORIES } from '@/lib/harley/config';

const FAMILY_SLUG_MAP: Record<string, string> = {
  'touring':        'Touring',
  'softail':        'Softail',
  'sportster':      'Sportster',
  'dyna':           'Dyna',
  'fxr':            'FXR',
  'vintage':        'Vintage',
  'revolution-max': 'Revolution Max',
  'trike':          'Trike',
};

function slugToFilterGroup(slug: string): string {
  return slug.toUpperCase().replace(/-/g, '_');
}

const ORDER_MAP: Record<string, string> = {
  relevance:  'cu.in_stock DESC, cu.stock_quantity DESC, cu.name ASC',
  price_asc:  'cu.computed_price ASC NULLS LAST',
  price_desc: 'cu.computed_price DESC NULLS LAST',
  name_asc:   'cu.name ASC',
  newest:     'cu.id DESC',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ family: string; model: string }> }
) {
  const { family, model } = await params;
  const familyName  = FAMILY_SLUG_MAP[family.toLowerCase()];
  const filterGroup = slugToFilterGroup(model);

  if (!familyName) {
    return NextResponse.json({ error: 'Unknown family' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const page      = Math.max(1, parseInt(searchParams.get('page')      ?? '1',  10));
  const perPage   = Math.min(96, parseInt(searchParams.get('per_page') ?? '48', 10));
  const sort      = searchParams.get('sort')      ?? 'relevance';
  const category  = searchParams.get('category')  ?? null;
  const inStock   = searchParams.get('in_stock')  === 'true';
  const yearMin   = searchParams.get('year_min')  ? parseInt(searchParams.get('year_min')!, 10) : null;
  const yearMax   = searchParams.get('year_max')  ? parseInt(searchParams.get('year_max')!, 10) : null;
  const offset    = (page - 1) * perPage;
  const orderBy   = ORDER_MAP[sort] ?? ORDER_MAP.relevance;

  // Resolve category slug → db category values using existing HARLEY_CATEGORIES
  let dbCategories: string[] | null = null;
  if (category) {
    const match = HARLEY_CATEGORIES.find(c => c.slug === category || c.label === category);
    dbCategories = match?.dbCategories ?? [category];
  }

  const db = getCatalogDb();

  try {
    const values: unknown[] = [filterGroup];
    let idx = 2;
    const extraConditions: string[] = [];

    if (yearMin)        { extraConditions.push(`hmy.year >= $${idx++}`); values.push(yearMin); }
    if (yearMax)        { extraConditions.push(`hmy.year <= $${idx++}`); values.push(yearMax); }
    if (dbCategories)   { extraConditions.push(`cu.category = ANY($${idx++}::text[])`); values.push(dbCategories); }
    if (inStock)        { extraConditions.push(`cu.in_stock = true`); }

    const extraWhere = extraConditions.length ? 'AND ' + extraConditions.join(' AND ') : '';

    const fitmentJoin = `
      EXISTS (
        SELECT 1
        FROM catalog_fitment_v2 cfv
        JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
        JOIN harley_models hm       ON hm.id  = hmy.model_id
        WHERE cfv.product_id = cu.id
          AND (
            hm.filter_group = $1
            OR EXISTS (
              SELECT 1 FROM model_filter_groups mfg
              WHERE mfg.model_id = hm.id AND mfg.filter_group = $1
            )
          )
          ${extraConditions.filter(c => c.includes('hmy.year')).map(c => `AND ${c.replace('hmy.year', 'hmy.year')}`).join(' ')}
      )
    `;

    // Rebuild cleanly — year conditions need to be inside the EXISTS subquery
    const yearConditions: string[] = [];
    const outerConditions: string[] = [];
    const yearValues: unknown[] = [filterGroup];
    let yi = 2;

    if (yearMin) { yearConditions.push(`hmy.year >= $${yi++}`); yearValues.push(yearMin); }
    if (yearMax) { yearConditions.push(`hmy.year <= $${yi++}`); yearValues.push(yearMax); }
    if (dbCategories) { outerConditions.push(`cu.category = ANY($${yi++}::text[])`); yearValues.push(dbCategories); }
    if (inStock) { outerConditions.push(`cu.in_stock = true`); }

    const yearWhere   = yearConditions.length  ? 'AND ' + yearConditions.join(' AND ')  : '';
    const outerWhere  = outerConditions.length ? 'AND ' + outerConditions.join(' AND ') : '';

    const baseWhere = `
      cu.is_active = true
      AND EXISTS (
        SELECT 1
        FROM catalog_fitment_v2 cfv
        JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
        JOIN harley_models hm       ON hm.id  = hmy.model_id
        WHERE cfv.product_id = cu.id
          AND (
            hm.filter_group = $1
            OR EXISTS (
              SELECT 1 FROM model_filter_groups mfg
              WHERE mfg.model_id = hm.id AND mfg.filter_group = $1
            )
          )
          ${yearWhere}
      )
      ${outerWhere}
    `;

    const selectFields = `
      cu.id, cu.sku, cu.internal_sku, cu.slug, cu.name, cu.brand, cu.category,
      COALESCE(cu.computed_price, cu.msrp, cu.cost, 0) AS price,
      cu.msrp, cu.map_price, cu.description, cu.is_active,
      cu.image_url, cu.image_urls, cu.stock_quantity, cu.in_stock,
      cu.source_vendor, cu.is_harley_fitment,
      cu.fitment_year_start, cu.fitment_year_end
    `;

    const [productsRes, countRes, facetsRes, yearRes] = await Promise.all([
      db.query(`
        SELECT ${selectFields}
        FROM catalog_unified cu
        WHERE ${baseWhere}
        ORDER BY ${orderBy}
        LIMIT $${yi} OFFSET $${yi + 1}
      `, [...yearValues, perPage, offset]),

      db.query(`
        SELECT COUNT(DISTINCT cu.id) AS total
        FROM catalog_unified cu
        WHERE ${baseWhere}
      `, yearValues),

      db.query(`
        SELECT cu.category, COUNT(DISTINCT cu.id) AS count
        FROM catalog_unified cu
        WHERE ${baseWhere}
          AND cu.category IS NOT NULL
        GROUP BY cu.category
        ORDER BY count DESC
        LIMIT 30
      `, yearValues),

      db.query(`
        SELECT MIN(hmy.year) AS year_min, MAX(hmy.year) AS year_max
        FROM harley_model_years hmy
        JOIN harley_models hm ON hm.id = hmy.model_id
        WHERE hm.filter_group = $1
          OR EXISTS (
            SELECT 1 FROM model_filter_groups mfg
            WHERE mfg.model_id = hm.id AND mfg.filter_group = $1
          )
      `, [filterGroup]),
    ]);

    return NextResponse.json({
      products:   productsRes.rows.map(normalizeHarleyProductRow),
      total:      parseInt(countRes.rows[0].total, 10),
      page,
      per_page:   perPage,
      year_range: {
        min: yearRes.rows[0]?.year_min ?? null,
        max: yearRes.rows[0]?.year_max ?? null,
      },
      facets: {
        categories: facetsRes.rows.map(r => ({
          name:  r.category,
          count: parseInt(r.count, 10),
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[harley/[family]/[model]/products]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
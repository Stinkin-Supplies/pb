/**
 * app/api/models/[family]/parts/route.ts
 * Returns parts grouped by display_category → display_subcategory → era bucket
 * for a given HD family. Era buckets derived from hd_engine_types year ranges.
 */

import { NextRequest, NextResponse } from 'next/server';
import getCatalogDb from '@/lib/db/catalog';

const VALID_FAMILIES = ['Touring','Softail','Dyna','Sportster','FXR','Shovelhead','Trike','V-Rod','Street'];
const VINTAGE_FAMILIES = ['Panhead','Knucklehead','Flathead'];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ family: string }> }
) {
  const { family } = await params;
  const slug = family.toLowerCase();

  // Vintage is a special multi-family grouping
  const isVintage = slug === 'vintage';
  const isShovelhead = slug === 'shovelhead';

  const familyName = isVintage
    ? null
    : VALID_FAMILIES.find(f => f.toLowerCase() === slug);

  if (!familyName && !isVintage) {
    return NextResponse.json({ error: 'Unknown family' }, { status: 404 });
  }

  const db = getCatalogDb();

  try {
    // Engine era boundaries from your hd_engine_types table
    const { rows: eras } = await db.query(`
      SELECT name, year_start, COALESCE(year_end, 2099) AS year_end
      FROM hd_engine_types
      WHERE year_start IS NOT NULL
        AND name NOT IN ('Original Single','Atmospheric V-Twin','F-Head V-Twin',
                         'Revolution V-Twin','Screamin Eagle Crate Engine','Revolution Max V-Twin')
      ORDER BY year_start
    `);

    // Build family WHERE clause
    let familyWhere: string;
    let familyParams: string[];
    if (isVintage) {
      familyWhere = `hf.name = ANY($1::text[])`;
      familyParams = [VINTAGE_FAMILIES as unknown as string];
    } else {
      familyWhere = `hf.name = $1`;
      familyParams = [familyName!];
    }

    // Main query: group by category, subcategory, and era bucket
    const { rows } = await db.query(`
      SELECT
        cu.display_category,
        cu.display_subcategory,
        MIN(hmy.year)          AS year_start,
        MAX(hmy.year)          AS year_end,
        COUNT(DISTINCT cu.id)  AS product_count
      FROM catalog_unified cu
      JOIN catalog_fitment_v2 cfv  ON cfv.product_id    = cu.id
      JOIN harley_model_years hmy  ON hmy.id            = cfv.model_year_id
      JOIN harley_models hm        ON hm.id             = hmy.model_id
      JOIN harley_families hf      ON hf.id             = hm.family_id
      WHERE ${familyWhere}
        AND cu.is_active    = true
        AND cu.display_category IS NOT NULL
      GROUP BY
        cu.display_category,
        cu.display_subcategory,
        (SELECT het.name FROM hd_engine_types het
         WHERE het.year_start IS NOT NULL
           AND het.name NOT IN ('Original Single','Atmospheric V-Twin','F-Head V-Twin',
                                'Revolution V-Twin','Screamin Eagle Crate Engine','Revolution Max V-Twin')
           AND hmy.year >= het.year_start
           AND hmy.year <= COALESCE(het.year_end, 2099)
         ORDER BY het.year_start DESC LIMIT 1)
      ORDER BY
        cu.display_category,
        cu.display_subcategory NULLS LAST,
        MIN(hmy.year)
    `, isVintage ? [VINTAGE_FAMILIES] : [familyName]);

    // Structure: { [category]: { [subcategory]: [ {year_start, year_end, count, era} ] } }
    const catalog: Record<string, Record<string, {
      year_start: number;
      year_end: number;
      product_count: number;
      era_name: string | null;
    }[]>> = {};

    // Build era lookup: given a year, find which era it belongs to
    function getEraForYear(year: number): string | null {
      for (let i = eras.length - 1; i >= 0; i--) {
        const e = eras[i];
        if (year >= e.year_start && year <= e.year_end) return e.name;
      }
      return null;
    }

    for (const row of rows) {
      const cat    = row.display_category;
      const subcat = row.display_subcategory ?? '(General)';
      const ys     = parseInt(row.year_start);
      const ye     = parseInt(row.year_end);
      const mid    = Math.round((ys + ye) / 2);

      if (!catalog[cat]) catalog[cat] = {};
      if (!catalog[cat][subcat]) catalog[cat][subcat] = [];

      catalog[cat][subcat].push({
        year_start:    ys,
        year_end:      ye,
        product_count: parseInt(row.product_count),
        era_name:      getEraForYear(mid),
      });
    }

    // Category totals for display
    const categoryTotals: Record<string, number> = {};
    for (const [cat, subcats] of Object.entries(catalog)) {
      categoryTotals[cat] = Object.values(subcats)
        .flat()
        .reduce((s, r) => s + r.product_count, 0);
    }

    return NextResponse.json({
      family:          isVintage ? 'vintage' : familyName,
      catalog,
      categoryTotals,
      eras:            eras.map(e => ({ name: e.name, year_start: e.year_start, year_end: e.year_end })),
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[models/parts]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

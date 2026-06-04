/**
 * app/api/models/[family]/parts/route.ts
 *
 * Queries mv_family_product_ranges materialized view — sub-50ms for all families.
 * Refresh the mat view after each ingest:
 *   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_family_product_ranges;
 */

import { NextRequest, NextResponse } from 'next/server';
import getCatalogDb from '@/lib/db/catalog';

const VALID_FAMILIES   = ['Touring','Softail','Dyna','Sportster','FXR','Shovelhead','Trike','V-Rod','Street'];
const VINTAGE_FAMILIES = ['Panhead','Knucklehead','Flathead'];
const ERA_EXCLUDES     = ['Original Single','Atmospheric V-Twin','F-Head V-Twin',
                          'Revolution V-Twin','Screamin Eagle Crate Engine','Revolution Max V-Twin'];

let eraCache: { name: string; year_start: number; year_end: number }[] | null = null;

function getEraForYear(
  year: number,
  eras: { name: string; year_start: number; year_end: number }[]
): string | null {
  for (let i = eras.length - 1; i >= 0; i--) {
    if (year >= eras[i].year_start && year <= eras[i].year_end) return eras[i].name;
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ family: string }> }
) {
  const { family } = await params;
  const slug       = family.toLowerCase();
  const isVintage  = slug === 'vintage';
  const familyName = isVintage
    ? null
    : VALID_FAMILIES.find(f => f.toLowerCase() === slug);

  if (!familyName && !isVintage) {
    return NextResponse.json({ error: 'Unknown family' }, { status: 404 });
  }

  const db = getCatalogDb();

  try {
    // ── Era boundaries — cached, tiny table ────────────────────────────────
    if (!eraCache) {
      const { rows } = await db.query(`
        SELECT name,
               year_start,
               COALESCE(year_end, 2099) AS year_end
        FROM hd_engine_types
        WHERE year_start IS NOT NULL
          AND name != ALL($1)
        ORDER BY year_start
      `, [ERA_EXCLUDES]);
      eraCache = rows.map((r: { name: string; year_start: string; year_end: string }) => ({
        name:       r.name,
        year_start: parseInt(r.year_start),
        year_end:   parseInt(r.year_end),
      }));
    }
    const eras = eraCache;

    // ── Main query — hits mat view, instant ────────────────────────────────
    const familyParam  = isVintage ? VINTAGE_FAMILIES : [familyName!];
    const familyClause = isVintage
      ? `family_name = ANY($1::text[])`
      : `family_name = $1`;

    const { rows } = await db.query(`
      SELECT
        display_category,
        display_subcategory,
        MIN(year_start) AS year_start,
        MAX(year_end)   AS year_end,
        COUNT(*)        AS product_count
      FROM mv_family_product_ranges
      WHERE ${familyClause}
      GROUP BY display_category, display_subcategory
      ORDER BY display_category, display_subcategory NULLS LAST
    `, familyParam);

    // ── Build catalog structure + resolve era in JS ────────────────────────
    const catalog: Record<string, Record<string, {
      year_start:    number;
      year_end:      number;
      product_count: number;
      era_name:      string | null;
    }[]>> = {};

    for (const row of rows) {
      const cat    = row.display_category as string;
      const subcat = (row.display_subcategory as string) ?? '(General)';
      const ys     = parseInt(row.year_start);
      const ye     = parseInt(row.year_end);
      const mid    = Math.round((ys + ye) / 2);

      if (!catalog[cat])         catalog[cat] = {};
      if (!catalog[cat][subcat]) catalog[cat][subcat] = [];

      catalog[cat][subcat].push({
        year_start:    ys,
        year_end:      ye,
        product_count: parseInt(row.product_count),
        era_name:      getEraForYear(mid, eras),
      });
    }

    const categoryTotals: Record<string, number> = {};
    for (const [cat, subcats] of Object.entries(catalog)) {
      categoryTotals[cat] = Object.values(subcats)
        .flat()
        .reduce((s, r) => s + r.product_count, 0);
    }

    return NextResponse.json({
      family: isVintage ? 'vintage' : familyName,
      catalog,
      categoryTotals,
      eras,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[models/parts]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

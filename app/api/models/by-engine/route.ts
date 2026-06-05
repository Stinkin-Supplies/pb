/**
 * app/api/models/by-engine/route.ts
 *
 * GET /api/models/by-engine?engine=twincam
 *
 * Returns the Harley model families and year range for a given engine era.
 * Uses harley_families and harley_model_years tables.
 *
 * Response:
 * {
 *   families: ['Softail', 'Touring', 'Dyna', 'V-Rod'],
 *   yearRange: [1999, 2017]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCatalogDb } from '@/lib/db/catalog';

// Maps ModelFinder engine IDs → harley_families era names
// Matches the eras defined in lib/eras/config.ts
const ENGINE_TO_ERA: Record<string, string[]> = {
  antique:    ['Flathead'],
  knuckle:    ['Knucklehead'],
  panhead:    ['Panhead'],
  shovelhead: ['Shovelhead'],
  ironhead:   ['Ironhead Sportster'],
  evolution:  ['Evolution', 'Evo Sportster'],
  twincam:    ['Twin Cam'],
  m8:         ['Milwaukee Eight'],
};

// Families to exclude from results (universal/chopper — not real model families)
const EXCLUDE_FAMILIES = new Set(['Chopper', 'Universal', 'All Makes']);

export async function GET(req: NextRequest) {
  const engine = req.nextUrl.searchParams.get('engine');
  if (!engine) {
    return NextResponse.json({ error: 'engine param required' }, { status: 400 });
  }

  const eraNames = ENGINE_TO_ERA[engine];
  if (!eraNames) {
    return NextResponse.json({ error: 'Unknown engine' }, { status: 400 });
  }

  const db = getCatalogDb();

  try {
    // Get distinct Harley families that have products in this era
    // Join through harley_model_years to get year ranges
    const familyRows = await db.query<{ name: string; year_min: number; year_max: number }>(`
      SELECT DISTINCT
        hf.name,
        MIN(hmy.year) AS year_min,
        MAX(hmy.year) AS year_max
      FROM harley_families hf
      JOIN harley_models hm ON hm.family_id = hf.id
      JOIN harley_model_years hmy ON hmy.model_id = hm.id
      JOIN catalog_fitment_v2 cf ON cf.model_year_id = hmy.id
      JOIN catalog_unified cu ON cu.id = cf.product_id AND cu.is_active = true
      WHERE hf.era = ANY($1::text[])
        AND hf.name != ALL($2::text[])
      GROUP BY hf.name
      ORDER BY hf.name
    `, [eraNames, Array.from(EXCLUDE_FAMILIES)]);

    // If no fitment-backed families found, fall back to all families in era
    let families: string[];
    let yearMin: number;
    let yearMax: number;

    if (familyRows.rows.length > 0) {
      families = familyRows.rows.map(r => r.name);
      yearMin  = Math.min(...familyRows.rows.map(r => r.year_min));
      yearMax  = Math.max(...familyRows.rows.map(r => r.year_max));
    } else {
      // Fallback: any family in this era regardless of product coverage
      const fallback = await db.query<{ name: string }>(`
        SELECT DISTINCT name FROM harley_families
        WHERE era = ANY($1::text[])
          AND name != ALL($2::text[])
        ORDER BY name
      `, [eraNames, Array.from(EXCLUDE_FAMILIES)]);

      families = fallback.rows.map(r => r.name);

      // Year range from harley_model_years
      const yearRange = await db.query<{ y_min: number; y_max: number }>(`
        SELECT MIN(hmy.year) AS y_min, MAX(hmy.year) AS y_max
        FROM harley_model_years hmy
        JOIN harley_models hm ON hm.id = hmy.model_id
        JOIN harley_families hf ON hf.id = hm.family_id
        WHERE hf.era = ANY($1::text[])
      `, [eraNames]);

      yearMin = yearRange.rows[0]?.y_min ?? 1984;
      yearMax = yearRange.rows[0]?.y_max ?? new Date().getFullYear();
    }

    return NextResponse.json({
      engine,
      families,
      yearRange: [yearMin, yearMax],
    }, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }
    });

  } catch (err) {
    console.error('[by-engine] DB error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

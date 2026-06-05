/**
 * app/api/models/codes/route.ts
 *
 * GET /api/models/codes?engine=twincam&family=Softail
 *
 * Returns the model codes (e.g. FLSTC, FXST) for a given family + engine era.
 * Ordered alphabetically. Only codes that have at least one active product with fitment.
 *
 * Response:
 * { codes: ['FLDE', 'FLSL', 'FXBB', 'FXBR', ...] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCatalogDb } from '@/lib/db/catalog';

// Same mapping as by-engine route
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

export async function GET(req: NextRequest) {
  const engine = req.nextUrl.searchParams.get('engine');
  const family = req.nextUrl.searchParams.get('family');

  if (!engine || !family) {
    return NextResponse.json({ error: 'engine and family params required' }, { status: 400 });
  }

  const eraNames = ENGINE_TO_ERA[engine];
  if (!eraNames) {
    return NextResponse.json({ codes: [] });
  }

  const db = getCatalogDb();

  try {
    // Get distinct model codes that have products with fitment in this family+era
    const result = await db.query<{ model_code: string }>(`
      SELECT DISTINCT hm.model_code
      FROM harley_models hm
      JOIN harley_families hf ON hf.id = hm.family_id
      JOIN harley_model_years hmy ON hmy.model_id = hm.id
      JOIN catalog_fitment_v2 cf ON cf.model_year_id = hmy.id
      JOIN catalog_unified cu ON cu.id = cf.product_id AND cu.is_active = true
      WHERE hf.name = $1
        AND hf.era = ANY($2::text[])
      ORDER BY hm.model_code
    `, [family, eraNames]);

    // If no fitment-backed codes found, fall back to all codes for this family
    let codes: string[];
    if (result.rows.length > 0) {
      codes = result.rows.map(r => r.model_code);
    } else {
      const fallback = await db.query<{ model_code: string }>(`
        SELECT DISTINCT hm.model_code
        FROM harley_models hm
        JOIN harley_families hf ON hf.id = hm.family_id
        WHERE hf.name = $1
          AND hf.era = ANY($2::text[])
        ORDER BY hm.model_code
      `, [family, eraNames]);
      codes = fallback.rows.map(r => r.model_code);
    }

    return NextResponse.json({ codes }, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }
    });

  } catch (err) {
    console.error('[models/codes] DB error:', err);
    return NextResponse.json({ codes: [] });
  }
}

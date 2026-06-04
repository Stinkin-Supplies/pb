/**
 * app/api/models/summary/route.ts
 *
 * Returns part count and fitment % per model family slug.
 * Used by /models page FlowingMenu to show live stats.
 *
 * Response: { touring: { parts: 38200, fitPct: "38.4" }, ... }
 */

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const FAMILY_SLUG_MAP: Record<string, string> = {
  'Touring':        'touring',
  'Softail':        'softail',
  'Dyna':           'dyna',
  'Sportster':      'sportster',
  'FXR':            'fxr',
  'Shovelhead':     'shovelhead',
  'Flathead':       'vintage',
  'Knucklehead':    'vintage',
  'Panhead':        'vintage',
  'Trike':          'trike',
  'V-Rod':          'v-rod',
  'Street':         'street',
  'Revolution Max': 'revolution-max',
};

const VINTAGE_FAMILIES = ['Flathead', 'Knucklehead', 'Panhead'];
const ALL_MAPPED_FAMILIES = Object.keys(FAMILY_SLUG_MAP);
const NON_VINTAGE_FAMILIES = ALL_MAPPED_FAMILIES.filter(f => !VINTAGE_FAMILIES.includes(f));

let cache: {
  data: Record<string, { parts: number; fitPct: string }> | null;
  at: number;
} = { data: null, at: 0 };

const CACHE_TTL = 10 * 60 * 1000;

export async function GET() {
  if (cache.data && Date.now() - cache.at < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60' },
    });
  }

  try {
    // Per non-vintage family: distinct active products with fitment
    const familyRows = await sql`
      SELECT
        hf.name                 AS family_name,
        COUNT(DISTINCT cu.id)   AS part_count
      FROM harley_families hf
      JOIN harley_models hm        ON hm.family_id    = hf.id
      JOIN harley_model_years hmy  ON hmy.model_id    = hm.id
      JOIN catalog_fitment_v2 f    ON f.model_year_id = hmy.id
      JOIN catalog_unified cu      ON cu.id           = f.product_id
                                   AND cu.is_active   = true
      WHERE hf.name = ANY(${NON_VINTAGE_FAMILIES})
      GROUP BY hf.name
    `;

    // Vintage: deduped union across Flathead + Knucklehead + Panhead
    const vintageRows = await sql`
      SELECT COUNT(DISTINCT cu.id) AS part_count
      FROM harley_families hf
      JOIN harley_models hm        ON hm.family_id    = hf.id
      JOIN harley_model_years hmy  ON hmy.model_id    = hm.id
      JOIN catalog_fitment_v2 f    ON f.model_year_id = hmy.id
      JOIN catalog_unified cu      ON cu.id           = f.product_id
                                   AND cu.is_active   = true
      WHERE hf.name = ANY(${VINTAGE_FAMILIES})
    `;

    // Total active products — fitment % denominator
    const totalRows = await sql`
      SELECT COUNT(*) AS total FROM catalog_unified WHERE is_active = true
    `;
    const total = parseInt(totalRows[0].total, 10) || 1;

    const result: Record<string, { parts: number; fitPct: string }> = {};

    for (const row of familyRows) {
      const slug  = FAMILY_SLUG_MAP[row.family_name];
      if (!slug) continue;
      const parts = parseInt(row.part_count, 10) || 0;
      result[slug] = {
        parts,
        fitPct: ((parts / total) * 100).toFixed(1),
      };
    }

    const vintageParts = parseInt(vintageRows[0].part_count, 10) || 0;
    result['vintage'] = {
      parts:  vintageParts,
      fitPct: ((vintageParts / total) * 100).toFixed(1),
    };

    cache = { data: result, at: Date.now() };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[/api/models/summary]', err);
    return NextResponse.json({}, { status: 200 });
  }
}

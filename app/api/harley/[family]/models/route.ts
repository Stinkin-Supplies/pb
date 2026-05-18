// app/api/harley/[family]/models/route.ts
// Returns filter_groups for a family slug with product counts

import { NextRequest, NextResponse } from 'next/server';
import getCatalogDb from '@/lib/db/catalog';

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

const FILTER_GROUP_LABELS: Record<string, string> = {
  'ROAD_KING':      'Road King',
  'ROAD_GLIDE':     'Road Glide',
  'STREET_GLIDE':   'Street Glide',
  'TOURING':        'Electra Glide',
  'TRIKE':          'Trike',
  'FXR':            'FXR',
  'SUPER_GLIDE':    'Super Glide',
  'SOFTAIL':        'Softail',
  'FAT_BOY':        'Fat Boy',
  'HERITAGE':       'Heritage',
  'LOW_RIDER':      'Low Rider',
  'SPORTSTER':      'Sportster',
  'DYNA':           'Dyna',
  'REVOLUTION_MAX': 'Revolution Max',
  'VINTAGE':        'Vintage',
  'V_ROD':          'V-Rod',
  'STREET':         'Street',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ family: string }> }
) {
  const { family } = await params;
  const familyName = FAMILY_SLUG_MAP[family.toLowerCase()];
  if (!familyName) {
    return NextResponse.json({ error: 'Unknown family' }, { status: 404 });
  }

  const db = getCatalogDb();

  try {
    const { rows } = await db.query(`
      SELECT
        hm.filter_group,
        MIN(hm.start_year)             AS year_start,
        MAX(hm.end_year)               AS year_end,
        COUNT(DISTINCT hm.id)          AS model_variants,
        COUNT(DISTINCT cfv.product_id) AS product_count
      FROM harley_models hm
      JOIN harley_families hf          ON hf.id = hm.family_id
      LEFT JOIN harley_model_years hmy ON hmy.model_id = hm.id
      LEFT JOIN catalog_fitment_v2 cfv ON cfv.model_year_id = hmy.id
      WHERE hf.name = $1
        AND hm.filter_group IS NOT NULL
      GROUP BY hm.filter_group
      ORDER BY COUNT(DISTINCT cfv.product_id) DESC
    `, [familyName]);

    const models = rows.map(r => ({
      filter_group:  r.filter_group,
      label:         FILTER_GROUP_LABELS[r.filter_group] ?? r.filter_group.replace(/_/g, ' '),
      slug:          r.filter_group.toLowerCase().replace(/_/g, '-'),
      year_start:    Number(r.year_start),
      year_end:      Number(r.year_end),
      product_count: parseInt(r.product_count, 10),
    }));

    return NextResponse.json({ family: familyName, models });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[harley/[family]/models]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
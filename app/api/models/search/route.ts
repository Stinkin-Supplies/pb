import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CATCHALL_CODES = [
  'evolution_bigtwin',
  'shovelhead',
  'panhead',
  'knucklehead',
  'twin_cam',
  'revolution',
];

const SLUG_EXPR = `
  CASE hf.name
    WHEN 'Touring'        THEN 'touring'
    WHEN 'Softail'        THEN 'softail'
    WHEN 'Sportster'      THEN 'sportster'
    WHEN 'Dyna'           THEN 'dyna'
    WHEN 'FXR'            THEN 'fxr'
    WHEN 'Vintage'        THEN 'vintage'
    WHEN 'Revolution Max' THEN 'revolution-max'
    WHEN 'Trike'          THEN 'trike'
    WHEN 'Evolution'      THEN 'evolution'
    WHEN 'Shovelhead'     THEN 'shovelhead'
    WHEN 'Panhead'        THEN 'panhead'
    WHEN 'Knucklehead'    THEN 'knucklehead'
    WHEN 'Twin Cam'       THEN 'twin-cam'
    WHEN 'V-Rod'          THEN 'chopper'
    ELSE LOWER(REPLACE(hf.name, ' ', '-'))
  END`;

const ERA_SLUG_EXPR = `
  CASE m.model_code
    WHEN 'evolution_bigtwin' THEN 'evolution'
    WHEN 'shovelhead'        THEN 'shovelhead'
    WHEN 'panhead'           THEN 'panhead'
    WHEN 'knucklehead'       THEN 'knucklehead'
    WHEN 'twin_cam'          THEN 'twin-cam'
    WHEN 'revolution'        THEN 'chopper'
    ELSE NULL
  END`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  if (!q) return NextResponse.json({ results: [] });

  try {
    const yearInt = parseInt(q, 10);
    const isYear  = /^\d{4}$/.test(q) && yearInt >= 1903 && yearInt <= 2030;
    let rows;

    if (isYear) {
      const result = await pool.query(
        `SELECT
           my.year,
           m.model_code,
           m.name                           AS model_name,
           hf.name                          AS family,
           (${SLUG_EXPR})                   AS family_slug,
           m.filter_group,
           (${ERA_SLUG_EXPR})               AS era_slug,
           (m.model_code = ANY($2::text[])) AS is_catchall
         FROM harley_model_years  my
         JOIN harley_models        m   ON m.id  = my.model_id
         JOIN harley_families      hf  ON hf.id = m.family_id
         WHERE my.year = $1
         ORDER BY
           hf.name ASC,
           (m.model_code = ANY($2::text[])) ASC,
           m.name ASC`,
        [yearInt, CATCHALL_CODES]
      );
      rows = result.rows;
    } else {
      const like = '%' + q.toLowerCase() + '%';
      const result = await pool.query(
        `SELECT
           my.year,
           m.model_code,
           m.name                           AS model_name,
           hf.name                          AS family,
           (${SLUG_EXPR})                   AS family_slug,
           m.filter_group,
           (${ERA_SLUG_EXPR})               AS era_slug,
           (m.model_code = ANY($2::text[])) AS is_catchall
         FROM harley_model_years  my
         JOIN harley_models        m   ON m.id  = my.model_id
         JOIN harley_families      hf  ON hf.id = m.family_id
         WHERE (
           LOWER(m.name)          LIKE $1
           OR LOWER(m.model_code) LIKE $1
           OR LOWER(hf.name)      LIKE $1
         )
         ORDER BY my.year DESC, hf.name ASC, m.name ASC
         LIMIT 80`,
        [like, CATCHALL_CODES]
      );
      rows = result.rows;
    }

    return NextResponse.json({ results: rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/models/search] error:', msg);
    return NextResponse.json({ error: msg, results: [] }, { status: 500 });
  }
}

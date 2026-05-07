import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  database: 'stinkin_catalog',
  user: 'catalog_app',
  password: 'smelly',
});

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const like = `%${q.toLowerCase()}%`;
  try {
    const { rows } = await pool.query(
      `SELECT year, model_code, model_name, family, era
       FROM hd_year_model_master
       WHERE LOWER(model_name) LIKE $1
          OR LOWER(family) LIKE $1
          OR LOWER(era) LIKE $1
          OR CAST(year AS TEXT) LIKE $1
       ORDER BY
         CASE WHEN CAST(year AS TEXT) LIKE $2 THEN 0 ELSE 1 END,
         year ASC, model_code ASC
       LIMIT 60`,
      [like, `${q.substring(0, 4)}%`]
    );
    return NextResponse.json({ results: rows });
  } catch (err) {
    console.error('[models/search]', err);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}

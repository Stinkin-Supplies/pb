import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    `postgresql://catalog_app:smelly@[2a01:4ff:f0:fa6f::1]:5432/stinkin_catalog`,
});

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Build search: if first token looks like a year, prioritize year match
    const isYear = /^\d{4}/.test(q);
    const like   = `%${q.toLowerCase()}%`;

    const { rows } = await pool.query<{
      year: number;
      model_code: string;
      model_name: string;
      family: string;
      era: string;
    }>(
      `SELECT year, model_code, model_name, family, era
       FROM hd_year_model_master
       WHERE
         LOWER(model_name) LIKE $1
         OR LOWER(family)  LIKE $1
         OR LOWER(era)     LIKE $1
         OR CAST(year AS TEXT) LIKE $1
       ORDER BY
         -- Exact year-prefix first
         CASE WHEN CAST(year AS TEXT) LIKE $2 THEN 0 ELSE 1 END,
         year ASC,
         model_code ASC
       LIMIT 60`,
      [like, `${q.substring(0, 4)}%`]
    );

    return NextResponse.json({ results: rows });
  } catch (err) {
    console.error('[models/search]', err);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
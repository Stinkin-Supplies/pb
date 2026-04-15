// app/api/harley/models/route.ts
// Returns all hd_models rows for a given family, for the year+model dropdown

import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';

const pool = new pg.Pool({
  host:     process.env.CATALOG_DB_HOST     || '5.161.100.126',
  port:     parseInt(process.env.CATALOG_DB_PORT || '5432'),
  database: process.env.CATALOG_DB_NAME     || 'stinkin_catalog',
  user:     process.env.CATALOG_DB_USER     || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

export async function GET(req: NextRequest) {
  const family = req.nextUrl.searchParams.get('family');
  if (!family) {
    return NextResponse.json({ error: 'family required' }, { status: 400 });
  }

  try {
    // For platform families (Softail, Touring, etc.) we want all models.
    // For engine families (M8, Twin Cam, Evolution) we join via engine_key.
    // Simplest: query by family name directly, with engine family fallback.
    const { rows } = await pool.query<{
      model_code: string;
      model_name: string;
      family: string;
      year_start: number;
      year_end: number | null;
      engine_key: string | null;
      engine_nickname: string | null;
    }>(`
      SELECT
        m.model_code,
        m.model_name,
        m.family,
        m.year_start,
        m.year_end,
        m.engine_key,
        e.nickname AS engine_nickname
      FROM hd_models m
      LEFT JOIN hd_engine_types e ON e.engine_key = m.engine_key
      WHERE
        -- Direct family match (Softail, Touring, Dyna, Sportster, Trike, Street, Revolution_Max)
        m.family = $1
        OR
        -- Engine-era families: M8 → milwaukee_eight, Twin Cam → twin_cam, etc.
        m.engine_key = (
          SELECT engine_key FROM hd_family_engine_map WHERE family = $1 LIMIT 1
        )
      ORDER BY m.year_start DESC, m.model_code ASC
    `, [family]);

    // Build a year → models map for the dropdown
    // Each year entry lists every model that was in production that year
    const currentYear = new Date().getFullYear();
    const yearMap = new Map<number, { model_code: string; model_name: string; engine_nickname: string | null }[]>();

    for (const row of rows) {
      const endYear = row.year_end ?? currentYear;
      for (let y = row.year_start; y <= endYear; y++) {
        if (!yearMap.has(y)) yearMap.set(y, []);
        yearMap.get(y)!.push({
          model_code: row.model_code,
          model_name: row.model_name,
          engine_nickname: row.engine_nickname,
        });
      }
    }

    // Convert to sorted array (newest first) and deduplicate model codes per year
    const years = Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, models]) => {
        // Deduplicate by model_code (XL883L appears twice due to name change)
        const seen = new Set<string>();
        const unique = models.filter(m => {
          if (seen.has(m.model_code)) return false;
          seen.add(m.model_code);
          return true;
        });
        return { year, models: unique };
      });

    return NextResponse.json({ family, years });
  } catch (err) {
    console.error('[harley/models]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

import { getCatalogDb } from '@/lib/db/catalog';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  if (!category) return NextResponse.json({ subcategories: [] });

  try {
    const db = getCatalogDb();
    const res = await db.query(
      `SELECT
         COALESCE(NULLIF(TRIM(display_subcategory), ''), '(General)') AS name,
         COUNT(*)::int AS count
       FROM catalog_unified
       WHERE is_active = true
         AND TRIM(display_category) = $1
       GROUP BY 1
       ORDER BY count DESC`,
      [category.trim()],
    );
    return NextResponse.json({ subcategories: res.rows });
  } catch (err) {
    console.error('[subcategories]', err);
    return NextResponse.json({ subcategories: [] }, { status: 500 });
  }
}

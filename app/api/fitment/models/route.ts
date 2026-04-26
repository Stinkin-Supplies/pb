import { NextRequest, NextResponse } from 'next/server';
import getCatalogDb from '@/lib/db/catalog';

export async function GET(request: NextRequest) {
  const family = new URL(request.url).searchParams.get('family');
  if (!family) return NextResponse.json({ models: [] });
  const db = getCatalogDb();
  const res = await db.query(`
    SELECT hm.id, hm.name, hm.model_code
    FROM harley_models hm
    JOIN harley_families hf ON hf.id = hm.family_id
    WHERE hf.name = $1
    ORDER BY hm.model_code
  `, [family]);
  return NextResponse.json({ models: res.rows });
}

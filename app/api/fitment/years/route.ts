import { NextResponse } from 'next/server';
import getCatalogDb from '@/lib/db/catalog';

export async function GET(request: Request) {
  const modelId = new URL(request.url).searchParams.get('model');
  if (!modelId) return NextResponse.json({ years: [] });
  const db = getCatalogDb();
  const res = await db.query(`
    SELECT year FROM harley_model_years WHERE model_id = $1 ORDER BY year DESC
  `, [modelId]);
  return NextResponse.json({ years: res.rows.map(r => r.year) });
}

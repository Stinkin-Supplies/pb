import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import getCatalogDb from '@/lib/db/catalog';

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin';
}

const FITMENT_QUERY = `
  SELECT cfv.id, hmy.year, hf.name AS family_name,
         hm.name AS model_name, hm.model_code
  FROM catalog_fitment_v2 cfv
  JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
  JOIN harley_models hm ON hm.id = hmy.model_id
  JOIN harley_families hf ON hf.id = hm.family_id
  WHERE cfv.product_id = $1
  ORDER BY hmy.year DESC, hf.name, hm.model_code
`;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const db = getCatalogDb();
  const res = await db.query(FITMENT_QUERY, [id]);
  return NextResponse.json({ fitment: res.rows });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const { model, year } = await request.json();
  if (!model || !year) return NextResponse.json({ error: 'Missing model or year' }, { status: 400 });

  const db = getCatalogDb();
  const myRes = await db.query(
    `SELECT id FROM harley_model_years WHERE model_id = $1 AND year = $2 LIMIT 1`,
    [model, year]
  );
  if (!myRes.rows.length) return NextResponse.json({ error: 'No model year found' }, { status: 404 });

  await db.query(
    `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
     VALUES ($1, $2, 'manual', 1.0)
     ON CONFLICT (product_id, model_year_id) DO NOTHING`,
    [id, myRes.rows[0].id]
  );

  const updated = await db.query(FITMENT_QUERY, [id]);
  return NextResponse.json({ fitment: updated.rows });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const fitmentId = new URL(request.url).searchParams.get('fitment_id');
  if (!fitmentId) return NextResponse.json({ error: 'Missing fitment_id' }, { status: 400 });
  const db = getCatalogDb();
  await db.query(`DELETE FROM catalog_fitment_v2 WHERE id = $1 AND product_id = $2`, [fitmentId, id]);
  return NextResponse.json({ ok: true });
}
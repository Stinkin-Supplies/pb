import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import getCatalogDb from '@/lib/db/catalog';

async function requireAdmin(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin';
}

// GET /api/admin/products?page=1&limit=50&q=&vendor=&category=&brand=
export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit    = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const offset   = (page - 1) * limit;
  const q        = searchParams.get('q')?.trim() || '';
  const vendor   = searchParams.get('vendor') || '';
  const category = searchParams.get('category') || '';
  const brand    = searchParams.get('brand') || '';

  const db = getCatalogDb();

  const conditions = [];
  const params     = [];
  let pi = 1;

  if (q) {
    conditions.push(`(cu.name ILIKE $${pi} OR cu.sku ILIKE $${pi})`);
    params.push(`%${q}%`);
    pi++;
  }
  if (vendor) {
    conditions.push(`cu.source_vendor = $${pi}`);
    params.push(vendor);
    pi++;
  }
  if (category) {
    conditions.push(`cu.category = $${pi}`);
    params.push(category);
    pi++;
  }
  if (brand) {
    conditions.push(`cu.brand = $${pi}`);
    params.push(brand);
    pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rowsRes, countRes] = await Promise.all([
    db.query(`
      SELECT
        cu.id,
        cu.sku,
        cu.source_vendor,
        cu.name,
        cu.brand,
        cu.category,
        cu.image_url,
        cu.is_active,
        cu.is_discontinued,
        cu.in_stock,
        COUNT(cfv.id)::int AS fitment_count
      FROM catalog_unified cu
      LEFT JOIN catalog_fitment_v2 cfv ON cfv.product_id = cu.id
      ${where}
      GROUP BY cu.id
      ORDER BY cu.source_vendor, cu.name
      LIMIT $${pi} OFFSET $${pi + 1}
    `, [...params, limit, offset]),
    db.query(`
      SELECT COUNT(*)::int AS total
      FROM catalog_unified cu
      ${where}
    `, params),
  ]);

  return NextResponse.json({
    products: rowsRes.rows,
    total:    countRes.rows[0].total,
    page,
    limit,
  });
}

// POST /api/admin/products/bulk
export async function POST(request: NextRequest) {
  if (!await requireAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { action, ids, family, model, year } = body;

  if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

  const db = getCatalogDb();

  if (action === 'activate') {
    if (!ids?.length) return NextResponse.json({ error: 'No ids' }, { status: 400 });
    await db.query(
      `UPDATE catalog_unified SET is_active = true WHERE id = ANY($1::int[])`,
      [ids]
    );
    return NextResponse.json({ message: `${ids.length} product(s) activated` });
  }

  if (action === 'deactivate') {
    if (!ids?.length) return NextResponse.json({ error: 'No ids' }, { status: 400 });
    await db.query(
      `UPDATE catalog_unified SET is_active = false WHERE id = ANY($1::int[])`,
      [ids]
    );
    return NextResponse.json({ message: `${ids.length} product(s) deactivated` });
  }

  if (action === 'delete') {
    if (!ids?.length) return NextResponse.json({ error: 'No ids' }, { status: 400 });
    // Remove fitment first
    await db.query(`DELETE FROM catalog_fitment_v2 WHERE product_id = ANY($1::int[])`, [ids]);
    await db.query(`DELETE FROM catalog_unified WHERE id = ANY($1::int[])`, [ids]);
    return NextResponse.json({ message: `${ids.length} product(s) deleted` });
  }

  if (action === 'fitment') {
    if (!ids?.length || !model || !year) {
      return NextResponse.json({ error: 'Missing ids, model, or year' }, { status: 400 });
    }

    // Resolve model_year_id from harley_model_years
    const myRes = await db.query(
      `SELECT hmy.id
       FROM harley_model_years hmy
       WHERE hmy.model_id = $1 AND hmy.year = $2
       LIMIT 1`,
      [model, year]
    );

    if (!myRes.rows.length) {
      return NextResponse.json({ error: `No model year found for model=${model} year=${year}` }, { status: 404 });
    }
    const modelYearId = myRes.rows[0].id;

    // Bulk insert — skip duplicates
    let inserted = 0;
    for (const productId of ids) {
      const r = await db.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
         VALUES ($1, $2, 'manual', 1.0)
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        [productId, modelYearId]
      );
      inserted += r.rowCount ?? 0;
    }

    return NextResponse.json({ message: `${inserted} fitment row(s) inserted (${ids.length - inserted} already existed)` });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

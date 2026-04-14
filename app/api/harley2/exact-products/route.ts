import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const submodel = searchParams.get('submodel');
  const year = parseInt(searchParams.get('year') || '0');
  const category = searchParams.get('category');
  const brand = searchParams.get('brand');

  if (!submodel || !year) {
    return NextResponse.json({ error: 'Missing submodel or year' }, { status: 400 });
  }

  // First get the generic model for this submodel
  const subRow = await sql`
    SELECT generic_model FROM catalog_submodels
    WHERE submodel = ${submodel} AND start_year <= ${year} AND end_year >= ${year}
    LIMIT 1;
  `;
  if (subRow.rowCount === 0) {
    return NextResponse.json({ error: 'Submodel not found' }, { status: 404 });
  }
  const genericModel = subRow.rows[0].generic_model;

  // Now query products using the generic fitment table
  let query = `
    SELECT cp.id, cp.name, cp.sku, cp.price, cp.computed_price, cp.brand,
           ci.url AS image_url
    FROM catalog_products cp
    JOIN catalog_fitment cf ON cp.id = cf.product_id
    LEFT JOIN catalog_images ci ON cp.id = ci.product_id AND ci.is_primary = true
    WHERE cf.make = 'Harley-Davidson'
      AND cf.model = ${genericModel}
      AND cf.year_start <= ${year}
      AND cf.year_end >= ${year}
  `;
  const params = [];
  if (category) {
    params.push(category);
    query += ` AND cp.category = $${params.length}`;
  }
  if (brand) {
    params.push(brand);
    query += ` AND cp.brand = $${params.length}`;
  }
  query += ` LIMIT 50;`;

  const { rows } = await sql.query(query, params);
  return NextResponse.json(rows);
}

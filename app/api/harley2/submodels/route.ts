import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const generic = searchParams.get('generic');
  const year = parseInt(searchParams.get('year') || '0');

  if (!generic || !year) {
    return NextResponse.json({ error: 'Missing generic model or year' }, { status: 400 });
  }

  const { rows } = await sql`
    SELECT DISTINCT submodel, start_year, end_year
    FROM catalog_submodels
    WHERE generic_model = ${generic}
      AND start_year <= ${year}
      AND end_year >= ${year}
    ORDER BY submodel;
  `;
  return NextResponse.json(rows);
}
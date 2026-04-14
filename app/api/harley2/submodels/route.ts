import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const generic = searchParams.get('generic');
  const year = parseInt(searchParams.get('year') || '0');

  if (!generic || !year) {
    return NextResponse.json({ error: 'Missing generic model or year' }, { status: 400 });
  }

  const { data, error } = await adminSupabase
    .from("vehicles")
    .select("model, submodel, year")
    .eq("make", "Harley-Davidson")
    .eq("model", generic)
    .eq("year", year)
    .order("submodel", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const submodels = (data ?? [])
    .map(row => ({
      submodel: row.submodel,
      model: row.model,
      year: row.year,
    }))
    .filter(row => row.submodel && !seen.has(row.submodel) && seen.add(row.submodel));

  return NextResponse.json(submodels);
}

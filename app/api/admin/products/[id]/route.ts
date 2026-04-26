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

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await request.json();

  const allowed = ['name', 'description', 'features', 'is_active', 'is_discontinued'];
  const sets = [];
  const values = [];
  let pi = 1;

  for (const key of allowed) {
    if (key in body) {
      sets.push(`${key} = $${pi}`);
      values.push(body[key]);
      pi++;
    }
  }

  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  sets.push(`updated_at = NOW()`);
  values.push(id);

  const db = getCatalogDb();
  const res = await db.query(
    `UPDATE catalog_unified SET ${sets.join(', ')} WHERE id = $${pi} RETURNING id`,
    values
  );

  if (!res.rows.length) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/variant-groups/create
 *
 * Creates a variant group from admin-reviewed member data.
 * Handles the full transaction:
 *   1. Insert catalog_variant_groups row
 *   2. Insert catalog_variant_members rows (one per product)
 *   3. Backfill catalog_unified.variant_group_id for each member
 *   4. Optionally mark a catalog_variant_candidates row as resolved
 *
 * Body:
 *   token          string
 *   display_name   string              — user-facing group name shown in storefront
 *   family_key?    string              — links sibling groups (e.g. same part, diff vendors)
 *   candidate_id?  number              — catalog_variant_candidates.id to mark resolved
 *   members        Array<{
 *     product_id:      number
 *     option_1_name:   string          — axis label, e.g. "Color", "Size", "Finish"
 *     option_1_value:  string          — axis value, e.g. "Chrome", "XL", "+0.020"
 *     option_2_name?:  string          — second axis label (optional), e.g. "Size"
 *                                        when a group varies along two independent
 *                                        dimensions at once (e.g. Style groups whose
 *                                        members also differ by Size)
 *     option_2_value?: string          — second axis value (optional), e.g. "10 Inch"
 *     sort_order?:     number          — display order within the group (default 0)
 *   }>
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { display_name, family_key, candidate_id, members } = body;

  if (!display_name?.trim()) {
    return NextResponse.json({ error: 'display_name required' }, { status: 400 });
  }
  if (!Array.isArray(members) || members.length < 2) {
    return NextResponse.json({ error: 'members array (2+ items) required' }, { status: 400 });
  }
  for (const m of members) {
    if (!m.product_id || !m.option_1_name?.trim() || !m.option_1_value?.trim()) {
      return NextResponse.json(
        { error: `Each member needs product_id, option_1_name, and option_1_value (got: ${JSON.stringify(m)})` },
        { status: 400 }
      );
    }
    // option_2_name and option_2_value must travel together — a name with no
    // value (or vice versa) means the admin UI's secondary-axis field was left
    // half-filled, which would silently produce a blank label in the PDP selector.
    const has2Name  = !!m.option_2_name?.trim();
    const has2Value = !!m.option_2_value?.trim();
    if (has2Name !== has2Value) {
      return NextResponse.json(
        { error: `Member ${m.product_id}: option_2_name and option_2_value must both be set or both be empty (got name="${m.option_2_name ?? ''}" value="${m.option_2_value ?? ''}")` },
        { status: 400 }
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create the group
    const { rows: [group] } = await client.query(`
      INSERT INTO catalog_variant_groups (display_name, family_key, source_vendor)
      VALUES ($1, $2, 'ADMIN')
      RETURNING id, display_name
    `, [display_name.trim(), family_key?.trim() ?? null]);

    const groupId: number = group.id;

    // 2. Insert members
    for (const m of members) {
      await client.query(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, option_2_name, option_2_value, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (group_id, product_id) DO UPDATE
          SET option_1_name  = EXCLUDED.option_1_name,
              option_1_value = EXCLUDED.option_1_value,
              option_2_name  = EXCLUDED.option_2_name,
              option_2_value = EXCLUDED.option_2_value,
              sort_order     = EXCLUDED.sort_order
      `, [
        groupId, m.product_id, m.option_1_name.trim(), m.option_1_value.trim(),
        m.option_2_name?.trim() || null, m.option_2_value?.trim() || null,
        m.sort_order ?? 0,
      ]);
    }

    // 3. Backfill variant_group_id on catalog_unified
    const productIds = members.map((m: { product_id: number }) => m.product_id);
    await client.query(`
      UPDATE catalog_unified
      SET variant_group_id = $1
      WHERE id = ANY($2::int[])
    `, [groupId, productIds]);

    // 4. Optionally resolve the candidate
    if (candidate_id) {
      await client.query(`
        UPDATE catalog_variant_candidates
        SET resolved = true, resolved_at = NOW()
        WHERE id = $1
      `, [candidate_id]);
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      group_id: groupId,
      display_name: group.display_name,
      members_created: members.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

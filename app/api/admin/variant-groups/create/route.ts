/**
 * POST /api/admin/variant-groups/create
 *
 * Creates a variant group from admin-reviewed member data.
 * Handles the full transaction:
 *   1. Insert catalog_variant_groups row
 *   2. Insert catalog_variant_members rows (one per product)
 *   3. Insert catalog_variant_member_options rows (one per axis per product —
 *      unlimited axis count, source of truth going forward)
 *   4. Backfill catalog_unified.variant_group_id for each member
 *   5. Optionally mark a catalog_variant_candidates row as resolved
 *
 * Body:
 *   token          string
 *   display_name   string              — user-facing group name shown in storefront
 *   family_key?    string              — links sibling groups (e.g. same part, diff vendors)
 *   candidate_id?  number              — catalog_variant_candidates.id to mark resolved
 *   members        Array<{
 *     product_id:  number
 *     sort_order?: number              — display order within the group (default 0)
 *     options:     Array<{ name: string, value: string }>
 *                  — one entry per variant axis, in display order (Style, Size,
 *                    Finish, ...). At least one required. No ceiling on length —
 *                    this is what makes N-axis groups possible without a schema
 *                    change every time a new dimension shows up.
 *   }>
 *
 * Legacy compatibility: a member may instead (or additionally) send
 * option_1_name/option_1_value/option_2_name/option_2_value — these get folded
 * into the same `options` array internally. New callers should send `options`
 * directly; this exists only so anything not yet updated to the new shape
 * doesn't break.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

interface AxisOption { name: string; value: string; }
interface IncomingMember {
  product_id: number;
  sort_order?: number;
  options?: AxisOption[];
  option_1_name?: string;
  option_1_value?: string;
  option_2_name?: string;
  option_2_value?: string;
}

// Normalize any member shape (new `options` array or legacy option_1/option_2
// fields) down to a single trimmed, deduplicated options array.
function normalizeOptions(m: IncomingMember): AxisOption[] {
  const raw: AxisOption[] = [];
  if (Array.isArray(m.options)) {
    for (const o of m.options) {
      if (o?.name?.trim() && o?.value?.trim()) raw.push({ name: o.name.trim(), value: o.value.trim() });
    }
  } else {
    if (m.option_1_name?.trim() && m.option_1_value?.trim()) {
      raw.push({ name: m.option_1_name.trim(), value: m.option_1_value.trim() });
    }
    if (m.option_2_name?.trim() && m.option_2_value?.trim()) {
      raw.push({ name: m.option_2_name.trim(), value: m.option_2_value.trim() });
    }
  }
  // De-dupe by axis name, keeping first occurrence (a member shouldn't carry
  // "Size" twice — that's a client bug, but silently keeping the first entry
  // is safer than a 500 mid-transaction).
  const seen = new Set<string>();
  return raw.filter(o => {
    if (seen.has(o.name)) return false;
    seen.add(o.name);
    return true;
  });
}

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

  const normalizedMembers: Array<{ product_id: number; sort_order: number; options: AxisOption[] }> = [];
  for (const m of members as IncomingMember[]) {
    if (!m.product_id) {
      return NextResponse.json({ error: `Each member needs product_id (got: ${JSON.stringify(m)})` }, { status: 400 });
    }
    const options = normalizeOptions(m);
    if (options.length === 0) {
      return NextResponse.json(
        { error: `Member ${m.product_id} has no valid axis (need at least one options[] entry with name + value)` },
        { status: 400 }
      );
    }
    normalizedMembers.push({ product_id: m.product_id, sort_order: m.sort_order ?? 0, options });
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

    // 2. Insert members — option_1_name/option_1_value/option_2_name/option_2_value
    //    are still written here as a legacy mirror of the first two axes, for
    //    any read path not yet migrated to the junction table.
    for (const m of normalizedMembers) {
      const [axis0, axis1] = m.options;
      const { rows: [memberRow] } = await client.query(`
        INSERT INTO catalog_variant_members
          (group_id, product_id, option_1_name, option_1_value, option_2_name, option_2_value, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (group_id, product_id) DO UPDATE
          SET option_1_name  = EXCLUDED.option_1_name,
              option_1_value = EXCLUDED.option_1_value,
              option_2_name  = EXCLUDED.option_2_name,
              option_2_value = EXCLUDED.option_2_value,
              sort_order     = EXCLUDED.sort_order
        RETURNING id
      `, [
        groupId, m.product_id,
        axis0?.name ?? null, axis0?.value ?? null,
        axis1?.name ?? null, axis1?.value ?? null,
        m.sort_order,
      ]);

      // 3. Insert every axis into the junction table — the source of truth,
      //    unlimited length. Replaces the full axis set for this member each
      //    time (delete-then-insert) so removing an axis in the admin UI
      //    actually removes it here too, rather than leaving a stale row.
      await client.query(`DELETE FROM catalog_variant_member_options WHERE member_id = $1`, [memberRow.id]);
      for (let i = 0; i < m.options.length; i++) {
        const opt = m.options[i];
        await client.query(`
          INSERT INTO catalog_variant_member_options (member_id, axis_name, axis_value, axis_order)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (member_id, axis_name) DO UPDATE
            SET axis_value = EXCLUDED.axis_value, axis_order = EXCLUDED.axis_order
        `, [memberRow.id, opt.name, opt.value, i]);
      }
    }

    // 4. Backfill variant_group_id on catalog_unified
    const productIds = normalizedMembers.map(m => m.product_id);
    await client.query(`
      UPDATE catalog_unified
      SET variant_group_id = $1
      WHERE id = ANY($2::int[])
    `, [groupId, productIds]);

    // 5. Optionally resolve the candidate
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
      members_created: normalizedMembers.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

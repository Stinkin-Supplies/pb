// app/api/admin/catalog/categories/route.ts
// GET — live display_category → display_subcategory breakdown, straight from
// catalog_unified. Replaces hardcoded category lists in admin edit UIs, which
// go stale every time a category gets merged/split/renamed (see HANDOFF_LOG).
// No auth — same aggregate data the public /categories page already exposes.

import { NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

export async function GET() {
  const db = getCatalogDb();

  const result = await db.query(`
    SELECT
      display_category    AS category,
      display_subcategory AS subcategory,
      COUNT(*)::int       AS count
    FROM catalog_unified
    WHERE is_active = true
      AND COALESCE(NULLIF(TRIM(display_category), ''), '') <> ''
    GROUP BY display_category, display_subcategory
    ORDER BY display_category, count DESC
  `);

  const byCategory = new Map<string, { name: string; count: number }[]>();
  for (const row of result.rows) {
    const list = byCategory.get(row.category) ?? [];
    if (row.subcategory) list.push({ name: row.subcategory, count: row.count });
    byCategory.set(row.category, list);
  }

  const categories = [...byCategory.entries()]
    .map(([name, subcategories]) => ({ name, subcategories }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ categories });
}

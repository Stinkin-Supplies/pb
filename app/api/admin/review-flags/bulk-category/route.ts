// app/api/admin/review-flags/bulk-category/route.ts
//
// POST /api/admin/review-flags/bulk-category?token=...
// Body: { flag_ids: number[], display_category: string, display_subcategory?: string | null }
//
// Applies one display_category/display_subcategory pair to every product
// behind the given category-family flags (wrong_category, wrong_subcategory,
// missing_fitment, wrong_fitment, bad_image, duplicate, other), pushes each
// updated product to Typesense, and resolves those flags. Any flag_ids
// belonging to oem_*/fitment_* staging-backed flags are ignored here -- use
// /api/admin/review-flags/bulk for those.
//
// Cast rules and Typesense push mirror app/api/admin/products/[id]/route.ts's
// GENERIC_FIELD_MAP handling for display_category/display_subcategory.

import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  const param = new URL(req.url).searchParams.get("token");
  if (!secret) return false;
  const header = req.headers.get("x-admin-token");
  if (header && header === secret) return true;
  if (param && param === secret) return true;
  return false;
}

async function typesenseUpdate(id: number, fields: Record<string, unknown>) {
  const host = process.env.TYPESENSE_HOST;
  const apiKey = process.env.TYPESENSE_ADMIN_API_KEY ?? process.env.TYPESENSE_API_KEY;
  const col = process.env.TYPESENSE_COLLECTION ?? "products";
  if (!host || !apiKey) {
    console.warn("[review-flags/bulk-category] Typesense env vars missing — skipping live update");
    return;
  }
  const url = `${host.replace(/\/$/, "")}/collections/${col}/documents/${id}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-TYPESENSE-API-KEY": apiKey },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    console.error("[review-flags/bulk-category] Typesense PATCH failed:", res.status, await res.text());
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { flag_ids, display_category, display_subcategory } = body as {
    flag_ids?: number[];
    display_category?: string;
    display_subcategory?: string | null;
  };

  if (!Array.isArray(flag_ids) || flag_ids.length === 0) {
    return NextResponse.json({ error: "flag_ids (non-empty array) required" }, { status: 400 });
  }
  if (!display_category || !display_category.trim()) {
    return NextResponse.json({ error: "display_category required" }, { status: 400 });
  }

  const db = getCatalogDb();
  const category = display_category.trim();
  const subcategory = display_subcategory && display_subcategory.trim() ? display_subcategory.trim() : null;

  try {
    // Only act on category-family flags -- staging-backed (oem_/fitment_)
    // flag_ids passed in by mistake are silently ignored, not errored on.
    const { rows: flags } = await db.query(
      `SELECT id, product_id FROM catalog_review_flags
       WHERE id = ANY($1::int[]) AND flag_type NOT LIKE 'oem_%' AND flag_type NOT LIKE 'fitment_%'`,
      [flag_ids]
    );

    if (flags.length === 0) {
      return NextResponse.json({ error: "No category-family flags found among flag_ids" }, { status: 400 });
    }

    const productIds = [...new Set(flags.map((f) => f.product_id))];
    const usedFlagIds = flags.map((f) => f.id);

    await db.query(
      `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, updated_at = now()
       WHERE id = ANY($3::int[])`,
      [category, subcategory, productIds]
    );

    await Promise.all(
      productIds.map((id) => typesenseUpdate(id, { display_category: category, display_subcategory: subcategory }))
    );

    const { rowCount: flagsResolved } = await db.query(
      `UPDATE catalog_review_flags SET resolved = true, resolved_at = now() WHERE id = ANY($1::int[])`,
      [usedFlagIds]
    );

    return NextResponse.json({
      success: true,
      productsUpdated: productIds.length,
      flagsResolved: flagsResolved ?? 0,
      skipped: flag_ids.length - usedFlagIds.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

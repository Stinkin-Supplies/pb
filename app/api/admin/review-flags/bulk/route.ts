// app/api/admin/review-flags/bulk/route.ts
//
// POST /api/admin/review-flags/bulk?token=...
// Body: { flag_ids: number[], action: 'resolve' | 'reject_staging' }
//
// 'resolve' just marks catalog_review_flags rows resolved -- works for any
// flag_type. 'reject_staging' additionally rejects the underlying
// oem_crossref_staging / fitment_staging rows for the flagged products, so
// oem_*/fitment_* flags don't just get silently dismissed while their
// staging data lingers as 'flagged' forever. There is deliberately no bulk
// 'approve' here -- promoting OEM/fitment data at scale without per-row
// human review defeats the point of the staging/validation gate; approving
// a specific row still goes through the CLI promote scripts one at a time.
//
// Auth matches the existing app/api/admin/review-flags/route.ts (token via
// ?token= or X-Admin-Token header, not request body).

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

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { flag_ids, action } = body as { flag_ids?: number[]; action?: string };

  if (!Array.isArray(flag_ids) || flag_ids.length === 0) {
    return NextResponse.json({ error: "flag_ids (non-empty array) required" }, { status: 400 });
  }
  if (action !== "resolve" && action !== "reject_staging") {
    return NextResponse.json({ error: "action must be 'resolve' or 'reject_staging'" }, { status: 400 });
  }

  const db = getCatalogDb();

  try {
    if (action === "reject_staging") {
      const { rows: flags } = await db.query(
        `SELECT id, product_id, flag_type FROM catalog_review_flags WHERE id = ANY($1::int[])`,
        [flag_ids]
      );

      const oemProductIds = flags.filter((f) => f.flag_type.startsWith("oem_")).map((f) => f.product_id);
      const fitmentProductIds = flags.filter((f) => f.flag_type.startsWith("fitment_")).map((f) => f.product_id);

      let stagingRejected = 0;
      if (oemProductIds.length > 0) {
        const { rowCount } = await db.query(
          `UPDATE oem_crossref_staging SET status = 'rejected'
           WHERE matched_product_id = ANY($1::int[]) AND status = 'flagged'`,
          [oemProductIds]
        );
        stagingRejected += rowCount ?? 0;
      }
      if (fitmentProductIds.length > 0) {
        const { rowCount } = await db.query(
          `UPDATE fitment_staging SET status = 'rejected'
           WHERE matched_product_id = ANY($1::int[]) AND status = 'flagged'`,
          [fitmentProductIds]
        );
        stagingRejected += rowCount ?? 0;
      }

      const { rowCount: flagsResolved } = await db.query(
        `UPDATE catalog_review_flags SET resolved = true, resolved_at = now() WHERE id = ANY($1::int[])`,
        [flag_ids]
      );

      return NextResponse.json({ success: true, flagsResolved: flagsResolved ?? 0, stagingRejected });
    }

    // action === "resolve"
    const { rowCount } = await db.query(
      `UPDATE catalog_review_flags SET resolved = true, resolved_at = now() WHERE id = ANY($1::int[])`,
      [flag_ids]
    );
    return NextResponse.json({ success: true, flagsResolved: rowCount ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ============================================================
// app/api/admin/map/route.ts
// Serves MAP violations from self-hosted map_compliance view
// + summary stats from map_audit_log in Supabase
// ============================================================

export const runtime = "nodejs";

import { NextResponse }  from "next/server";
import { createClient }  from "@supabase/supabase-js";
import getCatalogDb      from "@/lib/db/catalog";

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search  = searchParams.get("search")  ?? "";
  const vendor  = searchParams.get("vendor")  ?? "all";
  const status  = searchParams.get("status")  ?? "all";
  const page    = parseInt(searchParams.get("page") ?? "0", 10);
  const sort    = searchParams.get("sort")    ?? "checked_at";
  const dir     = searchParams.get("dir")     ?? "desc";

  const supabase  = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const catalogDb = getCatalogDb();

  // ── Safe sort column whitelist ────────────────────────────
  const SORT_COLS: Record<string, string> = {
    sku:          "sku",
    product_name: "name",
    our_price:    "our_price",
    map_floor:    "map_floor",
    delta:        "violation_amount",
    vendor:       "sku",   // map_compliance view has no vendor col — sort by sku fallback
    status:       "compliance_status",
    checked_at:   "our_price", // view has no timestamp — sort by price as proxy
  };
  const safeSort = SORT_COLS[sort] ?? "our_price";
  const safeDir  = dir === "asc" ? "ASC" : "DESC";

  try {
    // ── 1. Violations from self-hosted map_compliance view ──
    const conditions: string[] = ["compliance_status = 'violation'"];
    const params: any[]        = [];
    let   paramIdx             = 1;

    if (search) {
      conditions.push(`(sku ILIKE $${paramIdx} OR name ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const WHERE   = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const OFFSET  = page * PAGE_SIZE;

    const [rowsResult, countResult] = await Promise.all([
      catalogDb.query(
        `SELECT product_id, sku, name, our_price, map_floor, compliance_status, violation_amount
         FROM map_compliance
         ${WHERE}
         ORDER BY ${safeSort} ${safeDir}
         LIMIT ${PAGE_SIZE} OFFSET ${OFFSET}`,
        params
      ),
      catalogDb.query(
        `SELECT COUNT(*) FROM map_compliance ${WHERE}`,
        params
      ),
    ]);

    const rows  = (rowsResult.rows ?? []).map((r: any) => ({
      ...r,
      // map_compliance view has no vendor/checked_at — pull from audit log below if needed
      vendor:     null,
      checked_at: null,
      delta:      Number(r.violation_amount ?? 0) * -1, // violation_amount is positive; delta is negative
      status:     r.compliance_status,
    }));
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    // ── 2. Stats from Supabase map_audit_log ───────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: auditStats } = await supabase
      .from("map_audit_log")
      .select("status, vendor")
      .gte("checked_at", today.toISOString());

    const statsRows  = auditStats ?? [];
    const violations = statsRows.filter((r: any) => r.status === "violation").length;
    const corrected  = statsRows.filter((r: any) => r.status === "corrected").length;
    const totalChecked = statsRows.length;
    const wpsViolations = statsRows.filter((r: any) => r.status === "violation" && r.vendor === "wps").length;
    const puViolations  = statsRows.filter((r: any) => r.status === "violation" && r.vendor === "pu").length;
    const complianceRate = totalChecked > 0
      ? Math.round(((totalChecked - violations) / totalChecked) * 100)
      : 100;

    return NextResponse.json({
      rows,
      total,
      stats: {
        violations,
        wpsViolations,
        puViolations,
        corrected,
        totalChecked,
        complianceRate,
      },
    });

  } catch (err: any) {
    console.error("[MAP API]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
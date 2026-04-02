export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

function isAuthorized(req: NextRequest) {
  const headerSecret = req.headers.get("x-sync-secret");
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  const expectedSecret = process.env.SYNC_SECRET ?? process.env.CRON_SECRET ?? "";

  return Boolean(
    expectedSecret &&
      (headerSecret === expectedSecret || bearerSecret === expectedSecret)
  );
}

async function runPricing(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getCatalogDb();

  try {
    await db.query("CALL public.run_nightly_pricing()");

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[run-pricing] Error:", err?.message ?? err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Nightly pricing failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return runPricing(req);
}

export async function GET(req: NextRequest) {
  return runPricing(req);
}

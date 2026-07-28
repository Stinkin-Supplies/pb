/**
 * app/api/hd-models/route.ts
 *
 * GET ?year=YYYY — returns the real Harley-Davidson models that existed in
 * that model year, sourced from harley_models/harley_model_years in the
 * catalog DB. Powers the garage "Add Vehicle" modal so users can only pick
 * models that actually existed for the year they select, and so the exact
 * model_code (not just a marketing name) gets captured for fitment filtering.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

export async function GET(req: NextRequest) {
  const year = parseInt(req.nextUrl.searchParams.get("year") || "", 10);
  if (!year || year < 1900 || year > 2100) {
    return NextResponse.json({ error: "Missing or invalid year" }, { status: 400 });
  }

  const db = getCatalogDb();
  const { rows } = await db.query(
    `
    SELECT DISTINCT ON (hm.model_code)
      hm.model_code,
      hm.name,
      hf.name AS family
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
    JOIN harley_families hf ON hf.id = hm.family_id
    WHERE hmy.year = $1
    ORDER BY hm.model_code, hm.name
    `,
    [year]
  );

  const models = rows
    .map((r) => ({ model_code: r.model_code, name: r.name, family: r.family }))
    .sort((a, b) => a.family.localeCompare(b.family) || a.model_code.localeCompare(b.model_code));

  return NextResponse.json({ year, models });
}

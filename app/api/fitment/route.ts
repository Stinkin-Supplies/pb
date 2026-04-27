// ============================================================
// app/api/fitment/route.ts
// ============================================================
// Phase 6 — DB-driven dropdowns from canonical Harley tables.
// Phase 10 — catalog_fitment retired. All paths use v2 tables only.
//
// GET /api/fitment?type=families
// GET /api/fitment?type=models&family=Touring
// GET /api/fitment?type=years&model=FLHX
// ============================================================

import { NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const type   = url.searchParams.get("type") ?? "families";
  const family = url.searchParams.get("family")?.trim() || null;
  const model  = url.searchParams.get("model")?.trim()  || null;

  try {
    const db = getCatalogDb();

    // ── FAMILIES ────────────────────────────────────────────
    if (type === "families") {
      const { rows } = await db.query(`
        SELECT id, name, start_year, end_year
        FROM harley_families
        ORDER BY name ASC
      `);
      return NextResponse.json({ families: rows });
    }

    // ── MODELS ──────────────────────────────────────────────
    if (type === "models") {
      const { rows } = family
        ? await db.query(`
            SELECT hm.id, hm.model_code, hm.name, hm.start_year, hm.end_year
            FROM harley_models hm
            JOIN harley_families hf ON hf.id = hm.family_id
            WHERE LOWER(hf.name) = LOWER($1)
            ORDER BY hm.name ASC
          `, [family])
        : await db.query(`
            SELECT hm.id, hm.model_code, hm.name, hm.start_year, hm.end_year,
                   hf.name AS family_name
            FROM harley_models hm
            JOIN harley_families hf ON hf.id = hm.family_id
            ORDER BY hf.name ASC, hm.name ASC
          `);
      return NextResponse.json({ models: rows });
    }

    // ── YEARS ───────────────────────────────────────────────
    if (type === "years") {
      if (model) {
        const { rows } = await db.query(`
          SELECT DISTINCT hmy.year
          FROM harley_model_years hmy
          JOIN harley_models hm ON hm.id = hmy.model_id
          WHERE hm.model_code = $1
          ORDER BY hmy.year DESC
        `, [model]);
        return NextResponse.json({ years: rows.map(r => Number(r.year)) });
      }

      if (family) {
        const { rows } = await db.query(`
          SELECT DISTINCT hmy.year
          FROM harley_model_years hmy
          JOIN harley_models hm ON hm.id = hmy.model_id
          JOIN harley_families hf ON hf.id = hm.family_id
          WHERE LOWER(hf.name) = LOWER($1)
          ORDER BY hmy.year DESC
        `, [family]);
        return NextResponse.json({ years: rows.map(r => Number(r.year)) });
      }
    }

    return NextResponse.json({ error: "Invalid type or missing params" }, { status: 400 });

  } catch (err: any) {
    console.error("[/api/fitment]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

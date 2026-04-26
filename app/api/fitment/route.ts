// ============================================================
// app/api/fitment/route.ts
// ============================================================
// Phase 6 — DB-driven dropdowns from canonical Harley tables.
//
// Harley-Davidson → harley_families / harley_models / harley_model_years
// All other makes → legacy catalog_fitment (unchanged)
//
// GET /api/fitment?type=makes
// GET /api/fitment?type=families                        (Harley only)
// GET /api/fitment?type=models&make=Harley-Davidson&family=Touring
// GET /api/fitment?type=years&make=Harley-Davidson&model=FLHX
// ============================================================

import { NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

const HD = "harley-davidson";

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const type   = url.searchParams.get("type")   ?? "makes";
  const make   = url.searchParams.get("make")?.trim()   || null;
  const family = url.searchParams.get("family")?.trim() || null;
  const model  = url.searchParams.get("model")?.trim()  || null;

  try {
    const db = getCatalogDb();
    const isHarley = make?.toLowerCase() === HD;

    // ── MAKES ───────────────────────────────────────────────
    if (type === "makes") {
      const { rows } = await db.query(`
        SELECT DISTINCT make
        FROM public.catalog_fitment
        WHERE make IS NOT NULL AND make <> ''
        ORDER BY make ASC
        LIMIT 500
      `);
      return NextResponse.json({ makes: rows.map(r => r.make) });
    }

    // ── FAMILIES (Harley only) ───────────────────────────────
    if (type === "families") {
      const { rows } = await db.query(`
        SELECT id, name, start_year, end_year
        FROM harley_families
        ORDER BY name ASC
      `);
      return NextResponse.json({ families: rows });
    }

    // ── MODELS ──────────────────────────────────────────────
    if (type === "models" && make) {
      if (isHarley) {
        // Return canonical model codes, optionally filtered by family
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

      // Non-Harley — legacy path
      const { rows } = await db.query(`
        SELECT DISTINCT model
        FROM public.catalog_fitment
        WHERE LOWER(make) = LOWER($1)
          AND model IS NOT NULL AND model <> ''
        ORDER BY model ASC
        LIMIT 500
      `, [make]);
      return NextResponse.json({ models: rows.map(r => r.model) });
    }

    // ── YEARS ───────────────────────────────────────────────
    if (type === "years" && make) {
      if (isHarley && model) {
        // model param = model_code
        const { rows } = await db.query(`
          SELECT DISTINCT hmy.year
          FROM harley_model_years hmy
          JOIN harley_models hm ON hm.id = hmy.model_id
          WHERE hm.model_code = $1
          ORDER BY hmy.year DESC
        `, [model]);
        return NextResponse.json({ years: rows.map(r => Number(r.year)) });
      }

      if (isHarley && family) {
        // All years for a family
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

      // Non-Harley — legacy path
      if (model) {
        const { rows } = await db.query(`
          SELECT DISTINCT generate_series(year_start, year_end) AS year
          FROM public.catalog_fitment
          WHERE LOWER(make)  = LOWER($1)
            AND LOWER(model) = LOWER($2)
            AND year_start IS NOT NULL
            AND year_end   IS NOT NULL
          ORDER BY year DESC
          LIMIT 200
        `, [make, model]);
        return NextResponse.json({ years: rows.map(r => Number(r.year)) });
      }
    }

    return NextResponse.json({ error: "Invalid type or missing params" }, { status: 400 });

  } catch (err: any) {
    console.error("[/api/fitment]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
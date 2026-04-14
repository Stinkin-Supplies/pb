// ============================================================
// app/api/fitment/route.ts
// ============================================================
// Returns distinct fitment values for cascading Make→Model→Year
// dropdowns in the "Fits My Bike" shop filter.
//
// GET /api/fitment?type=makes
//   → { makes: ["Honda", "Yamaha", ...] }
//
// GET /api/fitment?type=models&make=Honda
//   → { models: ["CBR600RR", "CRF450R", ...] }
//
// GET /api/fitment?type=years&make=Honda&model=CBR600RR
//   → { years: [2019, 2018, 2017, ...] }
// ============================================================

import { NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function GET(req: Request) {
  const url   = new URL(req.url);
  const type  = url.searchParams.get("type")  ?? "makes";
  const make  = url.searchParams.get("make")?.trim()  || null;
  const model = url.searchParams.get("model")?.trim() || null;

  try {
    const db = getCatalogDb();

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

    if (type === "models" && make) {
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

    if (type === "years" && make && model) {
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

    return NextResponse.json({ error: "Invalid type or missing params" }, { status: 400 });

  } catch (err: any) {
    console.error("[/api/fitment]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

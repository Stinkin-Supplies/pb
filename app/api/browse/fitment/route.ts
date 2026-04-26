/**
 * app/api/browse/fitment/route.ts
 * Serves harley authority table data for the fitment selector.
 * GET ?type=families
 * GET ?type=models&familyId=3
 * GET ?type=years&modelId=12
 * GET ?type=counts  (product counts per family)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getFamilies,
  getModels,
  getYears,
  getFamilyProductCounts,
} from "@/lib/db/browse";

export async function GET(req: NextRequest) {
  const type     = req.nextUrl.searchParams.get("type");
  const familyId = req.nextUrl.searchParams.get("familyId");
  const modelId  = req.nextUrl.searchParams.get("modelId");

  try {
    switch (type) {
      case "families": {
        const families = await getFamilies();
        return NextResponse.json({ families });
      }
      case "models": {
        if (!familyId) return NextResponse.json({ error: "familyId required" }, { status: 400 });
        const models = await getModels(parseInt(familyId));
        return NextResponse.json({ models });
      }
      case "years": {
        if (!modelId) return NextResponse.json({ error: "modelId required" }, { status: 400 });
        const years = await getYears(parseInt(modelId));
        return NextResponse.json({ years });
      }
      case "counts": {
        const counts = await getFamilyProductCounts();
        return NextResponse.json({ counts });
      }
      default:
        return NextResponse.json({ error: "type required: families|models|years|counts" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("Browse fitment error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
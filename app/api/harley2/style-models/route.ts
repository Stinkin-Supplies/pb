import { NextRequest, NextResponse } from "next/server";
import { getHarleyStyle } from "@/lib/harley/config";

export async function GET(request: NextRequest) {
  const styleName = request.nextUrl.searchParams.get("style");
  const style = getHarleyStyle(styleName);

  if (!style) {
    return NextResponse.json({ error: "Style not found" }, { status: 404 });
  }

  return NextResponse.json({
    style: style.display_name,
    generic_models: style.generic_models,
    models: style.generic_models,
    categories: style.categories,
  });
}

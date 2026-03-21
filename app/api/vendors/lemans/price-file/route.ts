import { NextResponse } from "next/server";

const AUX_COLUMNS = new Set([
  "UPC_CODE",
  "BRAND_NAME",
  "COUNTRY_OF_ORIGIN",
  "COMMODITY_CODE",
  "PRODUCT_CODE",
  "DRAG_PART",
  "WEIGHT",
  "CLOSEOUT_CATALOG_INDICATOR",
  "LAST_CATALOG",
  "RACE_ONLY",
  "GO_LIVE_DATE",
  "PFAS",
  "HARMONIZED_US",
  "HARMONIZED_EU",
  "HARMONIZED_SCHEDULE_B",
  "HEIGHT",
  "LENGTH",
  "WIDTH",
  "DROPSHIP_FEE",
]);

const CATALOGS = new Set([
  "STREET",
  "FATBOOK",
  "ATV",
  "OFFROAD",
  "SNOW",
  "WATERCRAFT",
  "STREET_MIDYEAR",
  "FATBOOK_MIDYEAR",
  "HELMET_AND_APPAREL",
  "TIRE",
  "OLDBOOK",
  "OLDBOOK_MIDYEAR",
  "BICYCLE",
]);

function normalizeArray(val: unknown, allowed: Set<string>) {
  if (!Array.isArray(val)) return undefined;
  const out = val
    .map(v => String(v).trim().toUpperCase())
    .filter(v => allowed.has(v));
  return out.length ? out : undefined;
}

export async function POST(req: Request) {
  const token = process.env.LEMANS_ACCESS_TOKEN;
  const endpoint = process.env.LEMANS_PRICEFILE_ENDPOINT;

  if (!token || !endpoint) {
    return NextResponse.json(
      { error: "Missing LEMANS_ACCESS_TOKEN or LEMANS_PRICEFILE_ENDPOINT" },
      { status: 500 }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const payload: any = {};

  if (Array.isArray(body.dealerCodes)) {
    payload.dealerCodes = body.dealerCodes.map((c: any) => String(c).trim());
  }

  if (typeof body.headersPrepended === "boolean") {
    payload.headersPrepended = body.headersPrepended;
  } else {
    payload.headersPrepended = true;
  }

  const aux = normalizeArray(body.auxillaryColumns, AUX_COLUMNS);
  if (aux) payload.auxillaryColumns = aux;

  const catalogs = normalizeArray(body.attachingCatalogs, CATALOGS);
  if (catalogs) payload.attachingCatalogs = catalogs;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { error: "LeMans request failed", status: res.status, body: text },
      { status: 502 }
    );
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch (_) {
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": res.headers.get("content-type") ?? "text/plain" },
    });
  }
}

export const runtime = "nodejs";

import { NextResponse } from "next/server";

function getOrigin(req: Request) {
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

async function proxyPu(req: Request, method: "GET" | "POST") {
  const secret = process.env.SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing SYNC_SECRET on server." }, { status: 500 });
  }

  const origin = getOrigin(req);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
  };

  const forceSync = req.headers.get("x-force-sync");
  if (forceSync) headers["x-force-sync"] = forceSync;

  const res = await fetch(`${origin}/api/vendors/parts-unlimited/sync`, {
    method,
    headers,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(req: Request) {
  return proxyPu(req, "GET");
}

export async function POST(req: Request) {
  return proxyPu(req, "POST");
}

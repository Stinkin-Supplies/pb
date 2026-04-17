import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import AdmZip from "adm-zip";

const ALLOWED_HOST  = "asset.lemansnet.com";
const CACHE_DIR     = process.env.IMG_CACHE_DIR ?? "/tmp/stinkin-img-cache";
const FETCH_TIMEOUT = 12_000;

const MIME: Record<string, string> = {
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif:  "image/gif",
};

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("u");
  if (!url) return new NextResponse("Missing u param", { status: 400 });

  // Security: only proxy LeMans
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== ALLOWED_HOST) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  const hash      = createHash("sha256").update(url).digest("hex");
  const cacheBase = join(CACHE_DIR, hash);

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  // Serve from disk cache if present (any extension)
  for (const ext of Object.keys(MIME)) {
    const p = `${cacheBase}.${ext}`;
    if (existsSync(p)) {
      return new NextResponse(readFileSync(p), {
        headers: {
          "Content-Type": MIME[ext],
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  }

  // Download ZIP
  let zipBuf: Buffer;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) return new NextResponse("Upstream error", { status: 502 });
    zipBuf = Buffer.from(await res.arrayBuffer());
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }

  // Extract first image entry
  let imgData: Buffer;
  let imgExt: string;
  try {
    const zip     = new AdmZip(zipBuf);
    const entry   = zip.getEntries().find(e =>
      /\.(png|jpg|jpeg|webp|gif)$/i.test(e.entryName)
    );
    if (!entry) return new NextResponse("No image in ZIP", { status: 404 });
    imgData = entry.getData();
    imgExt  = entry.entryName.split(".").pop()!.toLowerCase();
  } catch {
    return new NextResponse("ZIP parse error", { status: 502 });
  }

  const cachePath = `${cacheBase}.${imgExt}`;
  writeFileSync(cachePath, imgData);

  return new NextResponse(imgData, {
    headers: {
      "Content-Type": MIME[imgExt] ?? "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import AdmZip from "adm-zip";

// Allowlisted image hosts — add any vendor CDN here
const ALLOWED_HOSTS = new Set([
  "asset.lemansnet.com",
  "www.vtwinmfg.com",
  "vtwinmfg.com",
  "images.vtwinmfg.com",
  "cdn.wps-inc.com",
  "assets.wps-inc.com",
  "img.wps-inc.com",
]);
const CACHE_DIR     = process.env.IMG_CACHE_DIR ?? "/tmp/stinkin-img-cache";
const FETCH_TIMEOUT = 12_000;

const MIME: Record<string, string> = {
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif:  "image/gif",
};

function imageResponse(data: Buffer, contentType: string) {
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("u");
  if (!url) {
    return new NextResponse("Missing u param", { status: 400 });
  }

  // 🔒 Security: only allow known vendor image hosts
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  const hash      = createHash("sha256").update(url).digest("hex");
  const cacheBase = join(CACHE_DIR, hash);

  // ✅ Serve from disk cache if available
  for (const ext of Object.keys(MIME)) {
    const filePath = `${cacheBase}.${ext}`;
    if (existsSync(filePath)) {
      const file = readFileSync(filePath);
      return imageResponse(file, MIME[ext]);
    }
  }

  // ⬇️ Fetch the remote resource
  let rawBuffer: Buffer;
  let contentTypeHeader: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) {
      return new NextResponse("Upstream error", { status: 502 });
    }
    rawBuffer = Buffer.from(await res.arrayBuffer());
    contentTypeHeader = res.headers.get("content-type") ?? "";
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }

  let imgData: Buffer;
  let imgExt: string;

  // 🖼 Check if it's a plain image (VTwin, WPS, etc.)
  const isPlainImage = /image\/(jpeg|png|webp|gif)/i.test(contentTypeHeader)
    || /\.(jpg|jpeg|png|webp|gif)$/i.test(parsed.pathname);

  if (isPlainImage) {
    imgData = rawBuffer;
    const extMatch = parsed.pathname.match(/\.(jpg|jpeg|png|webp|gif)$/i);
    imgExt = extMatch ? extMatch[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
  } else {
    // 📦 Assume ZIP (LeMans CDN format) — extract first image
    try {
      const zip   = new AdmZip(rawBuffer);
      const entry = zip.getEntries().find(e =>
        /\.(png|jpg|jpeg|webp|gif)$/i.test(e.entryName)
      );
      if (!entry) {
        return new NextResponse("No image in ZIP", { status: 404 });
      }
      imgData = entry.getData();
      imgExt  = entry.entryName.split(".").pop()!.toLowerCase();
    } catch {
      return new NextResponse("ZIP parse error", { status: 502 });
    }
  }

  // 💾 Save to disk cache
  const cachePath = `${cacheBase}.${imgExt}`;
  writeFileSync(cachePath, imgData);

  return imageResponse(
    imgData,
    MIME[imgExt] ?? "image/png"
  );
}
export const runtime = "nodejs";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.SYNC_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scriptPath = path.join(process.cwd(), "scripts/ingest/indexTypesense.js");

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });

    return NextResponse.json({
      success: true,
      stdout,
      stderr,
    });
  } catch (error: any) {
    console.error("[Admin Reindex]", error?.message ?? error);
    return NextResponse.json(
      {
        error: error?.message ?? "Reindex failed",
        stdout: error?.stdout ?? "",
        stderr: error?.stderr ?? "",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}

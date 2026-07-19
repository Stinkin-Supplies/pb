/**
 * app/api/admin/pu-price-sync/route.ts
 *
 * Called nightly by Vercel cron to download + import the PU price file.
 * Protected by SYNC_SECRET header.
 *
 * Also callable manually:
 *   curl -X POST https://your-domain.com/api/admin/pu-price-sync \
 *     -H "x-sync-secret: YOUR_SYNC_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';

export const maxDuration = 300; // 5 min — price file download + upsert + reindex

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.headers.get('x-sync-secret');
  if (!secret || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const skipReindex = req.nextUrl.searchParams.get('skip_reindex') === '1';

  try {
    const args = skipReindex ? '--skip-reindex' : '';
    const scriptPath = path.join(process.cwd(), 'scripts/ingest/importPuPriceFile.js');

    const output = execSync(`node ${scriptPath} ${args}`, {
      encoding: 'utf8',
      timeout: 280_000, // 4m40s — leave buffer before maxDuration
    });

    return NextResponse.json({
      ok: true,
      output: output.slice(-2000), // last 2000 chars of output
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[pu-price-sync] Error:', err.message);
    return NextResponse.json({
      ok: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Allow Vercel cron to call this via GET as well
export async function GET(req: NextRequest) {
  return POST(req);
}

// app/api/image-proxy/route.ts
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = [
  'cdn.wpsstatic.com',
  'wpsstatic.com',
]

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_HOSTS.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')

  // Validate URL exists
  if (!url) {
    return new NextResponse('Missing url param', { status: 400 })
  }

  // Whitelist check — never proxy arbitrary URLs
  if (!isAllowedUrl(url)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        // WPS requires a Referer from their own domain
        'Referer': 'https://www.wpsstatic.com/',
        'User-Agent': 'Mozilla/5.0 (compatible; YstinkinSupplies/1.0)',
        'Accept': 'image/webp,image/avif,image/*,*/*;q=0.8',
      },
      // Don't cache on the fetch level — we handle caching in the response
      cache: 'no-store',
    })

    if (!upstream.ok) {
      console.error(`[image-proxy] upstream ${upstream.status} for ${url}`)
      return new NextResponse('Image unavailable', { status: 502 })
    }

    const contentType = upstream.headers.get('Content-Type') || 'image/jpeg'

    // Reject non-image responses (safety check)
    if (!contentType.startsWith('image/')) {
      return new NextResponse('Not an image', { status: 502 })
    }

    const blob = await upstream.arrayBuffer()

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache for 24 hours in browser, 7 days on CDN/edge
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        'Content-Length': blob.byteLength.toString(),
      },
    })
  } catch (err) {
    console.error(`[image-proxy] fetch error for ${url}:`, err)
    return new NextResponse('Proxy error', { status: 500 })
  }
}
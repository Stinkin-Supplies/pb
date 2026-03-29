// app/api/image-proxy/route.ts
// Proxies WPS CDN images which block direct browser hotlinking.

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = ['cdn.wpsstatic.com']

function isAllowedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

const AUTH_HEADER = process.env.WPS_API_KEY ? `Bearer ${process.env.WPS_API_KEY}` : ''
const HEADER_VARIANTS: Array<Record<string, string>> = [
  {
    'Referer':        'https://www.wps-inc.com/',
    'Origin':         'https://www.wps-inc.com',
    'User-Agent':     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept':         'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'same-site',
  },
  {
    'Referer':    'https://www.wps-inc.com/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept':     'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  },
  {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept':     'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  },
  {
    'User-Agent': 'curl/7.88.1',
    'Accept':     '*/*',
  },
  {
    'Authorization': AUTH_HEADER,
    'User-Agent':    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept':        'image/*',
  },
]

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url)               return new NextResponse('Missing url param', { status: 400 })
  if (!isAllowedUrl(url)) return new NextResponse('Forbidden',         { status: 403 })

  // WPS CDN serves images directly in the browser — server-side proxy always 403s.
  // Redirect to the direct URL so the browser loads it natively.
  const WPS_DIRECT = ['cdn.wpsstatic.com']
  try {
    const { hostname } = new URL(url)
    if (WPS_DIRECT.some(h => hostname === h || hostname.endsWith(`.${h}`))) {
      return NextResponse.redirect(url, { status: 302 })
    }
  } catch {}

  for (let i = 0; i < HEADER_VARIANTS.length; i++) {
    try {
      const upstream = await fetch(url, { headers: HEADER_VARIANTS[i], cache: 'no-store' })

      if (!upstream.ok) {
        console.log(`[image-proxy] variant ${i + 1} → ${upstream.status} for ${url}`)
        continue
      }

      const contentType = upstream.headers.get('Content-Type') || 'image/jpeg'
      if (!contentType.startsWith('image/')) continue

      const blob = await upstream.arrayBuffer()
      console.log(`[image-proxy] success with variant ${i + 1} for ${url}`)

      return new NextResponse(blob, {
        status: 200,
        headers: {
          'Content-Type':    contentType,
          'Cache-Control':   'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
          'Content-Length':  blob.byteLength.toString(),
          'X-Proxy-Variant': String(i + 1),
        },
      })
    } catch (err) {
      console.error(`[image-proxy] variant ${i + 1} error:`, err)
    }
  }

  return NextResponse.redirect(new URL('/images/placeholder.jpg', req.url))
}

// app/api/image-proxy/route.ts
// Proxies CDN images which block direct browser hotlinking.
// LeMans serves images inside zip files — we extract and serve the image directly.

import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'

const ALLOWED_HOSTS = ['cdn.wpsstatic.com', 'asset.lemansnet.com']

function isAllowedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

// Detect "coming soon" placeholder — base64 decodes to static/sites/lemansplatform/image-coming-soon
function isComingSoon(url: string): boolean {
  try {
    const path = new URL(url).pathname
    const b64  = path.replace('/z/', '')
    const decoded = Buffer.from(b64, 'base64').toString('utf8')
    return decoded.includes('image-coming-soon') || decoded.includes('coming-soon')
  } catch {
    return false
  }
}

const LEMANS_HEADERS = {
  'Referer':    'https://www.lepartsmartner.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept':     '*/*',
}

// Dynamically import fflate (pure JS zip library, works in edge/node)
async function extractImageFromZip(zipBuffer: ArrayBuffer): Promise<{ data: Uint8Array; ext: string } | null> {
  try {
    const { unzipSync } = await import('fflate')
    const files = unzipSync(new Uint8Array(zipBuffer))
    // Find first image file in zip
    for (const [name, data] of Object.entries(files)) {
      const lower = name.toLowerCase()
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return { data, ext: 'image/jpeg' }
      if (lower.endsWith('.png'))  return { data, ext: 'image/png'  }
      if (lower.endsWith('.webp')) return { data, ext: 'image/webp' }
      if (lower.endsWith('.gif'))  return { data, ext: 'image/gif'  }
    }
  } catch (err: any) {
    console.error('[image-proxy] zip extract error:', err.message)
  }
  return null
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url)               return new NextResponse('Missing url param', { status: 400 })
  if (!isAllowedUrl(url)) return new NextResponse('Forbidden',         { status: 403 })

  const placeholder = NextResponse.redirect(new URL('/images/placeholder.jpg', req.url))

  try {
    const { hostname } = new URL(url)

    // WPS: redirect directly to CDN
    if (hostname === 'cdn.wpsstatic.com' || hostname.endsWith('.wpsstatic.com')) {
      return NextResponse.redirect(url, { status: 302 })
    }

    // LeMans: download zip, extract image, serve directly
    if (hostname === 'asset.lemansnet.com' || hostname.endsWith('.lemansnet.com')) {
      // Skip coming-soon placeholders immediately
      if (isComingSoon(url)) return placeholder

      const upstream = await fetch(url, {
        headers: LEMANS_HEADERS,
        cache:   'no-store',
      })

      if (!upstream.ok) return placeholder

      const contentType = upstream.headers.get('content-type') ?? ''

      // If it's already an image (some URLs serve directly)
      if (contentType.startsWith('image/')) {
        const blob = await upstream.arrayBuffer()
        return new NextResponse(blob, {
          status: 200,
          headers: {
            'Content-Type':  contentType,
            'Cache-Control': 'public, max-age=86400, s-maxage=604800',
          },
        })
      }

      // It's a zip — extract the image
      if (contentType.includes('zip') || contentType.includes('octet-stream')) {
        const zipBuffer = await upstream.arrayBuffer()
        const image = await extractImageFromZip(zipBuffer)
        if (!image) return placeholder

        return new NextResponse(Buffer.from(image.data), {
          status: 200,
          headers: {
            'Content-Type':  image.ext,
            'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
            'Content-Length': image.data.byteLength.toString(),
          },
        })
      }

      return placeholder
    }

  } catch (err: any) {
    console.error('[image-proxy] error:', err.message)
  }

  return placeholder
}

export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // Already proxied
  if (url.startsWith('/api/img') || url.startsWith('/api/image-proxy')) return url;
  // Skip zip files — no image to proxy
  if (url.endsWith('.zip')) return null;
  // Proxy ALL LeMans CDN URLs regardless of path structure
  if (url.includes('lemansnet.com')) {
    return `/api/img?u=${encodeURIComponent(url)}`;
  }
  // Proxy any other http:// image (mixed content breaks on https sites)
  if (url.startsWith('http://')) {
    return `/api/img?u=${encodeURIComponent(url)}`;
  }
  return url;
}

export function proxyImageUrls(urls: string[] | null | undefined): string[] {
  if (!urls?.length) return [];
  return urls.map(u => proxyImageUrl(u)).filter((u): u is string => u !== null);
}

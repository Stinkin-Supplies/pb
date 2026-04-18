export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/api/img') || url.startsWith('/api/image-proxy')) return url;
  if (url.startsWith('http://asset.lemansnet.com/z/')) {
    return `/api/img?u=${encodeURIComponent(url)}`;
  }
  if (url.endsWith('.zip')) return null;
  return url;
}

export function proxyImageUrls(urls: string[] | null | undefined): string[] {
  if (!urls?.length) return [];
  return urls.map(u => proxyImageUrl(u)).filter((u): u is string => u !== null);
}

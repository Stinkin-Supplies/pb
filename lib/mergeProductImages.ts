export function isRealImage(url: string) {
  if (!url || !url.startsWith("http")) return false

  const lower = url.toLowerCase()

  if (
    lower.includes(".zip") ||
    lower.includes("download") ||
    lower.includes("asset")
  ) return false

  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".svg")
  )
}

export function normalize(url: string) {
  return url
    .replace("http://", "https://")
    .split("?")[0]
}

export function dedupe(urls: string[]) {
  return [...new Set(urls.map(normalize))]
}

export function mergeProductImages({
  wps = [],
  pies = [],
  pu = [],
  score
}: {
  wps?: string[]
  pies?: string[]
  pu?: string[]
  score?: (url: string) => number
}) {
  const cleanWps  = dedupe(wps.filter(isRealImage))
  const cleanPies = dedupe(pies.filter(isRealImage))
  const cleanPu   = dedupe(pu.filter(isRealImage))

  // Priority merge
  let merged = [
    ...cleanWps,
    ...cleanPies,
    ...cleanPu
  ]

  // Final dedupe (cross-source)
  merged = dedupe(merged)

  if (score) {
    merged.sort((a, b) => score(b) - score(a))
  }

  // Limit size (important)
  return merged.slice(0, 5)
}

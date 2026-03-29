export function cleanImageUrls(urls = []) {
  const isReal = (url) =>
    typeof url === "string" &&
    url.startsWith("http") &&
    (
      url.endsWith(".jpg") ||
      url.endsWith(".jpeg") ||
      url.endsWith(".png") ||
      url.endsWith(".webp") ||
      url.includes("asset.lemansnet.com/z/")
    );

  return urls
    .filter(isReal)
    .map((url) => url);
}

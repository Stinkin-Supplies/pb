export function cleanImageUrls(urls = []) {
  const isReal = (url) =>
    typeof url === "string" &&
    url.startsWith("http") &&
    (
      url.endsWith(".jpg") ||
      url.endsWith(".jpeg") ||
      url.endsWith(".png") ||
      url.endsWith(".webp")
    );

  return urls
    .filter(isReal)
    .map((url) => {
      return url
        .replace("https://wpsstatic.com", "https://cdn.wpsstatic.com")
        .replace("https://images.wpsstatic.com", "https://cdn.wpsstatic.com");
    });
}

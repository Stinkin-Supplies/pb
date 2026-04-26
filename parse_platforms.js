function detectPlatform(text, platforms) {
  for (const p of platforms) {
    const regex = new RegExp(`\\b${p.alias_text}\\b`, 'i');
    if (regex.test(text)) {
      return p;
    }
  }
  return null;
}

module.exports = { detectPlatform };

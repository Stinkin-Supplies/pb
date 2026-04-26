function buildRegex(alias) {
  return new RegExp(`\\b${alias}\\b`, 'i');
}

function detectModel(text, aliases) {
  for (const alias of aliases) {
    const regex = buildRegex(alias.alias_text);
    if (regex.test(text)) {
      return alias;
    }
  }
  return null;
}

module.exports = { detectModel };

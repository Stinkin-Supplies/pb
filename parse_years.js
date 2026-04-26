const YEAR_4 = /\b(19[7-9]\d|20\d{2})\b/g;
const YEAR_APOS = /'(\d{2})\b/;
const RANGE_4 = /\b(19[7-9]\d|20\d{2})\s*[-–]\s*(19[7-9]\d|20\d{2})\b/;
const RANGE_2 = /(?<!\d)'?(\d{1,2})(?:CVO|TC)?[-–]'?(\d{2})\b/i;

function normalizeTwoDigitYear(yy) {
  const n = parseInt(yy, 10);
  return n <= 30 ? 2000 + n : 1900 + n;
}

function extractYears(text) {
  if (/universal|most models|custom application/i.test(text)) {
    return null;
  }

  let match = text.match(RANGE_4);
  if (match) {
    return { start: parseInt(match[1], 10), end: parseInt(match[2], 10) };
  }

  match = text.match(RANGE_2);
  if (match) {
    return {
      start: normalizeTwoDigitYear(match[1]),
      end: normalizeTwoDigitYear(match[2]),
    };
  }

  match = text.match(YEAR_APOS);
  if (match) {
    return {
      start: normalizeTwoDigitYear(match[1]),
      end: normalizeTwoDigitYear(match[1]),
    };
  }

  match = text.match(YEAR_4);
  if (match) {
    const year = parseInt(match[1], 10);
    return { start: year, end: year };
  }

  return null;
}

module.exports = { extractYears };

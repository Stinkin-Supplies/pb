const fs = require('fs');
let src = fs.readFileSync('scripts/ingest/build_oem_fitment_touring.mjs', 'utf8');

// 1. Replace CATALOGS manifest
const csStart = src.indexOf('// ── Catalog manifest');
const csEnd = src.indexOf('\n];\n', csStart) + 4;
const newCatalogs = `// ── Catalog manifest ──────────────────────────────────────────────────────────
const CATALOGS = [
  { ys: 1991, ye: 1992, file: '1991-1992-touring.pdf' },
  { ys: 1993, ye: 1994, file: '1993-1994-touring.pdf' },
  { ys: 1995, ye: 1996, file: '1995-1996-touring.pdf' },
  { ys: 1997, ye: 1997, file: '1997-touring.pdf' },
  { ys: 1998, ye: 1998, file: '1998-touring.pdf' },
  { ys: 2000, ye: 2000, file: '2000-touring.pdf' },
  { ys: 2002, ye: 2002, file: '2002-touring.pdf' },
  { ys: 2003, ye: 2003, file: '2003-touring.pdf' },
  { ys: 2004, ye: 2004, file: '2004-touring.pdf' },
  { ys: 2005, ye: 2005, file: '2005-touring.pdf' },
  { ys: 2006, ye: 2006, file: '2006-touring.pdf' },
  { ys: 2009, ye: 2009, file: '2009-touring.pdf' },
  { ys: 2011, ye: 2011, file: '2011-touring.pdf' },
  { ys: 2012, ye: 2012, file: '2012-touring.pdf' },
  { ys: 2013, ye: 2013, file: '2013-touring.pdf' },
  { ys: 2016, ye: 2016, file: '2016-touring.pdf' },
  { ys: 2017, ye: 2017, file: '2017-touring.pdf' },
  { ys: 2018, ye: 2018, file: '2018-touring.pdf' },
  { ys: 2019, ye: 2019, file: '2019-touring.pdf' },
  { ys: 2020, ye: 2020, file: '2020-touring.pdf' },
  { ys: 2021, ye: 2021, file: '2021-touring.pdf' },
  { ys: 2022, ye: 2022, file: '2022-touring.pdf' },
  { ys: 2023, ye: 2023, file: '2023-touring.pdf' },
  { ys: 2023, ye: 2023, file: 'Touring-FLHXSE-2023.pdf' },
];\n`;
src = src.slice(0, csStart) + newCatalogs + src.slice(csEnd);

// 2. Add dedup guard — skip catalogs already extracted
const oldFor = '    for (const cat of catalogs) {';
const newFor = `    // Skip catalogs already in oem_fitment to avoid duplicates
    let alreadyDone = new Set();
    if (!DRY) {
      try {
        const { rows } = await pool.query('SELECT DISTINCT catalog_file FROM oem_fitment');
        alreadyDone = new Set(rows.map(r => r.catalog_file));
        if (alreadyDone.size > 0) console.log('  Skipping ' + alreadyDone.size + ' already-extracted catalog(s)');
      } catch (_) {}
    }

    for (const cat of catalogs) {
      if (alreadyDone.has(cat.file)) { prog.tick('SKIP: ' + cat.file); continue; }`;

src = src.replace(oldFor, newFor);

fs.writeFileSync('scripts/ingest/build_oem_fitment_touring.mjs', src);
console.log('Done. Catalogs:', (src.match(/touring\.pdf/g) || []).length, 'dedup refs:', (src.match(/alreadyDone/g) || []).length);

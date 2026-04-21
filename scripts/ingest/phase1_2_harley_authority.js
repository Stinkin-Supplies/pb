#!/usr/bin/env node
/**
 * phase1_2_harley_authority.js
 * ─────────────────────────────────────────────────────────────
 * Phase 1 — Create canonical Harley vehicle tables
 * Phase 2 — Seed families, models, and explode model years
 *
 * Progress bars on every stage. Safe to re-run (idempotent).
 * ─────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── Progress bar ──────────────────────────────────────────────
function progress(tag, current, total, startMs, extra = '') {
  const pct   = total > 0 ? current / total : 0;
  const filled = Math.round(pct * 24);
  const bar   = '█'.repeat(filled) + '░'.repeat(24 - filled);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const line  = `[${tag}] │${bar}│ ${(pct * 100).toFixed(1)}% (${current}/${total})${extra} | ${elapsed}s`;
  process.stdout.write('\r' + line);
}

function done(tag, msg) {
  process.stdout.write('\n');
  console.log(`[${tag}] ✓ ${msg}`);
}

// ── Raw model data parsed from CSV ────────────────────────────
// Format: { family, name, codes[], start_year, end_year }
// Multi-range rows are split into separate entries.
// "CURRENT" = 2026

const CURRENT_YEAR = 2026;

function parseYear(s) {
  if (!s) return null;
  s = s.trim().replace(/'/g, '').replace(/`/g, '');
  if (s.toUpperCase() === 'CURRENT') return CURRENT_YEAR;
  const n = parseInt(s);
  if (isNaN(n)) return null;
  // Handle 2-digit years
  if (n >= 84 && n <= 99) return 1900 + n;
  if (n >= 0  && n <= 26) return 2000 + n;
  return n;
}

function parseYearRange(rangeStr) {
  // Returns array of [start, end] pairs
  // e.g. "93 - 09, '14 - 17" → [[1993,2009],[2014,2017]]
  if (!rangeStr) return [];
  const ranges = [];
  // Split on commas that separate ranges
  const parts = rangeStr.split(/,(?![^(]*\))/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Match "XX - YY" or "XX-YY" or just "XX"
    const match = trimmed.match(/^([^-–]+?)(?:\s*[-–]\s*(.+))?$/);
    if (!match) continue;
    const start = parseYear(match[1]);
    const end   = match[2] ? parseYear(match[2]) : start;
    if (start && end) ranges.push([start, end]);
    else if (start)   ranges.push([start, start]);
  }
  return ranges;
}

function parseModelCode(codeStr) {
  if (!codeStr) return [];
  // Split on "/" and commas, clean each
  return codeStr
    .split(/[/,]/)
    .map(c => c.trim().replace(/["""]/g, ''))
    .filter(Boolean);
}

// ── Canonical model data ──────────────────────────────────────
// Cleaned from Sheet_3-Table_1.csv
// family_key maps to harley_families.name

const RAW_MODELS = [
  // ── Revolution Max ──
  { family: 'Revolution Max', name: 'PAN AMERICA',              codes: ['RA1250'],           years: '2021-2024' },
  { family: 'Revolution Max', name: 'PAN AMERICA SPECIAL',      codes: ['RA1250S'],          years: '2021-2026' },
  { family: 'Revolution Max', name: 'CVO PAN AMERICA',          codes: ['RA1250SE'],         years: '2024-2025' },
  { family: 'Revolution Max', name: 'PAN AMERICA 1250 ST',      codes: ['RA1250ST'],         years: '2025-2026' },
  { family: 'Revolution Max', name: 'PAN AMERICA 1250 LIMITED', codes: ['RA1250L'],          years: '2026-2026' },
  { family: 'Revolution Max', name: 'SPORTSTER S',              codes: ['RH1250S'],          years: '2021-2026' },
  { family: 'Revolution Max', name: 'NIGHTSTER',                codes: ['RH975'],            years: '2022-2026' },
  { family: 'Revolution Max', name: 'NIGHTSTER SPECIAL',        codes: ['RH975S'],           years: '2023-2026' },

  // ── Street ──
  { family: 'Street', name: 'STREET 500',   codes: ['XG500'],  years: '2015-2021' },
  { family: 'Street', name: 'STREET 750',   codes: ['XG750'],  years: '2015-2021' },
  { family: 'Street', name: 'STREET ROD',   codes: ['XG750A'], years: '2017-2021' },

  // ── Sportster ──
  { family: 'Sportster', name: 'SPORTSTER 1000',                codes: ['XLH'],              years: '1984-1985' },
  { family: 'Sportster', name: 'SPORTSTER 883',                 codes: ['XLH883','XL883'],   years: '1986-2008' },
  { family: 'Sportster', name: 'SPORTSTER 883 CUSTOM',          codes: ['XLH883C','XL883C'], years: '1999-2009' },
  { family: 'Sportster', name: 'SPORTSTER 883 DELUXE',          codes: ['XLH883DLX'],        years: '1988-1995' },
  { family: 'Sportster', name: 'SPORTSTER 883 HUGGER',          codes: ['XLH883HUG'],        years: '1988-2003' },
  { family: 'Sportster', name: 'SPORTSTER 1100',                codes: ['XLH1100'],          years: '1986-1987' },
  { family: 'Sportster', name: 'SPORTSTER 1200',                codes: ['XLH1200'],          years: '1988-2003' },
  { family: 'Sportster', name: 'SPORTSTER 1200 CUSTOM',         codes: ['XLH1200C','XL1200C'], years: '1996-2020' },
  { family: 'Sportster', name: 'SPORTSTER 1200 SPORT',          codes: ['XL1200S'],          years: '1996-2003' },
  { family: 'Sportster', name: 'SPORTSTER 883 LOW',             codes: ['XL883L'],           years: '2005-2010' },
  { family: 'Sportster', name: 'SUPERLOW 883',                  codes: ['XL883L'],           years: '2011-2020' },
  { family: 'Sportster', name: 'IRON 883',                      codes: ['XL883N'],           years: '2009-2022' },
  { family: 'Sportster', name: 'SPORTSTER 883R',                codes: ['XL883R'],           years: '2002-2007' },
  { family: 'Sportster', name: 'SPORTSTER ROADSTER',            codes: ['XL1200CX'],         years: '2016-2020' },
  { family: 'Sportster', name: 'SPORTSTER 1200 LOW',            codes: ['XL1200L'],          years: '2006-2011' },
  { family: 'Sportster', name: 'SPORTSTER 1200 NIGHTSTER',      codes: ['XL1200N'],          years: '2007-2012' },
  { family: 'Sportster', name: 'IRON 1200',                     codes: ['XL1200NS'],         years: '2018-2020' },
  { family: 'Sportster', name: 'SPORTSTER 1200 ROADSTER',       codes: ['XL1200R'],          years: '2004-2008' },
  { family: 'Sportster', name: 'SUPERLOW 1200T',                codes: ['XL1200T'],          years: '2014-2017' },
  { family: 'Sportster', name: 'SEVENTY-TWO',                   codes: ['XL1200V'],          years: '2012-2016' },
  { family: 'Sportster', name: 'FORTY-EIGHT',                   codes: ['XL1200X'],          years: '2010-2022' },
  { family: 'Sportster', name: 'FORTY-EIGHT SPECIAL',           codes: ['XL1200XS'],         years: '2018-2020' },
  { family: 'Sportster', name: '50TH ANNIVERSARY SPORTSTER',    codes: ['XL50'],             years: '2007-2007' },
  { family: 'Sportster', name: 'ROADSTER',                      codes: ['XLS'],              years: '1984-1985' },
  { family: 'Sportster', name: 'XLX-61',                        codes: ['XLX'],              years: '1984-1986' },
  { family: 'Sportster', name: 'XR-1000',                       codes: ['XR1000'],           years: '1984-1985' },
  { family: 'Sportster', name: 'XR1200',                        codes: ['XR1200'],           years: '2008-2010' },
  { family: 'Sportster', name: 'XR1200X',                       codes: ['XR1200X'],          years: '2011-2013' },

  // ── Dyna ──
  { family: 'Dyna', name: 'SWITCHBACK',              codes: ['FLD'],       years: '2012-2016' },
  { family: 'Dyna', name: 'SUPER GLIDE',             codes: ['FXD'],       years: '1995-2010' },
  { family: 'Dyna', name: 'STREET BOB',              codes: ['FXDB'],      years: '2006-2017' },
  { family: 'Dyna', name: 'SUPER GLIDE CUSTOM',      codes: ['FXDC'],      years: '2005-2014' },
  { family: 'Dyna', name: 'FAT BOB',                 codes: ['FXDF'],      years: '2008-2017' },
  { family: 'Dyna', name: 'CVO FAT BOB',             codes: ['FXDFSE'],    years: '2009-2010' },
  { family: 'Dyna', name: 'LOW RIDER',               codes: ['FXDL'],      years: '1993-2017' },
  { family: 'Dyna', name: 'LOW RIDER S',             codes: ['FXDLS'],     years: '2016-2017' },
  { family: 'Dyna', name: 'DYNA CONVERTIBLE',        codes: ['FXDS'],      years: '1994-2000' },
  { family: 'Dyna', name: 'SCREAMIN EAGLE DYNA',     codes: ['FXDSE'],     years: '2007-2008' },
  { family: 'Dyna', name: 'WIDE GLIDE',              codes: ['FXDWG'],     years: '1993-2017' },
  { family: 'Dyna', name: 'CVO WIDE GLIDE',          codes: ['FXDWG2','FXDWG3'], years: '2001-2002' },
  { family: 'Dyna', name: 'SUPER GLIDE SPORT',       codes: ['FXDX'],      years: '1999-2005' },

  // ── Softail M8 ──
  { family: 'Softail M8', name: 'SOFTAIL DELUXE',      codes: ['FLDE'],       years: '2018-2020' },
  { family: 'Softail M8', name: 'FAT BOY',             codes: ['FLFB','FLFBS'], years: '2018-2026' },
  { family: 'Softail M8', name: 'HERITAGE CLASSIC',    codes: ['FLHC','FLHCS'], years: '2018-2026' },
  { family: 'Softail M8', name: 'SOFTAIL SLIM',        codes: ['FLSL'],       years: '2018-2021' },
  { family: 'Softail M8', name: 'SPORT GLIDE',         codes: ['FLSB'],       years: '2018-2021' },
  { family: 'Softail M8', name: 'STREET BOB',          codes: ['FXBB','FXBBS'], years: '2018-2026' },
  { family: 'Softail M8', name: 'BREAKOUT',            codes: ['FXBR','FXBRS'], years: '2023-2026' },
  { family: 'Softail M8', name: 'FAT BOB 114',         codes: ['FXFB','FXFBS'], years: '2018-2024' },
  { family: 'Softail M8', name: 'LOW RIDER',           codes: ['FXLR'],       years: '2018-2020' },
  { family: 'Softail M8', name: 'LOW RIDER S',         codes: ['FXLRS'],      years: '2020-2026' },
  { family: 'Softail M8', name: 'LOW RIDER ST',        codes: ['FXLRST'],     years: '2022-2026' },
  { family: 'Softail M8', name: 'SOFTAIL STANDARD',    codes: ['FXST'],       years: '2021-2024' },

  // ── Softail Evo ──
  { family: 'Softail Evo', name: 'SOFTAIL SLIM',               codes: ['FLS','FLSS'],     years: '2012-2017' },
  { family: 'Softail Evo', name: 'HERITAGE SOFTAIL',           codes: ['FLST'],           years: '1986-2006' },
  { family: 'Softail Evo', name: 'HERITAGE SOFTAIL CLASSIC',   codes: ['FLSTC'],          years: '1988-2017' },
  { family: 'Softail Evo', name: 'CROSS BONES',                codes: ['FLSTSB'],         years: '2008-2011' },
  { family: 'Softail Evo', name: 'SOFTAIL SPRINGER CLASSIC',   codes: ['FLSTSC'],         years: '2005-2007' },
  { family: 'Softail Evo', name: 'CVO SOFTAIL CONVERTIBLE',    codes: ['FLSTSE'],         years: '2010-2012' },
  { family: 'Softail Evo', name: 'FAT BOY',                    codes: ['FLSTF'],          years: '1990-2017' },
  { family: 'Softail Evo', name: 'FAT BOY LO',                 codes: ['FLSTFB'],         years: '2010-2016' },
  { family: 'Softail Evo', name: 'FAT BOY S',                  codes: ['FLSTFBS'],        years: '2016-2017' },
  { family: 'Softail Evo', name: 'CVO FAT BOY',                codes: ['FLSTFSE'],        years: '2005-2006' },
  { family: 'Softail Evo', name: 'HERITAGE SOFTAIL SPECIAL',   codes: ['FLSTN'],          years: '1993-1996' },
  { family: 'Softail Evo', name: 'SOFTAIL DELUXE',             codes: ['FLSTN'],          years: '2005-2017' },
  { family: 'Softail Evo', name: 'CVO DELUXE',                 codes: ['FLSTNSE'],        years: '2014-2017' },
  { family: 'Softail Evo', name: 'HERITAGE SPRINGER',          codes: ['FLSTS'],          years: '1997-2003' },
  { family: 'Softail Evo', name: 'ROCKER',                     codes: ['FXCW','FXCWC'],   years: '2008-2011' },
  { family: 'Softail Evo', name: 'BLACKLINE',                  codes: ['FXS'],            years: '2011-2013' },
  { family: 'Softail Evo', name: 'BREAKOUT',                   codes: ['FXSB'],           years: '2013-2017' },
  { family: 'Softail Evo', name: 'CVO BREAKOUT',               codes: ['FXSBSE'],         years: '2013-2014' },
  { family: 'Softail Evo', name: 'CVO PRO STREET BREAKOUT',    codes: ['FXSE'],           years: '2016-2017' },
  { family: 'Softail Evo', name: 'SOFTAIL STANDARD',           codes: ['FXST'],           years: '1984-2015' },
  { family: 'Softail Evo', name: 'NIGHT TRAIN',                codes: ['FXSTB'],          years: '1998-2009' },
  { family: 'Softail Evo', name: 'SOFTAIL CUSTOM',             codes: ['FXSTC'],          years: '1986-2010' },
  { family: 'Softail Evo', name: 'SOFTAIL DEUCE',              codes: ['FXSTD'],          years: '2000-2007' },
  { family: 'Softail Evo', name: 'CVO DEUCE',                  codes: ['FXSTDSE'],        years: '2003-2004' },
  { family: 'Softail Evo', name: 'SPRINGER SOFTAIL',           codes: ['FXSTS'],          years: '1988-2006' },
  { family: 'Softail Evo', name: 'BAD BOY',                    codes: ['FXSTSB'],         years: '1995-1997' },
  { family: 'Softail Evo', name: 'CVO SPRINGER SOFTAIL',       codes: ['FXSTSSE'],        years: '2007-2009' },

  // ── Touring ──
  { family: 'Touring', name: 'ROAD KING',                        codes: ['FLHR'],           years: '1994-2022' },
  { family: 'Touring', name: 'ROAD KING CLASSIC',                codes: ['FLHRC'],          years: '1998-2019' },
  { family: 'Touring', name: 'ROAD KING CUSTOM',                 codes: ['FLHRS'],          years: '2004-2007' },
  { family: 'Touring', name: 'ROAD KING SPECIAL',                codes: ['FLHRXS'],         years: '2017-2025' },
  { family: 'Touring', name: 'CVO ROAD KING',                    codes: ['FLHRSE'],         years: '2002-2014' },
  { family: 'Touring', name: 'ELECTRA GLIDE',                    codes: ['FLH'],            years: '1984-1985' },
  { family: 'Touring', name: 'ELECTRA GLIDE SPECIAL',            codes: ['FLHX'],           years: '1984-1985' },
  { family: 'Touring', name: 'ELECTRA GLIDE SPORT',              codes: ['FLHS'],           years: '1984-1993' },
  { family: 'Touring', name: 'ELECTRA GLIDE STANDARD',           codes: ['FLHT'],           years: '1986-2022' },
  { family: 'Touring', name: 'ELECTRA GLIDE CLASSIC',            codes: ['FLHTC'],          years: '1984-2013' },
  { family: 'Touring', name: 'CVO ELECTRA GLIDE',                codes: ['FLHTCSE'],        years: '2004-2005' },
  { family: 'Touring', name: 'ULTRA CLASSIC ELECTRA GLIDE',      codes: ['FLHTCU'],         years: '1989-2019' },
  { family: 'Touring', name: 'ULTRA CLASSIC TWIN-COOLED',        codes: ['FLHTCUTC'],       years: '2014-2019' },
  { family: 'Touring', name: 'ULTRA CLASSIC LOW',                codes: ['FLHTCUL'],        years: '2015-2016' },
  { family: 'Touring', name: 'CVO ULTRA CLASSIC',                codes: ['FLHTCUSE'],       years: '2006-2013' },
  { family: 'Touring', name: 'STREET GLIDE',                     codes: ['FLHX'],           years: '2006-2026' },
  { family: 'Touring', name: 'STREET GLIDE LIMITED',             codes: ['FLHXL'],          years: '2026-2026' },
  { family: 'Touring', name: 'STREET GLIDE SPECIAL',             codes: ['FLHXS'],          years: '2014-2023' },
  { family: 'Touring', name: 'STREET GLIDE ST',                  codes: ['FLHXST'],         years: '2022-2023' },
  { family: 'Touring', name: 'CVO STREET GLIDE',                 codes: ['FLHXSE'],         years: '2010-2026' },
  { family: 'Touring', name: 'CVO STREET GLIDE LIMITED',         codes: ['FLHXLSE'],        years: '2026-2026' },
  { family: 'Touring', name: 'CVO STREET GLIDE ST',              codes: ['FLHXSTSE'],       years: '2026-2026' },
  { family: 'Touring', name: 'ULTRA LIMITED',                    codes: ['FLHTK'],          years: '2010-2024' },
  { family: 'Touring', name: 'ULTRA LIMITED LOW',                codes: ['FLHTKL'],         years: '2015-2019' },
  { family: 'Touring', name: 'CVO LIMITED',                      codes: ['FLHTKSE'],        years: '2014-2021' },
  { family: 'Touring', name: 'TOUR GLIDE CLASSIC',               codes: ['FLTC'],           years: '1984-1991' },
  { family: 'Touring', name: 'ULTRA CLASSIC TOUR GLIDE',         codes: ['FLTCU'],          years: '1989-1996' },
  { family: 'Touring', name: 'ROAD GLIDE',                       codes: ['FLTR','FLTRX'],   years: '1998-2026' },
  { family: 'Touring', name: 'CVO ROAD GLIDE',                   codes: ['FLTRSE','FLTRXSE'], years: '2000-2026' },
  { family: 'Touring', name: 'ROAD GLIDE ULTRA',                 codes: ['FLTRU'],          years: '2011-2019' },
  { family: 'Touring', name: 'CVO ROAD GLIDE ULTRA',             codes: ['FLTRUSE'],        years: '2011-2016' },
  { family: 'Touring', name: 'CVO ROAD GLIDE LIMITED',           codes: ['FLTRKSE'],        years: '2022-2023' },
  { family: 'Touring', name: 'ROAD GLIDE CUSTOM',                codes: ['FLTRX'],          years: '2010-2013' },
  { family: 'Touring', name: 'ROAD GLIDE SPECIAL',               codes: ['FLTRXS'],         years: '2015-2023' },
  { family: 'Touring', name: 'ROAD GLIDE ST',                    codes: ['FLTRXST'],        years: '2022-2023' },
  { family: 'Touring', name: 'CVO ROAD GLIDE ST',                codes: ['FLTRXSTSE'],      years: '2024-2026' },
  { family: 'Touring', name: 'ROAD GLIDE LIMITED',               codes: ['FLTRK'],          years: '2020-2026' },
  { family: 'Touring', name: 'CVO ROAD GLIDE CUSTOM',            codes: ['FLTRXSE'],        years: '2012-2018' },

  // ── Trike ──
  { family: 'Trike', name: 'TRI GLIDE ULTRA',           codes: ['FLHTCUTG'],   years: '2009-2025' },
  { family: 'Trike', name: 'CVO TRI GLIDE',             codes: ['FLHTCUTGSE'], years: '2020-2022' },
  { family: 'Trike', name: 'STREET GLIDE TRIKE',        codes: ['FLHXXX'],     years: '2010-2011' },
  { family: 'Trike', name: 'FREEWHEELER',               codes: ['FLRT'],       years: '2015-2025' },
  { family: 'Trike', name: 'ROAD GLIDE 3',              codes: ['FLTRT'],      years: '2023-2026' },
  { family: 'Trike', name: 'STREET GLIDE 3 LIMITED',    codes: ['FLHLT'],      years: '2026-2026' },
  { family: 'Trike', name: 'CVO STREET GLIDE 3 LIMITED',codes: ['FLHLTSE'],    years: '2026-2026' },
];

// Derive family year ranges from models
function familyRange(familyName) {
  const models = RAW_MODELS.filter(m => m.family === familyName);
  const [startStrs, endStrs] = [[], []];
  for (const m of models) {
    const [s, e] = m.years.split('-').map(Number);
    startStrs.push(s); endStrs.push(e);
  }
  return [Math.min(...startStrs), Math.max(...endStrs)];
}

const FAMILIES = [...new Set(RAW_MODELS.map(m => m.family))].map(name => {
  const [start_year, end_year] = familyRange(name);
  return { name, start_year, end_year };
});

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    console.log('\n[Phase1] Creating canonical Harley vehicle tables...');
    await client.query('BEGIN');

    // ── Phase 1: Create tables ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS harley_families (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        start_year INT  NOT NULL,
        end_year   INT  NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS harley_models (
        id         SERIAL PRIMARY KEY,
        family_id  INT  NOT NULL REFERENCES harley_families(id) ON DELETE CASCADE,
        model_code TEXT NOT NULL,
        name       TEXT NOT NULL,
        start_year INT  NOT NULL,
        end_year   INT  NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        UNIQUE(model_code)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS harley_model_years (
        id       SERIAL PRIMARY KEY,
        model_id INT NOT NULL REFERENCES harley_models(id) ON DELETE CASCADE,
        year     INT NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        UNIQUE(model_id, year)
      )
    `);
    await client.query('COMMIT');
    console.log('[Phase1] ✓ Tables created (harley_families, harley_models, harley_model_years)');

    // ── Phase 2.1: Seed families ──
    console.log('\n[Phase2] Seeding families...');
    let t = Date.now();
    for (let i = 0; i < FAMILIES.length; i++) {
      const f = FAMILIES[i];
      await client.query(`
        INSERT INTO harley_families (name, start_year, end_year)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO UPDATE
          SET start_year = LEAST(harley_families.start_year, EXCLUDED.start_year),
              end_year   = GREATEST(harley_families.end_year, EXCLUDED.end_year)
      `, [f.name, f.start_year, f.end_year]);
      progress('Phase2-Families', i + 1, FAMILIES.length, t);
    }
    done('Phase2-Families', `${FAMILIES.length} families seeded`);

    // ── Phase 2.2: Seed models ──
    console.log('[Phase2] Seeding models...');
    t = Date.now();

    // Expand RAW_MODELS — one row per model_code
    const modelRows = [];
    for (const m of RAW_MODELS) {
      const [start_year, end_year] = m.years.split('-').map(Number);
      for (const code of m.codes) {
        modelRows.push({ family: m.family, name: m.name, code, start_year, end_year });
      }
    }

    let modelCount = 0;
    for (let i = 0; i < modelRows.length; i++) {
      const m = modelRows[i];
      const { rows: [fam] } = await client.query(
        `SELECT id FROM harley_families WHERE name = $1`, [m.family]
      );
      if (!fam) { console.warn(`\n  ⚠ Family not found: ${m.family}`); continue; }

      await client.query(`
        INSERT INTO harley_models (family_id, model_code, name, start_year, end_year)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (model_code) DO UPDATE
          SET name       = EXCLUDED.name,
              start_year = EXCLUDED.start_year,
              end_year   = EXCLUDED.end_year
      `, [fam.id, m.code, m.name, m.start_year, m.end_year]);
      modelCount++;
      progress('Phase2-Models', i + 1, modelRows.length, t, ` models: ${modelCount}`);
    }
    done('Phase2-Models', `${modelCount} model codes seeded`);

    // ── Phase 2.3: Explode model years ──
    console.log('[Phase2] Exploding model years...');
    t = Date.now();

    const { rows: allModels } = await client.query(
      `SELECT id, model_code, start_year, end_year FROM harley_models ORDER BY id`
    );

    let yearCount = 0;
    for (let i = 0; i < allModels.length; i++) {
      const m = allModels[i];
      await client.query(`
        INSERT INTO harley_model_years (model_id, year)
        SELECT $1, y
        FROM GENERATE_SERIES($2, $3) y
        ON CONFLICT (model_id, year) DO NOTHING
      `, [m.id, m.start_year, m.end_year]);
      yearCount += (m.end_year - m.start_year + 1);
      progress('Phase2-Years', i + 1, allModels.length, t, ` ~${yearCount} year rows`);
    }
    done('Phase2-Years', `~${yearCount} model-year rows exploded`);

    // ── Summary ──
    const { rows: [summary] } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM harley_families)    AS families,
        (SELECT COUNT(*) FROM harley_models)       AS models,
        (SELECT COUNT(*) FROM harley_model_years)  AS model_years
    `);
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║   PHASE 1+2 COMPLETE                 ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  Families:    ${String(summary.families).padEnd(22)} ║`);
    console.log(`║  Models:      ${String(summary.models).padEnd(22)} ║`);
    console.log(`║  Model Years: ${String(summary.model_years).padEnd(22)} ║`);
    console.log('╚══════════════════════════════════════╝');
    console.log('\nNext: run phase3_fitment_v2_table.js\n');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n[ERROR]', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

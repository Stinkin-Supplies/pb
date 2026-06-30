#!/usr/bin/env node
/**
 * build_oem_fitment_all.mjs
 *
 * Unified OEM fitment builder — all HD catalog families.
 * Replaces the per-family scripts (sportster / dyna / softail / touring / fx).
 *
 * Fixes vs. the old per-family scripts:
 *   • MODEL_BARE_RE now covers ALL HD model prefixes (FL, FX, XL, XLH, XR)
 *     so Dyna/Softail/Touring/FX model codes are actually extracted.
 *   • --skip-existing checks oem_fitment for already-loaded catalog_file
 *     so re-running is safe without --reset.
 *   • Single manifest, deduped (no duplicate PDFs ingested twice).
 *
 * Usage:
 *   node build_oem_fitment_all.mjs                    # ingest all missing catalogs
 *   node build_oem_fitment_all.mjs --dry-run          # extract + print, skip DB
 *   node build_oem_fitment_all.mjs --family sportster # one family only
 *   node build_oem_fitment_all.mjs --match-only       # skip extract, just (re)match
 *   node build_oem_fitment_all.mjs --force            # re-ingest even already-loaded
 *
 * Available --family values:
 *   sportster  dyna  softail  touring  fx  fxr  all_model  police  vintage
 */

import pg      from 'pg';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';
import { execSync }      from 'child_process';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── DB config ─────────────────────────────────────────────────────────────────
const DB_CONFIG = {
  host:     '5.161.100.126',
  port:     5432,
  user:     'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
};

const BASE = '/Users/home/Desktop/Stanky/parts-catalogs';

// ── Complete catalog manifest ─────────────────────────────────────────────────
// family — used for --family filter
// ys/ye  — catalog year range
// dir    — subfolder under BASE
// file   — exact PDF filename
//
// Duplicates intentionally excluded:
//   1971-1984 FX.pdf / 1971-1984-fx.pdf / FX-Model-1971-1984.pdf  → same content as 1971-84 FX Parts Catalog.pdf
//   1986-90 XLH Parts Catalog.pdf                                  → same as 1986-1990-XL.pdf
//   2002 XLH Parts Catalog.pdf / 2004-xl.pdf / 2016-xl.pdf        → superseded by the named catalog versions
//   2021 Touring Models Parts Catalog.pdf                          → same as 2021-touring.pdf
//   1991-1992 Dyna.pdf                                             → same as 1991-92 Dyna Models Parts Catalog.pdf
//   1993-1994 softail.pdf                                          → same as 1993-94 Softail Models Parts Catalog.pdf
//   500148179-Harley-Davidson-1954-78-HD-XLH-XLCH-1000-Parts-Catalog.pdf → same as 1954-78 XL1000 Parts Catalog.pdf
const CATALOGS = [
  // ── Vintage / pre-family ─────────────────────────────────────────────────
  { family: 'vintage', ys: 1942, ye: 1945, dir: '',         file: '1942 WLA Parts List.pdf' },
  { family: 'vintage', ys: 1950, ye: 1950, dir: '',         file: '1950 Spare Parts catalog.pdf' },
  { family: 'vintage', ys: 1972, ye: 1989, dir: '',         file: '1972 89 XR750 Parts Catalog.pdf' },

  // ── Early Sportster (pre-1986) ────────────────────────────────────────────
  { family: 'sportster', ys: 1954, ye: 1976, dir: 'Sportster', file: '1954-76 XLH-XLCH-1000.pdf' },
  { family: 'sportster', ys: 1954, ye: 1978, dir: 'Sportster', file: '1954-78 XL1000 Parts Catalog.pdf' },
  { family: 'sportster', ys: 1970, ye: 1970, dir: 'Sportster', file: '1970 Sportster XR-XLR Parts Catalog.pdf' },

  // ── Sportster 1986–2022 ───────────────────────────────────────────────────
  { family: 'sportster', ys: 1986, ye: 1990, dir: 'Sportster', file: '1986-1990-XL.pdf' },
  { family: 'sportster', ys: 1991, ye: 1992, dir: 'Sportster', file: '1991-1992 XL.pdf' },
  { family: 'sportster', ys: 1993, ye: 1994, dir: 'Sportster', file: '1993-1994-xl.pdf' },
  { family: 'sportster', ys: 1995, ye: 1996, dir: 'Sportster', file: '1995-1996-xl.pdf' },
  { family: 'sportster', ys: 1997, ye: 1997, dir: 'Sportster', file: '1997-xl.pdf' },
  { family: 'sportster', ys: 1998, ye: 1998, dir: 'Sportster', file: '1998-xl.pdf' },
  { family: 'sportster', ys: 1999, ye: 1999, dir: 'Sportster', file: '1999-xl.pdf' },
  { family: 'sportster', ys: 2000, ye: 2000, dir: 'Sportster', file: '2000-xl.pdf' },
  { family: 'sportster', ys: 2001, ye: 2001, dir: 'Sportster', file: '2001-xl.pdf' },
  { family: 'sportster', ys: 2002, ye: 2002, dir: 'Sportster', file: '2002-xl.pdf' },
  { family: 'sportster', ys: 2003, ye: 2003, dir: 'Sportster', file: '2003-xl.pdf' },
  { family: 'sportster', ys: 2004, ye: 2004, dir: 'Sportster', file: '2004 Sportster Models Parts Catalog.pdf' },
  { family: 'sportster', ys: 2005, ye: 2005, dir: 'Sportster', file: '2005-xl.pdf' },
  { family: 'sportster', ys: 2006, ye: 2006, dir: 'Sportster', file: '2006-xl.pdf' },
  { family: 'sportster', ys: 2007, ye: 2007, dir: 'Sportster', file: '2007-xl.pdf' },
  { family: 'sportster', ys: 2008, ye: 2008, dir: 'Sportster', file: '2008-xl.pdf' },
  { family: 'sportster', ys: 2009, ye: 2009, dir: 'Sportster', file: '2009-xl.pdf' },
  { family: 'sportster', ys: 2010, ye: 2010, dir: 'Sportster', file: '2010-xl.pdf' },
  { family: 'sportster', ys: 2011, ye: 2011, dir: 'Sportster', file: '2011-xl.pdf' },
  { family: 'sportster', ys: 2012, ye: 2012, dir: 'Sportster', file: '2012-xl.pdf' },
  { family: 'sportster', ys: 2013, ye: 2013, dir: 'Sportster', file: '2013-xl.pdf' },
  { family: 'sportster', ys: 2014, ye: 2014, dir: 'Sportster', file: '2014-xl.pdf' },
  { family: 'sportster', ys: 2015, ye: 2015, dir: 'Sportster', file: '2015-xl.pdf' },
  { family: 'sportster', ys: 2016, ye: 2016, dir: 'Sportster', file: '2016 Sportster Models Part Catalog.pdf' },
  { family: 'sportster', ys: 2017, ye: 2017, dir: 'Sportster', file: '2017-xl.pdf' },
  { family: 'sportster', ys: 2018, ye: 2018, dir: 'Sportster', file: '2018-xl.pdf' },
  { family: 'sportster', ys: 2019, ye: 2019, dir: 'Sportster', file: '2019-xl.pdf' },
  { family: 'sportster', ys: 2020, ye: 2020, dir: 'Sportster', file: '2020-xl.pdf' },
  { family: 'sportster', ys: 2021, ye: 2021, dir: 'Sportster', file: '2021-xl.pdf' },
  { family: 'sportster', ys: 2022, ye: 2022, dir: 'Sportster', file: '2022-xl.pdf' },

  // ── Dyna ──────────────────────────────────────────────────────────────────
  { family: 'dyna', ys: 1991, ye: 1992, dir: 'Dyna', file: '1991-92 Dyna Models Parts Catalog.pdf' },
  { family: 'dyna', ys: 1993, ye: 1994, dir: 'Dyna', file: '1993-1994 Dyna .pdf' },
  { family: 'dyna', ys: 1995, ye: 1996, dir: 'Touring', file: '1995-1996 dyna.pdf' },
  { family: 'dyna', ys: 1997, ye: 1997, dir: 'Touring', file: '1997 dyna.pdf' },
  { family: 'dyna', ys: 1998, ye: 1998, dir: 'Dyna', file: '1998 Dyna Models Parts Catalog.pdf' },
  { family: 'dyna', ys: 1999, ye: 1999, dir: 'Dyna', file: '1999-dyna.pdf' },
  { family: 'dyna', ys: 2000, ye: 2000, dir: 'Dyna', file: '2000-dyna.pdf' },
  { family: 'dyna', ys: 2001, ye: 2001, dir: 'Dyna', file: '2001-dyna.pdf' },
  { family: 'dyna', ys: 2002, ye: 2002, dir: 'Dyna', file: '2002 DYNa.pdf' },
  { family: 'dyna', ys: 2003, ye: 2003, dir: 'Dyna', file: '2003 dyna.pdf' },
  { family: 'dyna', ys: 2004, ye: 2004, dir: 'Dyna', file: '2004 dyna.pdf' },
  { family: 'dyna', ys: 2005, ye: 2005, dir: 'Dyna', file: '2005 dyna.pdf' },
  { family: 'dyna', ys: 2006, ye: 2006, dir: 'Dyna', file: '2006-dyna.pdf' },
  { family: 'dyna', ys: 2007, ye: 2007, dir: 'Dyna', file: '2007 dyna.pdf' },
  { family: 'dyna', ys: 2008, ye: 2008, dir: 'Dyna', file: '2008 dyna.pdf' },
  { family: 'dyna', ys: 2009, ye: 2009, dir: 'Dyna', file: 'Dyna-Models-2009.pdf' },
  { family: 'dyna', ys: 2010, ye: 2010, dir: 'Dyna', file: '2010 dyna.pdf' },
  { family: 'dyna', ys: 2011, ye: 2011, dir: 'Dyna', file: '2011-dyna.pdf' },
  { family: 'dyna', ys: 2012, ye: 2012, dir: 'Dyna', file: '2012 dyna.pdf' },
  { family: 'dyna', ys: 2013, ye: 2013, dir: 'Dyna', file: '2013 dyna.pdf' },
  { family: 'dyna', ys: 2014, ye: 2014, dir: 'Dyna', file: '2014 dyna.pdf' },
  { family: 'dyna', ys: 2015, ye: 2015, dir: 'Dyna', file: '2015 dyna.pdf' },
  { family: 'dyna', ys: 2016, ye: 2016, dir: 'Dyna', file: '2016 dyna.pdf' },
  { family: 'dyna', ys: 2017, ye: 2017, dir: 'Dyna', file: '2017 dyna.pdf' },

  // ── Softail ───────────────────────────────────────────────────────────────
  { family: 'softail', ys: 1987, ye: 1990, dir: 'Softail', file: '1987-1990 softail.pdf' },
  { family: 'softail', ys: 1991, ye: 1992, dir: 'Softail', file: '1991-1992 softail.pdf' },
  { family: 'softail', ys: 1993, ye: 1994, dir: 'Softail', file: '1993-94 Softail Models Parts Catalog.pdf' },
  { family: 'softail', ys: 1995, ye: 1996, dir: 'Softail', file: '1995-96 Softail Models Parts Catalog.pdf' },
  { family: 'softail', ys: 1997, ye: 1997, dir: 'Softail', file: '1997 Softail Models Parts Catalog.pdf' },
  { family: 'softail', ys: 1998, ye: 1998, dir: 'Softail', file: '1998 SOFTAIL .pdf' },
  { family: 'softail', ys: 1999, ye: 1999, dir: 'Softail', file: '1999 Softail Models Parts Catalog.pdf' },
  { family: 'softail', ys: 2000, ye: 2000, dir: 'Softail', file: '2000 Softail Models Parts Catalog.pdf' },
  { family: 'softail', ys: 2001, ye: 2001, dir: 'Softail', file: '2001 Softail Models Parts Catalog.pdf' },
  { family: 'softail', ys: 2002, ye: 2002, dir: 'Softail', file: '2002 Softail Parts Catalog.pdf' },
  { family: 'softail', ys: 2003, ye: 2003, dir: 'Softail', file: '2003 Softail Models Parts Catalog.pdf' },
  { family: 'softail', ys: 2004, ye: 2004, dir: 'Softail', file: '2004 softail.pdf' },
  { family: 'softail', ys: 2005, ye: 2005, dir: 'Softail', file: '2005 softail.pdf' },
  { family: 'softail', ys: 2006, ye: 2006, dir: 'Softail', file: '2006 softail.pdf' },
  { family: 'softail', ys: 2007, ye: 2007, dir: 'Softail', file: '2007 softail.pdf' },
  { family: 'softail', ys: 2008, ye: 2008, dir: 'Softail', file: '2008 softail.pdf' },
  { family: 'softail', ys: 2009, ye: 2009, dir: 'Softail', file: '2009 softail.pdf' },
  { family: 'softail', ys: 2010, ye: 2010, dir: 'Softail', file: '2010 softail.pdf' },
  { family: 'softail', ys: 2011, ye: 2011, dir: 'Softail', file: '2011 softail.pdf' },
  { family: 'softail', ys: 2012, ye: 2012, dir: 'Softail', file: '2012 softail.pdf' },
  { family: 'softail', ys: 2013, ye: 2013, dir: 'Softail', file: '2013 SOFTAIL .pdf' },
  { family: 'softail', ys: 2014, ye: 2014, dir: 'Softail', file: '2014 SOFTAIL .pdf' },
  { family: 'softail', ys: 2015, ye: 2015, dir: 'Softail', file: '2015 SOFTAIL.pdf' },
  { family: 'softail', ys: 2017, ye: 2017, dir: 'Softail', file: '2017 softail.pdf' },
  // 2018+ = new Milwaukee-8 Softail platform (FXBB, FLSL, FXLR, FXST, FLSB, etc.)
  { family: 'softail', ys: 2018, ye: 2018, dir: 'Softail', file: '2018 SOFTAIL .pdf' },
  { family: 'softail', ys: 2019, ye: 2019, dir: 'Softail', file: '2019 SOFTAIL .pdf' },
  { family: 'softail', ys: 2025, ye: 2025, dir: 'Softail', file: '2025 SOFTAIL.pdf' },
  { family: 'softail', ys: 2026, ye: 2026, dir: 'Softail', file: '2026 SOFTAIL .pdf' },

  // ── Touring ───────────────────────────────────────────────────────────────
  { family: 'touring', ys: 1991, ye: 1992, dir: 'Touring', file: '1991-1992-touring.pdf' },
  { family: 'touring', ys: 1993, ye: 1994, dir: 'Touring', file: '1993-1994-touring.pdf' },
  { family: 'touring', ys: 1995, ye: 1996, dir: 'Touring', file: '1995-1996-touring.pdf' },
  { family: 'touring', ys: 1997, ye: 1997, dir: 'Touring', file: '1997-touring.pdf' },
  { family: 'touring', ys: 1998, ye: 1998, dir: 'Touring', file: '1998-touring.pdf' },
  { family: 'touring', ys: 1999, ye: 1999, dir: 'Touring', file: '1999 touring.pdf' },
  { family: 'touring', ys: 2000, ye: 2000, dir: 'Touring', file: '2000-touring.pdf' },
  { family: 'touring', ys: 2001, ye: 2001, dir: 'Touring', file: '2001 touring.pdf' },
  { family: 'touring', ys: 2002, ye: 2002, dir: 'Touring', file: '2002-touring.pdf' },
  { family: 'touring', ys: 2003, ye: 2003, dir: 'Touring', file: '2003-touring.pdf' },
  { family: 'touring', ys: 2004, ye: 2004, dir: 'Touring', file: '2004-touring.pdf' },
  { family: 'touring', ys: 2005, ye: 2005, dir: 'Touring', file: '2005-touring.pdf' },
  { family: 'touring', ys: 2006, ye: 2006, dir: 'Touring', file: '2006-touring.pdf' },
  { family: 'touring', ys: 2007, ye: 2007, dir: 'Touring', file: '2007 .pdf' },
  { family: 'touring', ys: 2008, ye: 2008, dir: 'Touring', file: '2008 touring.pdf' },
  { family: 'touring', ys: 2009, ye: 2009, dir: 'Touring', file: '2009-touring.pdf' },
  { family: 'touring', ys: 2010, ye: 2010, dir: 'Touring', file: '2010 touring.pdf' },
  { family: 'touring', ys: 2011, ye: 2011, dir: 'Touring', file: '2011-touring.pdf' },
  { family: 'touring', ys: 2012, ye: 2012, dir: 'Touring', file: '2012-touring.pdf' },
  { family: 'touring', ys: 2013, ye: 2013, dir: 'Touring', file: '2013-touring.pdf' },
  { family: 'touring', ys: 2014, ye: 2014, dir: 'Touring', file: '2014 touring.pdf' },
  { family: 'touring', ys: 2015, ye: 2015, dir: 'Touring', file: '2015 touring.pdf' },
  { family: 'touring', ys: 2016, ye: 2016, dir: 'Touring', file: '2016-touring.pdf' },
  { family: 'touring', ys: 2017, ye: 2017, dir: 'Touring', file: '2017-touring.pdf' },
  { family: 'touring', ys: 2018, ye: 2018, dir: 'Touring', file: '2018-touring.pdf' },
  { family: 'touring', ys: 2019, ye: 2019, dir: 'Touring', file: '2019-touring.pdf' },
  { family: 'touring', ys: 2020, ye: 2020, dir: 'Touring', file: '2020-touring.pdf' },
  { family: 'touring', ys: 2021, ye: 2021, dir: 'Touring', file: '2021-touring.pdf' },
  { family: 'touring', ys: 2022, ye: 2022, dir: 'Touring', file: '2022-touring.pdf' },
  { family: 'touring', ys: 2023, ye: 2023, dir: 'Touring', file: '2023-touring.pdf' },
  { family: 'touring', ys: 2023, ye: 2023, dir: 'Touring', file: 'Touring-FLHXSE-2023.pdf' },

  // ── FX / SuperGlide ───────────────────────────────────────────────────────
  { family: 'fx', ys: 1971, ye: 1980, dir: 'FX', file: '1971-80 FX - SuperGlide Parts Catalog.pdf' },
  { family: 'fx', ys: 1971, ye: 1984, dir: 'FX', file: '1971-84 FX Parts Catalog.pdf' },
  { family: 'fx', ys: 1980, ye: 1980, dir: 'FX', file: '1980 FXWG-80 Parts Catalog Supplement.pdf' },
  { family: 'fx', ys: 1984, ye: 1986, dir: 'FX', file: '1984-86 FX-FXST Parts Catalog.pdf' },

  // ── FXR ───────────────────────────────────────────────────────────────────
  { family: 'fxr', ys: 1984, ye: 1986, dir: 'FXR', file: '1984-86 FXR Parts Catalog.pdf' },
  { family: 'fxr', ys: 1991, ye: 1992, dir: 'Dyna', file: '1991-1992 HARLEY-DAVIDSON® PARTS CATALOG_ FXR MODELS _ H-D Service Information Portal.pdf' },

  // ── All-Model (1340cc era) ────────────────────────────────────────────────
  { family: 'all_model', ys: 1987, ye: 1990, dir: 'All Model', file: '1987-90 All 1340cc Models Parts Catalog.pdf' },
  { family: 'all_model', ys: 1991, ye: 1992, dir: 'All Model', file: '1991-92 All Model Parts Catalog.pdf' },
  { family: 'all_model', ys: 1993, ye: 1994, dir: 'All Model', file: '1993-94 All Model Parts Catalog Parts.pdf' },
  { family: 'all_model', ys: 1995, ye: 1996, dir: 'All Model', file: '1995-96 All 1340cc Parts Catalog.pdf' },

  // ── Police ────────────────────────────────────────────────────────────────
  { family: 'police', ys: 1993, ye: 1994, dir: 'Police', file: '1993-1994 FLHTP FXRP.pdf' },
  { family: 'police', ys: 1999, ye: 1999, dir: 'Police', file: '1999 FLT Police Parts Catalog Supplement.pdf' },
];

// ── Python extractor ──────────────────────────────────────────────────────────
const PYTHON_SRC = String.raw`
import sys, json, re, pdfplumber

# ── Model code patterns ────────────────────────────────────────────────────────
#   FL prefix  — touring/softail:   FLHR, FLHTCU, FLSTC, FLST, FLSTF …
#   FX prefix  — dyna/superglide:   FXDWG, FXD, FXDC, FXDL, FXS, FXWG …
#   XL/XLH/XR  — sportster:         XLH883, XL1200C, XR1200 …
#   ALL         — fits all models
MODEL_BARE_RE = re.compile(
    r'^(FL[A-Z0-9]{1,10}|FX[A-Z0-9]{0,10}|XLH?[A-Z0-9]{0,10}|XR[A-Z0-9]{0,10}|ALL)$'
)
MODEL_TOK_RE = re.compile(
    r'^(FL[A-Z0-9]{1,10}|FX[A-Z0-9]{0,10}|XLH?[A-Z0-9]{0,10}|XR[A-Z0-9]{0,10}|ALL),?$'
)

# A pure model-code line: one or more codes (+ optional years), nothing else.
# Used to detect section-context lines and front-matter model listings.
MODEL_LINE_RE = re.compile(
    r'^(?:(?:FL[A-Z0-9]{1,10}|FX[A-Z0-9]{0,10}|XLH?[A-Z0-9]{0,10}|XR[A-Z0-9]{0,10}|ALL)'
    r'(?:\s*[-/,]\s*|\s+))*'
    r'(?:FL[A-Z0-9]{1,10}|FX[A-Z0-9]{0,10}|XLH?[A-Z0-9]{0,10}|XR[A-Z0-9]{0,10}|ALL)'
    r'(?:\s+\d{4}(?:\s*[-–]\s*\d{4})?)?$'
)

# Section header that contains a model code qualifier after a dash/hyphen:
#   "FRONT FORK - FLHR"  /  "ENGINE CASES – FXDWG FXDC"
SECTION_MODEL_RE = re.compile(
    r'[-–]\s*((?:(?:FL[A-Z0-9]{1,10}|FX[A-Z0-9]{0,10}|XLH?[A-Z0-9]{0,10}|XR[A-Z0-9]{0,10})'
    r'(?:\s*[/,]\s*)?)+)\s*(?:MODELS?|ONLY|STYLE)?$',
    re.I
)

PART_ROW_RE  = re.compile(r'^(?:\d+\s+)?([0-9A-Z]{4,10}-[0-9]{2}[A-Z]{0,2})\s+(.+)$')
CONT_RE      = re.compile(
    r'^(?:FL[A-Z0-9]{1,10}|FX[A-Z0-9]{0,10}|XLH?[A-Z0-9]{0,10}|XR[A-Z0-9]{0,10}|ALL)'
    r'[\s,/0-9A-Z]*$'
)
PART_NO_ANY  = re.compile(r'[0-9]{4,10}-[0-9]{2}')
SECTION_SKIP = re.compile(r'^(VIEW|INDEX|PART NO|NO\.|TABLE|POSITION|MARKET|ASSEMBLY|VIN )', re.I)
COLUMN_HDR   = re.compile(r'INDEX.*PART|PART.*DESCRIPTION|NO\.\s+NO\.', re.I)
QTY_RE       = re.compile(r'\(\d+\)\s*$|\(\d+ required\)\s*$|\(use [^)]+\)\s*$')

# English words that happen to match the model code regex — never valid model codes.
MODEL_DENYLIST = {
    'FLYWHEEL', 'FLANGE', 'FLOOR', 'FLOAT', 'FLOW', 'FLEX', 'FLAG', 'FLAT',
    'FLAP', 'FLARE', 'FLASH', 'FLAT', 'FLAIR', 'FLANK', 'FLARE', 'FLEET',
    'FLESH', 'FLEW', 'FLEX', 'FLICK', 'FLIP', 'FLOCK', 'FLOOD', 'FLOP',
    'FLOSS', 'FLUID', 'FLUSH', 'FLUNG', 'FLUTE',
    'FXTURE', 'FXED',  # any other obvious false positives
}

def parse_codes(raw):
    return [
        p.strip().rstrip(',/')
        for p in re.split(r'[,/\s]+', raw.strip())
        if MODEL_TOK_RE.match(p.strip().rstrip(',/'))
        and p.strip().rstrip(',/') not in MODEL_DENYLIST
    ]

def is_section(line):
    if len(line) < 6 or len(line) > 100: return False
    if PART_NO_ANY.search(line): return False
    if COLUMN_HDR.search(line): return False
    if SECTION_SKIP.match(line): return False
    if MODEL_LINE_RE.match(line): return False
    alpha = re.sub(r'[^A-Za-z]', '', line)
    if not alpha or len(alpha) < 4: return False
    upper_ratio = sum(1 for c in alpha if c.isupper()) / len(alpha)
    has_struct   = any(ch in line for ch in [' ', '-', '&', ',', '('])
    return upper_ratio > 0.80 and has_struct

def extract_section_models(section_line):
    """Pull trailing model codes from a section header like 'FRONT FORK - FLHR FLHRC'."""
    m = SECTION_MODEL_RE.search(section_line)
    if m:
        return parse_codes(m.group(1))
    return []

def split_desc_models(rest, catalog_models):
    """
    Split a part row's trailing text into (description, qty_note, models_raw, codes).
    Only accepts tokens that are in the catalog's known model set (if non-empty)
    to avoid grabbing part-number suffixes as model codes.
    """
    tokens = rest.split()
    model_start = len(tokens)
    i = len(tokens) - 1
    while i >= 0:
        tok = tokens[i].rstrip(',/')
        if MODEL_BARE_RE.match(tok) and (not catalog_models or tok in catalog_models or tok == 'ALL'):
            model_start = i
            i -= 1
        elif re.match(r'^\d{4}$', tok) and model_start < len(tokens):
            i -= 1  # year qualifier
        else:
            break
    desc       = ' '.join(tokens[:model_start]).rstrip(',/').strip()
    models_raw = ' '.join(tokens[model_start:]).strip()
    codes      = parse_codes(models_raw)
    qty_note   = None
    qm = QTY_RE.search(desc)
    if qm:
        qty_note = qm.group(0).strip()
        desc = desc[:qm.start()].strip()
    return desc, qty_note, models_raw, codes

# ── Main ───────────────────────────────────────────────────────────────────────
args     = json.loads(sys.argv[1])
pdf_path = args['path']
ys       = args['ys']
ye       = args['ye']
filename = args['filename']

try:
    pdf = pdfplumber.open(pdf_path)
except Exception as e:
    print(json.dumps({'error': str(e), 'rows': []}))
    sys.exit(0)

# ── Pass 1: scan front matter for the catalog's model inventory ───────────────
# HD catalogs list all covered models in the first few pages (title page,
# model index, application table). Collect every model code token seen there
# so we can use it as a whitelist during part extraction.
FRONT_PAGES  = min(8, len(pdf.pages))
catalog_models = set()
for i in range(FRONT_PAGES):
    text = pdf.pages[i].extract_text()
    if not text: continue
    for line in text.split('\n'):
        line = line.strip()
        if not line or PART_NO_ANY.search(line): continue
        for tok in re.split(r'[,/\s]+', line):
            tok = tok.strip().rstrip(',/')
            if MODEL_BARE_RE.match(tok) and tok != 'ALL':
                catalog_models.add(tok)

# ── Pass 2: extract part rows ─────────────────────────────────────────────────
rows           = []
section        = 'UNKNOWN'
# Initialize section_models to ALL catalog models so that parts appearing
# before any model-specific section header (common/universal parts) inherit
# "fits all models in this catalog". A model-code context line overrides this.
section_models = list(catalog_models) if catalog_models else []
last_row       = None

for i, page in enumerate(pdf.pages):
    text = page.extract_text()
    if not text: continue
    for line in text.split('\n'):
        line = line.strip()
        if not line: continue

        # Pure model-code line between parts — sets section-level context.
        # e.g. a page header "FXDWG FXDC FXD" before the part table.
        # Guard: every code must be in the catalog's known model inventory
        # (when non-empty) to avoid false positives like "FLYWHEEL".
        if MODEL_LINE_RE.match(line) and not PART_ROW_RE.match(line):
            codes = parse_codes(line)
            if codes:
                valid = (not catalog_models) or all(c in catalog_models or c == 'ALL' for c in codes)
                if valid:
                    if last_row:
                        rows.append(last_row)
                        last_row = None
                    section_models = codes
            continue

        if is_section(line):
            if last_row:
                rows.append(last_row)
                last_row = None
            section = line
            # Section headers sometimes name the models they cover:
            # "FRONT FORK - FLHR FLHRC"  →  section_models = [FLHR, FLHRC]
            sm = extract_section_models(line)
            if sm:
                section_models = sm
            # Don't reset section_models on a plain section header —
            # it often stays valid across several sub-sections.
            continue

        # Continuation line appends model codes to the previous part row.
        if last_row is not None and CONT_RE.match(line):
            extra = parse_codes(line)
            if extra:
                last_row['model_codes'].extend(extra)
                last_row['models_raw'] += ' ' + line
                if 'ALL' in last_row['model_codes']:
                    last_row['model_codes']     = ['ALL']
                    last_row['fits_all_models'] = True
            continue

        m = PART_ROW_RE.match(line)
        if m:
            if last_row:
                rows.append(last_row)
            desc, qty_note, models_raw, codes = split_desc_models(m.group(2), catalog_models)
            # Skip year-annotation rows — these are catalog supersession footnotes
            # like "45902-00  2000" where "2000" is a year note, not a description.
            # They bleed into wrong sections and produce completely wrong fitment.
            if re.match(r'^\d{4}$', desc.strip()):
                last_row = None
                continue
            # If no explicit model codes on the row, inherit the section context.
            if not codes and section_models:
                codes      = list(section_models)
                models_raw = ' '.join(codes) + ' (section)'
            fits_all = 'ALL' in codes
            if fits_all: codes = ['ALL']
            last_row = {
                'catalog_year_start': ys,
                'catalog_year_end':   ye,
                'catalog_file':       filename,
                'page_number':        i + 1,
                'section':            section,
                'oem_part_no':        m.group(1),
                'description':        desc,
                'qty_note':           qty_note,
                'models_raw':         models_raw,
                'model_codes':        codes,
                'fits_all_models':    fits_all,
            }
        else:
            if last_row:
                rows.append(last_row)
                last_row = None

if last_row:
    rows.append(last_row)

print(json.dumps({'rows': rows}))
`;

// ── Match queries ─────────────────────────────────────────────────────────────
const MATCH_P1 = `
  UPDATE oem_fitment f
  SET
    matched_product_id = cu.id,
    matched_sku        = cu.sku,
    match_method       = 'oem_numbers_array',
    match_confidence   = 1.000,
    matched_at         = NOW()
  FROM catalog_unified cu
  WHERE f.oem_part_no = ANY(cu.oem_numbers)
    AND f.matched_product_id IS NULL
`;

const MATCH_P2 = `
  UPDATE oem_fitment f
  SET
    matched_product_id = cu.id,
    matched_sku        = cu.sku,
    match_method       = 'oem_crossref',
    match_confidence   = 0.950,
    matched_at         = NOW()
  FROM catalog_oem_crossref x
  JOIN catalog_unified cu ON cu.sku = x.sku
  WHERE f.oem_part_no = x.oem_number
    AND f.matched_product_id IS NULL
`;

// ── Progress bar ──────────────────────────────────────────────────────────────
class Progress {
  constructor(total, label) {
    this.total = total; this.n = 0; this.label = label; this.t0 = Date.now();
  }
  tick(msg = '') {
    this.n++;
    const pct  = Math.round(this.n / this.total * 100);
    const fill = Math.floor(pct / 2);
    const bar  = '█'.repeat(fill) + '░'.repeat(50 - fill);
    const secs = ((Date.now() - this.t0) / 1000).toFixed(1);
    process.stdout.write(`\r${this.label} [${bar}] ${pct}% ${this.n}/${this.total}  ${secs}s  ${msg}`.padEnd(130));
  }
  done() { process.stdout.write('\n'); }
}

// ── Bulk insert ───────────────────────────────────────────────────────────────
async function bulkInsert(pool, rows, catalogFamily) {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch  = rows.slice(i, i + BATCH);
    const vals   = [];
    const params = [];
    let   p      = 1;
    for (const r of batch) {
      vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        r.catalog_year_start, r.catalog_year_end, r.catalog_file,
        r.page_number, r.section,
        r.oem_part_no, r.description, r.qty_note,
        r.models_raw, r.model_codes, r.fits_all_models,
        catalogFamily
      );
    }
    await pool.query(`
      INSERT INTO oem_fitment
        (catalog_year_start, catalog_year_end, catalog_file,
         page_number, section,
         oem_part_no, description, qty_note,
         models_raw, model_codes, fits_all_models, catalog_family)
      VALUES ${vals.join(',')}
    `, params);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv      = process.argv.slice(2);
  const DRY       = argv.includes('--dry-run');
  const MATCHONLY = argv.includes('--match-only');
  const FORCE     = argv.includes('--force');   // re-ingest already-loaded files
  const familyIdx = argv.findIndex(a => a === '--family');
  const FAMILY    = familyIdx >= 0 ? argv[familyIdx + 1] : null;

  console.log('\n🏍️  HD OEM Fitment Builder — ALL FAMILIES');
  console.log('══════════════════════════════════════════════\n');

  const pyPath = path.join(__dirname, '_oem_extractor_all.py');
  if (!MATCHONLY) fs.writeFileSync(pyPath, PYTHON_SRC);

  const pool = DRY ? null : new Pool(DB_CONFIG);

  // ── Determine which catalogs are already loaded ─────────────────────────────
  let alreadyLoaded = new Set();
  if (!DRY && !MATCHONLY && !FORCE) {
    const { rows } = await pool.query(`SELECT DISTINCT catalog_file FROM oem_fitment`);
    alreadyLoaded = new Set(rows.map(r => r.catalog_file));
    console.log(`  ↳ ${alreadyLoaded.size} catalogs already in oem_fitment (use --force to re-ingest)\n`);
  }

  // ── Filter catalog list ─────────────────────────────────────────────────────
  let catalogs = CATALOGS;
  if (FAMILY) {
    catalogs = catalogs.filter(c => c.family === FAMILY);
    if (!catalogs.length) {
      console.error(`No catalogs found for --family ${FAMILY}`);
      console.error(`Valid: ${[...new Set(CATALOGS.map(c => c.family))].join(', ')}`);
      process.exit(1);
    }
  }

  // ── Extract + load ──────────────────────────────────────────────────────────
  if (!MATCHONLY) {
    const toRun  = catalogs.filter(c => FORCE || !alreadyLoaded.has(c.file));
    const skip   = catalogs.length - toRun.length;

    if (skip > 0) console.log(`  ↳ Skipping ${skip} already-loaded catalogs\n`);
    if (toRun.length === 0) {
      console.log('  ✓ Nothing new to extract.\n');
    } else {
      let totalRows = 0;
      const prog = new Progress(toRun.length, '▸ Catalogs');

      for (const cat of toRun) {
        const pdfPath = path.join(BASE, cat.dir, cat.file);
        if (!fs.existsSync(pdfPath)) {
          prog.tick(`MISSING: ${cat.file}`);
          continue;
        }

        let result;
        try {
          const argStr = JSON.stringify({ path: pdfPath, ys: cat.ys, ye: cat.ye, filename: cat.file });
          const out = execSync(`/usr/bin/python3 ${pyPath} '${argStr.replace(/'/g, "'\\''")}'`, {
            timeout: 300_000,
            maxBuffer: 80 * 1024 * 1024,
            env: process.env,
          });
          result = JSON.parse(out.toString());
        } catch (e) {
          prog.tick(`ERR: ${cat.file}: ${e.message.slice(0, 60)}`);
          continue;
        }

        if (result.error) {
          prog.tick(`ERR: ${cat.file}: ${result.error.slice(0, 60)}`);
          continue;
        }

        const rows = result.rows ?? [];
        totalRows += rows.length;

        if (!DRY) {
          // Always delete existing rows for this catalog before re-inserting
          // so --force produces a clean replacement, not duplicates.
          await pool.query(`DELETE FROM oem_fitment WHERE catalog_file = $1`, [cat.file]);
          if (rows.length > 0) {
            await bulkInsert(pool, rows, cat.family);
          }
        }

        prog.tick(`[${cat.family}] ${cat.ys}–${cat.ye}: ${rows.length} rows${DRY ? ' (dry)' : ''}`);
      }

      prog.done();
      console.log(`\n  ✓ ${totalRows.toLocaleString()} total rows extracted\n`);
    }

    if (fs.existsSync(pyPath)) fs.unlinkSync(pyPath);
  }

  // ── Match ───────────────────────────────────────────────────────────────────
  if (!DRY) {
    console.log('▸ Matching OEM part numbers → catalog_unified...');
    const r1 = await pool.query(MATCH_P1);
    console.log(`  ✓ Pass 1 (oem_numbers[]):  ${r1.rowCount.toLocaleString()} rows matched`);
    const r2 = await pool.query(MATCH_P2);
    console.log(`  ✓ Pass 2 (oem_crossref):   ${r2.rowCount.toLocaleString()} rows matched`);
    console.log(`  ✓ Total: ${(r1.rowCount + r2.rowCount).toLocaleString()}\n`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (!DRY) {
    const { rows: [s] } = await pool.query(`
      SELECT
        COUNT(*)                                                   AS total,
        COUNT(DISTINCT oem_part_no)                                AS uniq_parts,
        COUNT(DISTINCT catalog_file)                               AS catalogs,
        COUNT(*) FILTER (WHERE fits_all_models)                    AS fits_all,
        COUNT(*) FILTER (WHERE NOT fits_all_models
          AND cardinality(model_codes) > 0)                       AS model_specific,
        COUNT(*) FILTER (WHERE cardinality(model_codes) = 0
          AND NOT fits_all_models)                                 AS no_model,
        COUNT(*) FILTER (WHERE matched_product_id IS NOT NULL)     AS matched,
        COUNT(*) FILTER (WHERE match_method = 'oem_numbers_array') AS match_p1,
        COUNT(*) FILTER (WHERE match_method = 'oem_crossref')      AS match_p2
      FROM oem_fitment
    `);

    const pct = s.total > 0
      ? (parseInt(s.matched) / parseInt(s.total) * 100).toFixed(1) : '0.0';

    console.log(`
┌──────────────────────────────────────────────────┐
│  oem_fitment — summary                           │
├──────────────────────────────────────────────────┤
│  Total rows              ${String(s.total).padStart(10)}              │
│  Unique OEM part #s      ${String(s.uniq_parts).padStart(10)}              │
│  Catalogs loaded         ${String(s.catalogs).padStart(10)}              │
├──────────────────────────────────────────────────┤
│  Fits ALL models         ${String(s.fits_all).padStart(10)}              │
│  Model-specific          ${String(s.model_specific).padStart(10)}              │
│  No model tag            ${String(s.no_model).padStart(10)}              │
├──────────────────────────────────────────────────┤
│  Matched → unified       ${String(s.matched).padStart(10)}  (${pct}%)      │
│    via oem_numbers[]     ${String(s.match_p1).padStart(10)}              │
│    via oem_crossref      ${String(s.match_p2).padStart(10)}              │
└──────────────────────────────────────────────────┘`);

    await pool.end();
  }

  console.log('\n✅  Done.\n');
}

main().catch(e => {
  console.error('\n❌ Fatal:', e.message);
  process.exit(1);
});

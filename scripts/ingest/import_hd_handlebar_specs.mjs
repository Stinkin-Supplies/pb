#!/usr/bin/env node
/**
 * import_hd_handlebar_specs.mjs
 *
 * Creates hd_handlebar_specs staging table with OEM handlebar specs per
 * H-D model/year, then cross-references with catalog_unified to insert
 * OEM part numbers into catalog_oem_crossref.
 *
 * Source: H-D Handlebar Fitment Reference (2002-2013)
 * OEM #s present: 55947-08, 55947-00, 56569-86, 56079-93, 56082-83
 *
 * Usage:
 *   node scripts/ingest/import_hd_handlebar_specs.mjs           # dry run
 *   node scripts/ingest/import_hd_handlebar_specs.mjs --apply   # commit
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool  = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const APPLY = process.argv.includes('--apply');

// ── Raw data ──────────────────────────────────────────────────────────────────
// Fields: model_code, description, year_from, year_to,
//         bar_diameter, height, width, pullback, center, clamp_area, factory_pn, notes

const SPECS = [
  // Dyna
  { model_code:'FLD',      desc:'Dyna Switchback',                   yr:[2012,2013], dia:'1"',     ht:'8"',          w:'32"',     pb:'10"',     ctr:'7"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXD',      desc:'Dyna Super Glide',                  yr:[2002,2002], dia:'1"',     ht:'4-1/2"',      w:'31"',     pb:'7-1/2"',  ctr:'7-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXD',      desc:'Dyna Super Glide',                  yr:[2003,2010], dia:'1"',     ht:'6"',          w:'29"',     pb:'10"',     ctr:'6-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXDB',     desc:'Dyna Street Bob',                   yr:[2006,2008], dia:'1"',     ht:'10"',         w:'34-1/4"', pb:'10"',     ctr:'8"',       clamp:'2-1/2" x 4-1/2"', pn:'56079-93' },
  { model_code:'FXDB',     desc:'Dyna Street Bob',                   yr:[2009,2013], dia:'1"',     ht:'12-1/2"',     w:'34-1/4"', pb:'10"',     ctr:'8"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXDC',     desc:'Dyna Super Glide Custom',           yr:[2006,2013], dia:'1"',     ht:'6-1/2"',      w:'30-1/2"', pb:'11"',     ctr:'8-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXDF',     desc:'Dyna Fat Bob',                      yr:[2008,2013], dia:'1-1/4"', ht:'Drag Bar',    w:'27"',     pb:'5-1/2"',  ctr:'7-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXDI35',   desc:'Dyna 35th Anniversary Super Glide', yr:[2006,2006], dia:'1"',     ht:'6-1/2"',      w:'30-1/2"', pb:'11"',     ctr:'8-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXDL',     desc:'Dyna Low Rider',                    yr:[2002,2009], dia:'1"',     ht:'5"',          w:'31"',     pb:'9"',      ctr:'7-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null, notes:'Risers 4-1/2"H x 2"PB' },
  { model_code:'FXDWG',    desc:'Dyna Wide Glide',                   yr:[2002,2005], dia:'1"',     ht:'10"',         w:'34-1/4"', pb:'10"',     ctr:'8"',       clamp:'2-1/2" x 4-1/2"', pn:'56079-93' },
  { model_code:'FXDWG',    desc:'Dyna Wide Glide',                   yr:[2006,2008], dia:'1-1/4"', ht:'10"',         w:'34"',     pb:'10"',     ctr:'6"',       clamp:'2" x 5"',          pn:null },
  { model_code:'FXDWG',    desc:'Dyna Wide Glide',                   yr:[2010,2013], dia:'1-1/4"', ht:'3"',          w:'30"',     pb:'9"',      ctr:'7"',       clamp:'2" x 5"',          pn:null, notes:'Risers 5"' },
  { model_code:'FXDX',     desc:'Dyna Super Glide Sport',            yr:[2002,2002], dia:'1"',     ht:'7"',          w:'31"',     pb:'9"',      ctr:'5-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXDX',     desc:'Dyna Super Glide Sport',            yr:[2003,2003], dia:'1"',     ht:'6"',          w:'32"',     pb:'9"',      ctr:'5-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null, notes:'Black bar' },
  { model_code:'FXDXT',    desc:'Dyna Super Gld T Sport',            yr:[2002,2003], dia:'1"',     ht:'7"',          w:'31"',     pb:'9"',      ctr:'5-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXDFSDE',  desc:'CVO Fat Bob',                       yr:[2010,2010], dia:'1-1/4"', ht:'7-1/2"',     w:'33"',     pb:'12"',     ctr:'6-1/2"',   clamp:'5" one piece',     pn:null },
  { model_code:'FXS',      desc:'Blackline (2 piece bars, no risers)',yr:[2012,2013], dia:'1"',     ht:null,          w:null,      pb:null,      ctr:null,       clamp:'5-1/2" centers',   pn:null },
  { model_code:'FXSBSE',   desc:'CVO Breakout',                      yr:[2013,2013], dia:'1-1/4"', ht:'7-1/2"',     w:'33"',     pb:'12"',     ctr:'6-1/2"',   clamp:'5" one piece',     pn:null },
  { model_code:'FXSDSE',   desc:'Screaming Eagle Dyna',              yr:[2008,2008], dia:'1-1/4"', ht:'3-1/2"',     w:'33-1/2"', pb:'8"',      ctr:'7-1/2"',   clamp:'2" x 5"',          pn:null, notes:'Elevated motorcycles' },

  // Softail
  { model_code:'FLS',      desc:'Softail Slim',                      yr:[2013,2013], dia:'1"',     ht:'3-1/2"',      w:'32"',     pb:'12"',     ctr:'8"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLST',     desc:'Heritage Softail',                  yr:[2006,2006], dia:'1"',     ht:'7"',          w:'31"',     pb:'11"',     ctr:'8-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLSTC',    desc:'Heritage Classic',                  yr:[2002,2005], dia:'1"',     ht:'7"',          w:'32"',     pb:'13"',     ctr:'7"',       clamp:'2-1/2" x 4-1/2"', pn:'56569-86' },
  { model_code:'FLSTC',    desc:'Heritage Softail Classic',          yr:[2006,2008], dia:'1"',     ht:'7"',          w:'32"',     pb:'13"',     ctr:'7"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLSTC',    desc:'Heritage Softail Classic',          yr:[2009,2013], dia:'1"',     ht:'13"',         w:'35"',     pb:'12"',     ctr:'10"',      clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLSTF',    desc:'Fat Boy',                           yr:[2002,2005], dia:'1"',     ht:'7"',          w:'32"',     pb:'11"',     ctr:'11"',      clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLSTF',    desc:'Fat Boy',                           yr:[2006,2011], dia:'1-1/4"', ht:'7"',          w:'32-1/2"', pb:'11"',     ctr:'10"',      clamp:'2" x 5"',          pn:null },
  { model_code:'FLSTF',    desc:'Fat Boy / Lo',                      yr:[2010,2013], dia:'1-1/4"', ht:'3"',          w:'30"',     pb:'9"',      ctr:'7"',       clamp:'2" x 5"',          pn:null },
  { model_code:'FLSTN',    desc:'Softail Deluxe',                    yr:[2005,2013], dia:'1"',     ht:'5"',          w:'32"',     pb:'11-1/2"', ctr:'8"',       clamp:'2-3/4" x 6-1/2"', pn:null, notes:'Risers 6"H x 2"PB' },
  { model_code:'FLSTS',    desc:'Heritage Springer',                  yr:[2002,2003], dia:'1"',     ht:'7"',          w:'32"',     pb:'11"',     ctr:'10"',      clamp:'4-1/2" x 6-1/8"', pn:null },
  { model_code:'FLSTSB',   desc:'Cross Bones Springer',              yr:[2009,2011], dia:'1"',     ht:'12-1/2"',     w:'34-1/4"', pb:'10"',     ctr:'8"',       clamp:'4-1/2" x 6-1/8"', pn:null },
  { model_code:'FLSTSE',   desc:'CVO Softail Convertible',           yr:[2010,2011], dia:'1-1/4"', ht:'7-1/2"',     w:'33"',     pb:'12"',     ctr:'6-1/2"',   clamp:'5" one piece',     pn:null },
  { model_code:'FXCW',     desc:'Rocker / C',                        yr:[2008,2011], dia:'1"',     ht:'10/8"',       w:'32"',     pb:'9/11"',   ctr:'"V"',      clamp:'"V"',              pn:null },
  { model_code:'FXST',     desc:'Softail Standard',                  yr:[2002,2007], dia:'1"',     ht:'7"',          w:'31"',     pb:'11"',     ctr:'8-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null, notes:'Risers 6"H x 2"PB' },
  { model_code:'FXSTB',    desc:'Night Train',                       yr:[2003,2009], dia:'1"',     ht:'Drag Bar',    w:'27"',     pb:'5-1/2"',  ctr:'7-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null, notes:'Risers 6"H' },
  { model_code:'FXSTC',    desc:'Softail Custom',                    yr:[2007,2008], dia:'1"',     ht:'10"',         w:'34-1/4"', pb:'10"',     ctr:'8"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXSTC',    desc:'Softail Custom',                    yr:[2009,2010], dia:'1"',     ht:'12-1/2"',     w:'34-1/4"', pb:'10"',     ctr:'8"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FXSTD',    desc:'Softail Deuce',                     yr:[2002,2007], dia:'1"',     ht:'5"',          w:'31"',     pb:'9"',      ctr:'6"',       clamp:'2-1/2" x 4-1/2"', pn:null, notes:'Risers 5"H x 4"PB' },
  { model_code:'FXSTS',    desc:'Springer Softail',                  yr:[2002,2003], dia:'1"',     ht:'9"',          w:'27"',     pb:'10-1/2"', ctr:'8"',       clamp:'4-1/2" x 6-1/8"', pn:null },
  { model_code:'FXSTS',    desc:'Springer Softail',                  yr:[2004,2006], dia:'1"',     ht:'4-1/2"',      w:'32"',     pb:'8"',      ctr:'7-1/2"',   clamp:'4-1/2" x 6-1/8"', pn:null },
  { model_code:'FXSTSC',   desc:'Springer Softail Classic',          yr:[2005,2007], dia:'1"',     ht:'3-1/2"',      w:'32"',     pb:'11-1/2"', ctr:'8"',       clamp:'2-3/4" x 6-1/2"', pn:null },
  { model_code:'FXSTSSE',  desc:'Screaming Eagle Springer',          yr:[2008,2009], dia:'1-1/4"', ht:'3-1/2"',     w:'33-1/2"', pb:'8"',      ctr:'7-1/2"',   clamp:'3" x 6-1/2"',      pn:null, notes:'Elevated motorcycles' },

  // Touring
  { model_code:'FLHR',     desc:'Road King',                         yr:[2002,2008], dia:'1"',     ht:'7"',          w:'32"',     pb:'11"',     ctr:'11"',      clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLHR',     desc:'Road King',                         yr:[2009,2013], dia:'1"',     ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:'55947-08' },
  { model_code:'FLHRC',    desc:'Road King Classic',                 yr:[2002,2008], dia:'1"',     ht:'7"',          w:'32"',     pb:'11"',     ctr:'11"',      clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLHRC',    desc:'Road King Classic',                 yr:[2009,2013], dia:'1"',     ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLHRS',    desc:'Road King Custom',                  yr:[2004,2007], dia:'1"',     ht:'6"',          w:'31-1/2"', pb:'14-1/2"', ctr:'8"',       clamp:'2-1/2" x 4-1/2"', pn:'55947-00' },
  { model_code:'FLHRSE',   desc:'CVO Road King',                     yr:[2013,2013], dia:'1-1/4"', ht:'8"',          w:'32"',     pb:'15"',     ctr:'8"',       clamp:'5" one piece',     pn:null },
  { model_code:'FLHT',     desc:'Electra Glide Standard',            yr:[2002,2007], dia:'1"',     ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLHT',     desc:'Electra Glide Standard',            yr:[2008,2009], dia:'1"',     ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:'55947-08' },
  { model_code:'FLHTC',    desc:'Electra Glide Classic',             yr:[2002,2013], dia:'1"',     ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLHTC',    desc:'Electra Glide Classic / Ultra Limited', yr:[2008,2013], dia:'1"', ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:'55947-08' },
  { model_code:'FLHTCU',   desc:'Ultra Classic',                     yr:[2002,2007], dia:'1"',     ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLHTCU',   desc:'Ultra Classic / Limited / CVO / ElectraGlide', yr:[2008,2013], dia:'1"', ht:'7-1/2"', w:'31"', pb:'12-1/2"', ctr:'11-1/2"', clamp:'2-1/2" x 4-1/2"', pn:'55947-08' },
  { model_code:'FLHTCUTG', desc:'Tri Glide Ultra Classic',           yr:[2009,2013], dia:'1"',     ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:'55947-08' },
  { model_code:'FLHX',     desc:'Street Glide / CVO',                yr:[2006,2013], dia:'1"',     ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'FLHXXX',   desc:'Street Glide Trike',                yr:[2009,2011], dia:'1"',     ht:'7-1/2"',      w:'31"',     pb:'12-1/2"', ctr:'11-1/2"',  clamp:'2-1/2" x 4-1/2"', pn:'55947-08' },
  { model_code:'FLTR',     desc:'Road Glide',                        yr:[2002,2002], dia:'1"',     ht:'7"',          w:'32-1/2"', pb:'12"',     ctr:'6-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:'55947-00' },
  { model_code:'FLTR',     desc:'Road Glide / Custom / Ultra',       yr:[2003,2013], dia:'1"',     ht:'8-1/2"',      w:'32"',     pb:'11"',     ctr:'7"',       clamp:'2-1/2" x 4-1/2"', pn:'55947-00' },
  { model_code:'FLTRXSE',  desc:'CVO Road Glide Custom',             yr:[2013,2013], dia:'1-1/4"', ht:'8"',          w:'32"',     pb:'15"',     ctr:'8"',       clamp:'5" one piece',     pn:null },

  // V-Rod
  { model_code:'VRSCA',    desc:'V-Rod A',                           yr:[2003,2004], dia:'1"',     ht:'5"',          w:'28"',     pb:'10"',     ctr:'5"',       clamp:'Welded Risers',    pn:null },
  { model_code:'VRSCB',    desc:'V-Rod B',                           yr:[2004,2005], dia:'1"',     ht:'6-1/2"',      w:'29-1/2"', pb:'8"',      ctr:'5"',       clamp:'4" one piece',     pn:null },
  { model_code:'VRSCD',    desc:'V-Rod Night Rod',                   yr:[2006,2008], dia:'1"',     ht:'6-1/2"',      w:'29-1/2"', pb:'8"',      ctr:'5"',       clamp:'4" one piece',     pn:null },
  { model_code:'VRSCR',    desc:'V-Rod Street Rod',                  yr:[2006,2007], dia:'1"',     ht:'3"',          w:'28"',     pb:'4"',      ctr:'5"',       clamp:'4" one piece',     pn:null },
  { model_code:'VRSCAW',   desc:'V-Rod',                             yr:[2007,2010], dia:'1"',     ht:'8"',          w:'30"',     pb:'11"',     ctr:'5"',       clamp:'4" one piece',     pn:null },
  { model_code:'VRSCDX',   desc:'V-Rod Night Rod Special',           yr:[2007,2011], dia:'1"',     ht:'3"',          w:'28"',     pb:'4"',      ctr:'5"',       clamp:'4" one piece',     pn:null },
  { model_code:'VRSCDX',   desc:'V-Rod Night Rod Special',           yr:[2013,2013], dia:'1"',     ht:'6"',          w:'32"',     pb:'10"',     ctr:'6"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'VRSCF',    desc:'V-Rod Muscle (cast aluminum bar, no risers)', yr:[2009,2013], dia:null, ht:null,    w:null,      pb:null,      ctr:null,       clamp:null,               pn:null },
  { model_code:'VRSCX',    desc:'V-Rod',                             yr:[2007,2007], dia:'1"',     ht:'3"',          w:'28"',     pb:'4"',      ctr:'5"',       clamp:'4" one piece',     pn:null },

  // Sportster
  { model_code:'XL1200C',  desc:'Sportster 1200 Custom',             yr:[2002,2003], dia:'1"',     ht:'Drag Bar',    w:'27"',     pb:'5-1/2"',  ctr:'8"',       clamp:'2-1/2" x 4-1/2"', pn:null, notes:'Risers 6"' },
  { model_code:'XL1200C',  desc:'Sportster 1200 Custom',             yr:[2004,2013], dia:'1"',     ht:'4-1/2"',      w:'27"',     pb:'7-1/2"',  ctr:'4-3/4"',   clamp:'2-1/2" x 5-1/2"', pn:null, notes:'Risers+Speedo 6"' },
  { model_code:'XL1200L',  desc:'Sportster 1200 Low',                yr:[2006,2011], dia:'1"',     ht:'6"',          w:'28"',     pb:'10"',     ctr:'6-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'XL1200N',  desc:'Sportster 1200 Nightster',          yr:[2008,2012], dia:'1"',     ht:'6"',          w:'32"',     pb:'10"',     ctr:'6"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'XL1200R',  desc:'Sportster 1200 Roadster',           yr:[2002,2008], dia:'1"',     ht:'5"',          w:'31"',     pb:'9"',      ctr:'6"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'XL1200S',  desc:'Sportster 1200 Sport',              yr:[2002,2003], dia:'1"',     ht:'4-1/2"',      w:'27"',     pb:'7-1/2"',  ctr:'4-3/4"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'XL1200V',  desc:'Sportster 72',                      yr:[2012,2013], dia:'1"',     ht:'13"',         w:'32"',     pb:'10"',     ctr:'7"',       clamp:'2-1/2" x 5-1/2"', pn:null },
  { model_code:'XL1200X',  desc:'Sportster 48',                      yr:[2011,2013], dia:'1"',     ht:'4-1/2"',      w:'27"',     pb:'7-1/2"',  ctr:'4-3/4"',   clamp:'2-1/2" x 5-1/2"', pn:null },
  { model_code:'XL50',     desc:'Sportster 50th Anniversary',        yr:[2007,2007], dia:'1"',     ht:'5-1/2"',      w:'32"',     pb:'10"',     ctr:'6"',       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'XL883',    desc:'Sportster 883',                     yr:[2002,2008], dia:'1"',     ht:'4-1/2"',      w:'27"',     pb:'7-1/2"',  ctr:'4-3/4"',   clamp:'2-1/2" x 4-1/2"', pn:'56082-83' },
  { model_code:'XL883C',   desc:'Sportster 883 Custom',              yr:[2002,2003], dia:'1"',     ht:'Drag Bar',    w:'27"',     pb:'5-1/2"',  ctr:'8"',       clamp:'2-1/2" x 4-1/2"', pn:null, notes:'Risers 6"' },
  { model_code:'XL883C',   desc:'Sportster 883 Custom',              yr:[2004,2009], dia:'1"',     ht:'4-1/2"',      w:'27"',     pb:'7-1/2"',  ctr:'4-3/4"',   clamp:'2-1/2" x 5-1/2"', pn:'56082-83', notes:'Risers+Speedo 6"' },
  { model_code:'XL883L',   desc:'Sportster 883 Low / SuperLow',      yr:[2005,2013], dia:'1"',     ht:'6"',          w:'28"',     pb:'10"',     ctr:'6-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'XL883N',   desc:'Sportster Iron 883',                yr:[2010,2013], dia:'1"',     ht:'4-1/2"',      w:'27"',     pb:'7-1/2"',  ctr:'4-3/4"',   clamp:'2-1/2" x 5-1/2"', pn:null },
  { model_code:'XL883R',   desc:'Sportster 883R',                    yr:[2002,2003], dia:'1"',     ht:'7"',          w:'31"',     pb:'9"',      ctr:'5-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null, notes:'Black bar' },
  { model_code:'XL883R',   desc:'Sportster 883R',                    yr:[2006,2007], dia:'1"',     ht:'5"',          w:'31"',     pb:'9"',      ctr:'6"',       clamp:'2-1/2" x 4-1/2"', pn:null, notes:'Black bar' },
  { model_code:'XLH1200',  desc:'Sportster 1200',                    yr:[2002,2003], dia:'1"',     ht:'10"',         w:'26-1/2"', pb:'9-1/2"',  ctr:'6-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'XLH883',   desc:'Sportster 883 Hugger',              yr:[2002,2003], dia:'1"',     ht:'10"',         w:'26-1/2"', pb:'9-1/2"',  ctr:'6-1/2"',   clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:'XR1200',   desc:'Sportster XR1200',                  yr:[2009,2012], dia:'1"',     ht:'6"',          w:'32"',     pb:'10"',     ctr:'6"',       clamp:'2-1/2" x 4-1/2"', pn:null },

  // Generic knurl specs
  { model_code:null,        desc:'Standard Knurls (including V-Rod)', yr:[1983,2011], dia:'1"',    ht:null,          w:null,      pb:null,      ctr:null,       clamp:'2-1/2" x 4-1/2"', pn:null },
  { model_code:null,        desc:'Springer Knurls',                   yr:[1983,2011], dia:'1"',    ht:null,          w:null,      pb:null,      ctr:null,       clamp:'4-1/2" x 6-1/8"', pn:null },
];

// ── DDL ───────────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS hd_handlebar_specs (
  id            SERIAL PRIMARY KEY,
  model_code    VARCHAR(20),
  description   TEXT          NOT NULL,
  year_from     SMALLINT      NOT NULL,
  year_to       SMALLINT      NOT NULL,
  bar_diameter  VARCHAR(10),
  height        VARCHAR(20),
  width         VARCHAR(20),
  pullback      VARCHAR(20),
  center_dist   VARCHAR(20),
  clamp_area    VARCHAR(30),
  factory_pn    VARCHAR(20),
  notes         TEXT,
  source        VARCHAR(30)   DEFAULT 'HD_OEM_HANDLEBAR',
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hdh_model_code ON hd_handlebar_specs(model_code);
CREATE INDEX IF NOT EXISTS idx_hdh_years      ON hd_handlebar_specs(year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_hdh_factory_pn ON hd_handlebar_specs(factory_pn) WHERE factory_pn IS NOT NULL;
`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  console.log(`\n=== H-D Handlebar Specs Import ===`);
  console.log(`Mode: ${APPLY ? '** APPLY **' : 'DRY RUN'}\n`);

  try {
    console.log(`Spec rows:     ${SPECS.length}`);

    // OEM numbers summary
    const oems = [...new Set(SPECS.filter(s => s.pn).map(s => s.pn))];
    console.log(`Unique OEM #s: ${oems.length} — ${oems.join(', ')}`);

    // By family
    const families = {
      Dyna: SPECS.filter(s => s.model_code?.startsWith('FXD') || s.model_code === 'FLD').length,
      Softail: SPECS.filter(s => s.model_code?.startsWith('FLS') || s.model_code?.startsWith('FXS')).length,
      Touring: SPECS.filter(s => s.model_code?.startsWith('FLH') || s.model_code?.startsWith('FLT')).length,
      VRod: SPECS.filter(s => s.model_code?.startsWith('VRS')).length,
      Sportster: SPECS.filter(s => s.model_code?.startsWith('XL') || s.model_code?.startsWith('XR')).length,
    };
    console.log('\nRows by family:');
    for (const [fam, count] of Object.entries(families)) console.log(`  ${fam}: ${count}`);

    // Check catalog_unified for handlebar products with these OEM numbers
    console.log('\nLooking for matching handlebar products in catalog_unified...');
    const { rows: catalogHits } = await client.query(`
      SELECT cu.id, cu.sku, cu.source_vendor, cu.brand, cu.name,
             cu.brand_part_number,
             coc.oem_number
      FROM catalog_unified cu
      LEFT JOIN catalog_oem_crossref coc
        ON coc.sku = cu.sku
        AND coc.oem_number = ANY($1::text[])
      WHERE cu.is_active = true
        AND (
          cu.brand_part_number = ANY($1::text[])
          OR coc.oem_number IS NOT NULL
          OR (cu.display_subcategory ILIKE '%handlebar%'
              AND cu.brand_part_number = ANY($1::text[]))
        )
    `, [oems]);

    console.log(`  Direct OEM # matches: ${catalogHits.length}`);
    for (const h of catalogHits.slice(0, 10)) {
      console.log(`    [${h.source_vendor}] ${h.sku} bpn=${h.brand_part_number ?? '—'} oem=${h.oem_number ?? '—'} "${h.name?.slice(0, 50)}"`);
    }

    // Look for handlebars by subcategory regardless of OEM
    const { rows: hbCount } = await client.query(`
      SELECT source_vendor, COUNT(*) AS cnt
      FROM catalog_unified
      WHERE is_active = true
        AND display_subcategory ILIKE '%handlebar%'
      GROUP BY source_vendor ORDER BY source_vendor
    `);
    console.log('\nHandlebar products in catalog_unified by vendor:');
    for (const r of hbCount) console.log(`  ${r.source_vendor}: ${r.cnt}`);

    // OEM crossref candidates — handlebars with brand_part_number matching our OEM list
    const { rows: crossrefCandidates } = await client.query(`
      SELECT cu.sku, cu.source_vendor, cu.brand, cu.name, cu.brand_part_number
      FROM catalog_unified cu
      WHERE cu.is_active = true
        AND cu.display_subcategory ILIKE '%handlebar%'
        AND cu.brand_part_number = ANY($1::text[])
    `, [oems]);

    console.log(`\nHandlebars with matching OEM brand_part_number: ${crossrefCandidates.length}`);
    for (const r of crossrefCandidates) {
      console.log(`  [${r.source_vendor}] ${r.sku} bpn=${r.brand_part_number} "${r.name?.slice(0, 60)}"`);
    }

    if (!APPLY) {
      console.log('\nDry run complete. Pass --apply to create table and insert rows.\n');
      return;
    }

    // Create table
    await client.query(DDL);
    console.log('\nTable ready.');

    // Clear and reinsert
    await client.query(`DELETE FROM hd_handlebar_specs WHERE source = 'HD_OEM_HANDLEBAR'`);

    await client.query('BEGIN');
    try {
      for (const s of SPECS) {
        await client.query(`
          INSERT INTO hd_handlebar_specs
            (model_code, description, year_from, year_to,
             bar_diameter, height, width, pullback, center_dist,
             clamp_area, factory_pn, notes, source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'HD_OEM_HANDLEBAR')
        `, [
          s.model_code ?? null, s.desc,
          s.yr[0], s.yr[1],
          s.dia ?? null, s.ht ?? null, s.w ?? null,
          s.pb ?? null, s.ctr ?? null, s.clamp ?? null,
          s.pn ?? null, s.notes ?? null,
        ]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    const { rows: [{ total }] } = await client.query(
      `SELECT COUNT(*) AS total FROM hd_handlebar_specs`
    );
    console.log(`\n✅ hd_handlebar_specs: ${total} rows`);

    // Insert OEM crossref for handlebar products that match
    if (crossrefCandidates.length > 0) {
      console.log('\nInserting OEM crossref entries for matched handlebar products...');

      // Build sku → factory_pn(s) from specs
      const skuOemMap = new Map();
      for (const r of crossrefCandidates) {
        const matchingPns = SPECS
          .filter(s => s.pn === r.brand_part_number)
          .map(s => s.pn)
          .filter(Boolean);
        for (const pn of new Set(matchingPns)) {
          if (!skuOemMap.has(r.sku)) skuOemMap.set(r.sku, new Set());
          skuOemMap.get(r.sku).add(pn);
        }
      }

      let inserted = 0;
      for (const [sku, pns] of skuOemMap) {
        for (const pn of pns) {
          const { rowCount } = await client.query(`
            INSERT INTO catalog_oem_crossref (sku, oem_number, source, expanded_from)
            VALUES ($1, $2, 'HD_OEM', false)
            ON CONFLICT (sku, oem_number) DO NOTHING
          `, [sku, pn]);
          inserted += rowCount;
        }
      }
      console.log(`   OEM crossref entries inserted: ${inserted}`);
    } else {
      console.log('\nNo direct OEM matches found — handlebar OEM numbers not yet in brand_part_number.');
      console.log('Run with PU/VTwin handlebar products to find matches once crossref is populated.');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});

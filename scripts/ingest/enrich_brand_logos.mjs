import pg from 'pg';
import https from 'https';
import fs from 'fs';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

// Manual domain overrides for brands where guessing won't work
const DOMAIN_OVERRIDES = {
  'V-Twin':                    'vtwinmfg.com',
  'Drag Specialties':          'dragspecialties.com',
  'Wyatt Gatling':             'wyattgatling.com',
  'Scorpion EXO':              'scorpionusa.com',
  'Colony':                    'colonymachine.com',
  'Motorshop':                 null,
  'HardDrive':                 'wps-inc.com',
  'Magnum Shielding':          'magnumshielding.com',
  'James Gaskets':             'jamesgaskets.com',
  'LA Choppers':               'lachoppers.com',
  'Eastern Motorcycle Parts':  'easternmotorcycleparts.com',
  'Ultima':                    'ultimaproducts.com',
  'Arlen Ness':                'arlenness.com',
  'NAMZ Custom Cycle':         'namzcustomcycleproducts.com',
  'Saddlemen':                 'saddlemen.com',
  'S&S Cycle':                 'sscycle.com',
  'GMAX':                      'gmax.com',
  'Cometic':                   'cometic.com',
  'Volt Tech':                 null,
  'Custom Dynamics':           'customdynamics.com',
  'Motion Pro':                'motionpro.com',
  'Burly Brand':               'burlybrand.com',
  'Barnett':                   'barnettclutches.com',
  'Highway 21':                'highway21.com',
  'Goodridge':                 'goodridge.net',
  'Cobra':                     'cobrausa.com',
  'FLY RACING':                'flyracing.com',
  'Fat Baggers':               'fatbaggersinc.com',
  'Kibblewhite':               'kibblewhiteprecision.com',
  'Vance & Hines':             'vanceandhines.com',
  'Kuryakyn':                  'kuryakyn.com',
  'Cycle Visions':             'cyclevisions.com',
  'National Cycle':            'nationalcycle.com',
  "Biker's Choice":            'bikerschoice.com',
  'Drag Cartel':               null,
  'Show Chrome':               'showchrome.com',
  'Accel':                     'accel-ignition.com',
  'Harddrive':                 'wps-inc.com',
  'Rivera Primo':              'riveraprimo.com',
  'Paughco':                   'paughco.com',
  'Spyke':                     null,
  'Biker Art':                 null,
  'Zodiac':                    'zodiac.nl',
  'Emgo':                      'emgous.com',
  'Parts Unlimited':           'parts-unlimited.com',
  'WPS':                       'wps-inc.com',
  'K&N':                       'knfilters.com',
  'NGK':                       'ngksparkplugs.com',
  'Bel-Ray':                   'belray.com',
  'Spectro':                   'spectro-oils.com',
  'Maxima':                    'maximausa.com',
  'BikeMaster':                'bikemaster.com',
  'Progressive Suspension':    'progressivesuspension.com',
  'Works Performance':         'worksperformance.com',
  'Legend Suspensions':        'legendsuspensions.com',
  'Fox Racing Shox':           'ridefox.com',
  'RC Components':             'rccomponents.com',
  'Avon Tyres':                'avonmotorcycle.com',
  'Metzeler':                  'metzeler.com',
  'Dunlop':                    'dunlopmotorcycletires.com',
  'Kenda':                     'kendatire.com',
  'Shinko':                    'shinkotire.com',
  'Drag Seat':                 null,
  'Sargent':                   'sargentcycle.com',
  'Mustang':                   'mustangseats.com',
  'Le Pera':                   'lepera.com',
  'Danny Gray':                'dannygray.com',
  'Corbin':                    'corbin.com',
  'Roland Sands Design':       'rolandsands.com',
  'Performance Machine':       'performancemachine.com',
  'Brembo':                    'brembo.com',
  'EBC Brakes':                'ebcbrakes.com',
  'SBS':                       'sbs-friction.com',
  'Galfer':                    'galferusa.com',
  'Lyndall Brakes':            'lyndallracing.com',
  'Feuling':                   'feulingparts.com',
  'Andrews Products':          'andrewsproducts.com',
  'Crane Cams':                'cranecams.com',
  "Zipper's Performance":      'zippersperformance.com',
  'Mikuni':                    'mikuni.com',
  'Keihin':                    null,
  'Dynojet':                   'dynojet.com',
  'Power Commander':           'dynojet.com',
  "Screamin' Eagle":           'harley-davidson.com',
  'Khrome Werks':              'khromewerks.com',
  'Bassani':                   'bassani.com',
  'Rush':                      'rushexhaust.com',
  'Rinehart Racing':           'rinehartracingexhaust.com',
  'Kerker':                    null,
  'SuperTrapp':                'supertrapp.com',
  'D&D Performance':           'ddperformance.com',
  'Python':                    null,
  'Cycle Shack':               'cycleshack.com',
  'Samson':                    'samsonexhaust.com',
  'Freedom Performance':       'freedomperformance.net',
  'Big Gun':                   'biggunexhaust.com',
  'Two Brothers Racing':       'twobros.com',
  'Yoshimura':                 'yoshimura-rd.com',
  'Jardine':                   null,
  'Kuryakyn':                  'kuryakyn.com',
  'Show Chromes':              'showchrome.com',
  'Lindby':                    'lindby.com',
  'Rivco':                     'rivco.com',
  'Hopnel':                    null,
  'Nelson Rigg':               'nelsonrigg.com',
  'Chase Harper':              'chaseharper.com',
  'Dowco':                     'dowco.com',
  'National Cycle':            'nationalcycle.com',
  'Cee Baileys':               'ceebaileys.com',
  'Memphis Shades':            'memphisshades.com',
  'Slipstreamer':              'slipstreamer.com',
  'Pro Pad':                   'propad.com',
  'Cycle Visions':             'cyclevisions.com',
  'Witchdoctors':              null,
  'Custom Chrome':             'customchrome.com',
  'Drag':                      null,
  'Chopper Supply Co.':        null,
  "Biker's Choice":            'bikerschoice.com',
  'Mid-USA':                   'mid-usa.com',
  'V-Factor':                  null,
};

// Guess domain from brand name for brands not in overrides
function guessDomain(name) {
  return name
    .toLowerCase()
    .replace(/[&+]/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '')
    + '.com';
}

function getDomain(name) {
  if (name in DOMAIN_OVERRIDES) return DOMAIN_OVERRIDES[name];
  return guessDomain(name);
}

function checkClearbit(domain) {
  return new Promise((resolve) => {
    const url = `https://logo.clearbit.com/${domain}`;
    const options = {
      method: 'HEAD',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://stinksupp.vercel.app',
      }
    };
    const req = https.request(url, options, (res) => {
      if (process.env.DEBUG) process.stdout.write(` [${res.statusCode}] `);
      resolve(res.statusCode === 200 ? url : null);
    });
    req.on('error', (e) => { if (process.env.DEBUG) process.stdout.write(` [ERR:${e.code}] `); resolve(null); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n🏍️  Stinkin' Supplies — Brand Logo Enrichment`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  // Add columns if not exist
  if (!dryRun) {
    await pool.query(`
      ALTER TABLE brands ADD COLUMN IF NOT EXISTS domain TEXT;
      ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_source TEXT;
    `);
  }

  const { rows: brands } = await pool.query(`
    SELECT b.id, b.name, b.domain, b.logo_url,
           COUNT(cu.id) as product_count
    FROM brands b
    LEFT JOIN catalog_unified cu ON cu.brand = b.name
    GROUP BY b.id, b.name, b.domain, b.logo_url
    ORDER BY COUNT(cu.id) DESC
  `);

  console.log(`   Found ${brands.length} brands to process\n`);

  const hits = [];
  const misses = [];
  const skipped = [];

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    const domain = getDomain(brand.name);

    process.stdout.write(`[${String(i+1).padStart(3)}/${brands.length}] ${brand.name.padEnd(32)} `);

    if (!domain) {
      process.stdout.write(`⚪ no domain mapped\n`);
      misses.push({ name: brand.name, reason: 'no domain' });
      continue;
    }

    process.stdout.write(`→ ${domain.padEnd(35)} `);

    const logoUrl = await checkClearbit(domain);

    if (logoUrl) {
      process.stdout.write(`✅ hit\n`);
      hits.push({ name: brand.name, domain, logoUrl });

      if (!dryRun) {
        await pool.query(
          `UPDATE brands SET domain = $1, logo_url = $2, logo_source = 'clearbit' WHERE id = $3`,
          [domain, logoUrl, brand.id]
        );
      }
    } else {
      process.stdout.write(`❌ miss\n`);
      misses.push({ name: brand.name, domain, reason: 'clearbit 404' });

      if (!dryRun) {
        await pool.query(
          `UPDATE brands SET domain = $1, logo_source = 'none' WHERE id = $2`,
          [domain, brand.id]
        );
      }
    }

    // Rate limit: ~100ms between requests
    await sleep(120);
  }

  // Write miss report
  const missReport = [
    'name,domain,reason',
    ...misses.map(m => `"${m.name}","${m.domain || ''}","${m.reason}"`)
  ].join('\n');

  fs.writeFileSync('./brand_logo_misses.csv', missReport);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ Hits:    ${hits.length}`);
  console.log(`❌ Misses:  ${misses.length}`);
  console.log(`📄 Miss report written to brand_logo_misses.csv`);
  if (dryRun) console.log(`\n⚠️  Dry run — no DB writes made. Re-run without --dry-run to apply.`);
  console.log('');

  await pool.end();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

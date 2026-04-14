// scripts/import-jp-models.js
const { Client } = require('pg');
const fs = require('fs');

// Connection to your catalog DB
const client = new Client({ connectionString: process.env.DATABASE_URL });
const yearRegex = /(\d{4})/;

// Mapping from JP model text to generic model name (adjust as needed)
const genericMap = {
  'Sportster': 'Sportster',
  'Softail': 'Softail',
  'Dyna': 'Dyna',
  'Road Glide': 'Road Glide',
  'Street Glide': 'Street Glide',
  'Electra Glide': 'Electra Glide',
  'Road King': 'Road King',
  'V-Rod': 'V-Rod',
  'Pan America': 'Touring',  // or keep as 'Pan America'
  'Nightster': 'Sportster',
  'Freewheeler': 'Touring',
  'Tri Glide': 'Touring',
  'LiveWire': 'Universal',
  // Add more as needed
};

async function run() {
  await client.connect();

  // Read the Markdown file (you can also parse the PDF if needed)
  const content = fs.readFileSync('./Harley Davidson Models.md', 'utf8');
  const lines = content.split('\n');

  let currentYear = null;
  for (const line of lines) {
    // Detect year headers like "## 2025 Harley Davidson Models"
    const yearMatch = line.match(/## (\d{4})/);
    if (yearMatch) {
      currentYear = parseInt(yearMatch[1], 10);
      continue;
    }

    // Detect model lines that start with "* [2025 Harley Davidson ...](url)"
    const modelMatch = line.match(/\* \[(\d{4}) Harley Davidson (.+?)\]\(/);
    if (modelMatch && currentYear) {
      const year = parseInt(modelMatch[1], 10);
      const fullModel = modelMatch[2].trim();
      // Extract submodel (everything after the generic part)
      let generic = null;
      for (const [key, val] of Object.entries(genericMap)) {
        if (fullModel.includes(key)) {
          generic = val;
          break;
        }
      }
      if (!generic) generic = 'Universal'; // fallback

      const submodel = fullModel;
      // Use the year from the line (or currentYear)
      const y = year || currentYear;

      await client.query(
        `INSERT INTO catalog_submodels (generic_model, submodel, start_year, end_year)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (submodel) DO NOTHING`,
        [generic, submodel, y, y]
      );
      console.log(`Inserted: ${submodel} → ${generic} (${y})`);
    }
  }

  await client.end();
  console.log('Done');
}

run().catch(console.error);


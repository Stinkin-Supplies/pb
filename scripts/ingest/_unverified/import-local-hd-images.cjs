const { Pool } = require('pg');
const { execSync } = require('child_process');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL
});

async function main() {
  // Use macOS textutil to convert xlsx to csv, preserving hyperlinks
  console.log('Converting Excel file...');
  execSync('cd scripts/data/wps && /usr/bin/python3 -c "import openpyxl; wb = openpyxl.load_workbook(\\'harddrive_master_image.xlsx\\'); ws = wb.active; import csv; f = open(\\'hd_images.csv\\', \\'w\\'); writer = csv.writer(f); writer.writerow([c.value for c in ws[1]]); [writer.writerow([c.hyperlink.target if c.hyperlink else c.value for c in row]) for row in ws.iter_rows(min_row=2)]; f.close()"');
  
  console.log('CSV created with hyperlinks extracted!');
}

main();
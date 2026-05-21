const {Pool}=require('pg');
const p=new Pool({host:'5.161.100.126',port:5432,database:'stinkin_catalog',user:'catalog_app',password:'smelly',ssl:false});
async function main() {
  const {rows} = await p.query(`
    SELECT cu.id, cu.name
    FROM catalog_variant_members cvm
    JOIN catalog_unified cu ON cu.id = cvm.product_id
    WHERE cvm.group_id = 27
  `);

  const ids18 = rows.filter(r => r.name.includes('18')).map(r => r.id);
  const ids20 = rows.filter(r => r.name.includes('20')).map(r => r.id);
  console.log(`Splitting: ${ids18.length} × 18g, ${ids20.length} × 20g`);

  // Create new 18g WPS group
  const {rows:[g18]} = await p.query(`
    INSERT INTO catalog_variant_groups (display_name, source_vendor, family_key)
    VALUES ('100-Foot OEM Color Wire Spools - 18 Gauge', 'WPS', 'namz-wire-spool-100ft')
    RETURNING id
  `);
  // Create new 20g WPS group
  const {rows:[g20]} = await p.query(`
    INSERT INTO catalog_variant_groups (display_name, source_vendor, family_key)
    VALUES ('100-Foot OEM Color Wire Spools - 20 Gauge', 'WPS', 'namz-wire-spool-100ft')
    RETURNING id
  `);
  console.log(`Created groups: 18g=${g18.id}, 20g=${g20.id}`);

  // Move 18g members to new group
  await p.query(`UPDATE catalog_variant_members SET group_id=$1 WHERE group_id=27 AND product_id=ANY($2::int[])`, [g18.id, ids18]);
  await p.query(`UPDATE catalog_unified SET variant_group_id=$1 WHERE id=ANY($2::int[])`, [g18.id, ids18]);

  // Move 20g members to new group
  await p.query(`UPDATE catalog_variant_members SET group_id=$1 WHERE group_id=27 AND product_id=ANY($2::int[])`, [g20.id, ids20]);
  await p.query(`UPDATE catalog_unified SET variant_group_id=$1 WHERE id=ANY($2::int[])`, [g20.id, ids20]);

  // Delete old combined group (members already moved)
  await p.query(`DELETE FROM catalog_variant_groups WHERE id=27`);
  console.log('Deleted old group 27');

  // Verify
  const {rows:check} = await p.query(`
    SELECT cvg.id, cvg.display_name, COUNT(*) as cnt
    FROM catalog_variant_groups cvg
    JOIN catalog_variant_members cvm ON cvm.group_id = cvg.id
    WHERE cvg.family_key = 'namz-wire-spool-100ft'
    GROUP BY cvg.id, cvg.display_name ORDER BY cvg.display_name
  `);
  console.log('\nFinal groups:');
  check.forEach(r => console.log(` ${r.id}: "${r.display_name}" — ${r.cnt} members`));
  await p.end();
}
main().catch(e=>{console.error(e.message);process.exit(1)});

const {Pool}=require('pg');
const p=new Pool({host:'5.161.100.126',port:5432,database:'stinkin_catalog',user:'catalog_app',password:'smelly',ssl:false});
async function main() {
  const {rows} = await p.query(`
    UPDATE catalog_variant_members cvm
    SET option_1_name = 'Color',
        option_1_value = trim(
          regexp_replace(
            regexp_replace(cu.name, E'^#\\\\d+-GAUGE\\\\s+', '', 'i'),
            E'\\\\s+100. SPOOL.*$', '', 'i'
          )
        )
    FROM catalog_unified cu
    WHERE cvm.product_id = cu.id
      AND cvm.group_id = 27
      AND cvm.option_1_value IS NULL
    RETURNING cvm.product_id, cvm.option_1_value
  `);
  console.log('Updated', rows.length, 'rows');
  rows.slice(0,8).forEach(x=>console.log(JSON.stringify(x)));
  await p.end();
}
main().catch(e=>{console.error(e.message);process.exit(1)});

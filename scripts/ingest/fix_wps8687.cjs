const {Pool}=require('pg');
const p=new Pool({host:'5.161.100.126',port:5432,database:'stinkin_catalog',user:'catalog_app',password:'smelly',ssl:false});
async function main() {
  const {rows} = await p.query(`
    UPDATE catalog_variant_members cvm
    SET option_1_value = trim(regexp_replace(
      regexp_replace(cu.name, E'^.*\\\\(', ''),
      E'\\\\).*$', ''
    ))
    FROM catalog_unified cu
    WHERE cvm.product_id = cu.id
      AND cvm.group_id = 8687
    RETURNING cvm.option_1_value, cu.name
  `);
  console.log('Updated', rows.length, 'rows');
  rows.slice(0,5).forEach(r => console.log(` "${r.name}" → "${r.option_1_value}"`));
  await p.end();
}
main().catch(e=>{console.error(e.message);process.exit(1)});

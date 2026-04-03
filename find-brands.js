async function main() {
  let page = 1, allBrands = [], hasMore = true;
  while (hasMore) {
    const r = await fetch(`https://api.wps-inc.com/brands?page[size]=100&page[number]=${page}`, {
      headers: { Authorization: `Bearer ${process.env.WPS_API_KEY}` }
    });
    const d = await r.json();
    allBrands.push(...(d.data ?? []));
    hasMore = !!(d.links?.next);
    page++;
    if (!d.data?.length) break;
  }
  console.log('Total brands:', allBrands.length);
  const matches = allBrands.filter(b =>
    /shinko|sedona|drag spec|kuryakyn|dunlop|michelin|pirelli|metzeler|kenda|maxxis|irc|bridgestone|continental|heidenau|vee|cst|duro|kings/i.test(b.name)
  );
  console.log('Tire brands found:', JSON.stringify(matches.map(b => ({ id: b.id, name: b.name })), null, 2));

  // Also print all brands for reference
  console.log('\nAll brands:');
  allBrands.forEach(b => console.log(`  ${b.id}: ${b.name}`));
}
main();

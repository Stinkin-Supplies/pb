console.log('CATALOG_DATABASE_URL:', process.env.CATALOG_DATABASE_URL);
console.log('All env keys:', Object.keys(process.env).filter(k => k.includes('CATALOG')));

import { Pool } from 'pg';

let pool = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.CATALOG_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing CATALOG_DATABASE_URL');
  }

  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    ssl: false,
  });

  pool.on('error', (err) => {
    console.error('[ScriptsDB] Unexpected pool error:', err.message);
  });

  return pool;
}

const IDENTIFIER = Symbol('identifier');

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function isTemplateStrings(value) {
  return Array.isArray(value) && Array.isArray(value.raw);
}

function buildQuery(strings, values) {
  let text = '';
  const params = [];

  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i >= values.length) continue;

    const value = values[i];
    if (value && value[IDENTIFIER]) {
      text += quoteIdentifier(value.name);
      continue;
    }

    params.push(value);
    text += `$${params.length}`;
  }

  return { text, values: params };
}

export function sql(first, ...rest) {
  if (isTemplateStrings(first)) {
    const { text, values } = buildQuery(first, rest);
    return getPool().query(text, values).then((res) => res.rows);
  }

  return { [IDENTIFIER]: true, name: first };
}

export default sql;

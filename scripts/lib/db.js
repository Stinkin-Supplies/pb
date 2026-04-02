import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: false,
});

pool.on('error', (err) => {
  console.error('[ScriptsDB] Unexpected pool error:', err.message);
});

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
    return pool.query(text, values).then((res) => res.rows);
  }

  return { [IDENTIFIER]: true, name: first };
}

export function getPool() {
  return pool;
}

export default sql;

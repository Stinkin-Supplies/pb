import getCatalogDb from "./catalog";

type SqlValue = unknown;

function buildQuery(strings: TemplateStringsArray, values: SqlValue[]) {
  let text = "";
  const params: SqlValue[] = [];

  for (let i = 0; i < strings.length; i += 1) {
    text += strings[i];
    if (i < values.length) {
      params.push(values[i]);
      text += `$${params.length}`;
    }
  }

  return { text, params };
}

export async function sql(strings: TemplateStringsArray, ...values: SqlValue[]) {
  const db = getCatalogDb();
  const { text, params } = buildQuery(strings, values);
  const result = await db.query(text, params);
  return result.rows;
}


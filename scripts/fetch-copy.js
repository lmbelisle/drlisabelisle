// Airtable → copy.json. Pulls rows from the "Site Copy DLB" table and
// writes a simple { key: text } map the browser reads at page load.
// Only rows with Published=true and a non-empty Text are included;
// everything else falls back to the built-in text baked into the HTML
// (the data-copy-key elements keep their original content if the
// hydrator can't find a matching key, so the site is always shippable
// even if Airtable is unreachable at build time).

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appeL2c4z0YGSi980';
const COPY_TABLE = process.env.AIRTABLE_COPY_TABLE_ID || 'tbl3lFlBEzirhi7zN';

async function airtableList(apiKey, tableId, params = {}) {
  const all = [];
  let offset;
  do {
    const q = new URLSearchParams(params);
    if (offset) q.set('offset', offset);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${q}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable ${tableId} ${res.status}: ${body}`);
    }
    const data = await res.json();
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all;
}

export async function fetchCopy(apiKey) {
  const recs = await airtableList(apiKey, COPY_TABLE, {
    filterByFormula: '{Published}',
  });
  const map = {};
  for (const r of recs) {
    const key = (r.fields.Key || '').trim();
    const text = (r.fields.Text || '').trim();
    if (!key || !text) continue;
    map[key] = text;
  }
  return map;
}

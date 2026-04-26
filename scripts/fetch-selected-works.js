// Airtable → selected-works.json. Pulls rows from the "Selected Works"
// table and writes a JSON file the browser reads at page load.
//
// Mirrors the pattern of fetch-copy.js. If Airtable is unreachable, the
// build script keeps the existing selected-works.json in place so the
// site is always shippable.

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appeL2c4z0YGSi980';
const WORKS_TABLE = process.env.AIRTABLE_WORKS_TABLE_ID || 'tblm99Rpdyz9E0sxx';

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

// Parse the multilineText "Key Passages" cell into structured pull quotes.
// Format per quote: "Quote text" optionally followed by " — Name". Quotes
// are separated by blank lines. Em-dashes inside the quoted prose are
// preserved (the attribution dash must come AFTER the closing quote mark).
function parseKeyPassages(text) {
  if (!text) return [];
  const out = [];
  for (const chunk of text.split(/\n\n+/)) {
    const c = chunk.trim();
    if (!c) continue;
    // Match: opening quote, content, closing quote, optional " — attribution"
    const m = c.match(/^(["\u201c].+?["\u201d])\s*\u2014\s*(.+)$/s);
    let quote, attribution;
    if (m && m[2].trim().length < 60) {
      quote = m[1];
      attribution = m[2].trim();
    } else {
      quote = c;
      attribution = '';
    }
    quote = quote.trim().replace(/^["\u201c]|["\u201d]$/g, '').trim();
    if (quote) out.push({ text: quote, attribution });
  }
  return out;
}

export async function fetchSelectedWorks(apiKey) {
  const recs = await airtableList(apiKey, WORKS_TABLE, { pageSize: '100' });
  const items = [];
  for (const r of recs) {
    const f = r.fields || {};
    const date = f['Publication Date'] || '';
    items.push({
      title: f['Title'] || '',
      outlet: f['Outlet'] || '',
      date,
      year: date.slice(0, 4),
      url: f['URL'] || '',
      backupUrl: f['Backup URL'] || '',
      topic: f['Topic'] || '',
      audience: f['Audience'] || '',
      pillar: f['Pillar'] || '',
      themes: Array.isArray(f['Themes']) ? f['Themes'] : [],
      blurb: f['Site Blurb'] || '',
      status: f['Status'] || 'Active',
      length: typeof f['Length'] === 'number' ? f['Length'] : 0,
      featured: f['Featured'] === true,
      showOnSite: f['Show on Site'] === true,
      keyPassages: parseKeyPassages(f['Key Passages'] || ''),
      fullText: f['Full Text'] || '',
    });
  }
  // Sort newest first
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return {
    generated: new Date().toISOString().slice(0, 10),
    source: 'airtable',
    count: items.length,
    items,
    meta: {
      note: 'Selected published writing of Dr. Lisa Belisle. Source: Airtable Selected Works table; rebuilt by scripts/build-data.js on each Netlify build.',
    },
  };
}

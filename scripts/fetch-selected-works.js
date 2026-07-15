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

// Parse the multilineText "Memoriam Links" cell into structured links.
// Format per line: `Label | URL`. Lines prefixed with `LMR:` are tagged
// kind=lmr (Love Maine Radio episode); the prefix is stripped from the label.
// Other entries are kind=external. Used by the Remembering page entries.
function parseMemoriamLinks(text) {
  if (!text) return [];
  const out = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('|')) continue;
    const idx = trimmed.indexOf('|');
    let label = trimmed.slice(0, idx).trim();
    const url = trimmed.slice(idx + 1).trim();
    if (!url) continue;
    let kind = 'external';
    if (/^lmr:/i.test(label)) {
      kind = 'lmr';
      label = label.replace(/^lmr:\s*/i, '').trim();
    }
    out.push({ label, url, kind });
  }
  return out;
}

// Parse the multilineText "Main People" cell into a clean array of names.
// One name per line. The literal sentinel `—` (lone em dash) means
// "no profile subjects" and is stripped out.
function parseMainPeople(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map(n => n.trim())
    .filter(n => n && n !== '\u2014');
}

export async function fetchSelectedWorks(apiKey) {
  const recs = await airtableList(apiKey, WORKS_TABLE, { pageSize: '100' });
  const items = [];
  for (const r of recs) {
    const f = r.fields || {};
    // Records not marked "Show on Site" never leave this build step. The
    // public JSON is fetched directly by the browser at page load, so
    // excluding hidden pieces here (not just in the page-rendering filters)
    // is what actually keeps their full text off the public site.
    if (f['Show on Site'] !== true) continue;
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
      mainPeople: parseMainPeople(f['Main People'] || ''),
      memoriam: f['Memoriam'] === true,
      memoriamNote: f['Memoriam Note'] || '',
      memoriamPullQuote: f['Memoriam Pull Quote'] || '',
      memoriamPullQuoteAttribution: f['Memoriam Pull Quote Attribution'] || '',
      memoriamLinks: parseMemoriamLinks(f['Memoriam Links'] || ''),
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

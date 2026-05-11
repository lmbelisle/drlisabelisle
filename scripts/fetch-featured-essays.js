// Airtable → featured-essays.json. Pulls Bountiful Path Substack essays from
// the "BP Content" table where Show on Site = TRUE, then enriches each row
// with the Substack post's og:image and og:description so the Reflections
// rotation on writing.html has full card metadata.
//
// The same JSON shape is consumed by bountifulpath.com's home rotation, so
// the BP team can curate one Airtable view and have both sites stay in sync.
//
// Lisa-voice editorial gate: rows are included only when Pull Quote is non
// empty. Lisa fills Pull Quote herself; she does not auto-pull from the post
// body. This keeps the rotation pool aligned with the BP rule that pull
// quotes shown anywhere must be in Lisa's voice.

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appeL2c4z0YGSi980';
const BP_CONTENT_TABLE = process.env.AIRTABLE_BP_CONTENT_TABLE_ID || 'tblIBC4ghLNkD2Nhb';

async function airtableList(apiKey, tableId, params = {}) {
  const all = [];
  let offset;
  do {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach(x => q.append(k, x));
      else q.set(k, v);
    }
    if (offset) q.set('offset', offset);
    const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${q}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
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

// Decode the small set of HTML entities Substack emits in og:* meta tags
// (apostrophe, quote, ampersand, lt, gt, plus numeric forms). Without this,
// the JSON gets entity-encoded strings, the front-end re-escapes them, and
// visitors see literal `&#x27;` text. Restricted to a known whitelist so we
// don't accidentally decode anything that could carry markup.
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function matchMeta(html, prop) {
  const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : '';
}

async function fetchSubstackMeta(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'DrLisaBelisleSync/1.0' } });
    if (!r.ok) return {};
    const html = await r.text();
    return {
      image: matchMeta(html, 'og:image'),
      description: matchMeta(html, 'og:description'),
      title: matchMeta(html, 'og:title'),
    };
  } catch {
    return {};
  }
}

function pickEyebrow(f) {
  const title = f['Bountiful Path Title'] || '';
  if (/^Books on the Boat/i.test(title)) return 'Books on the Boat';
  if (f['BP Type']) {
    return typeof f['BP Type'] === 'object' ? f['BP Type'].name : f['BP Type'];
  }
  return 'Essay';
}

export async function fetchFeaturedEssays(apiKey) {
  const recs = await airtableList(apiKey, BP_CONTENT_TABLE, {
    filterByFormula: '{Show on Site} = TRUE()',
    'fields[]': [
      'Bountiful Path Title',
      'BP Published URL',
      'Pull Quote',
      'Featured',
      'Date',
      'BP Type',
    ],
    'sort[0][field]': 'Date',
    'sort[0][direction]': 'desc',
  });

  const essays = [];
  for (const r of recs) {
    const f = r.fields;
    if (!f['Pull Quote'] || !f['BP Published URL']) continue;

    const meta = await fetchSubstackMeta(f['BP Published URL']);
    essays.push({
      title: f['Bountiful Path Title'] || meta.title || '',
      url: f['BP Published URL'],
      quote: f['Pull Quote'],
      eyebrow: pickEyebrow(f),
      subtitle: meta.description || '',
      image: meta.image || '',
      featured: !!f['Featured'],
      date: f['Date'] || '',
    });
  }
  return essays;
}

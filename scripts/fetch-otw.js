// Airtable → otw-pieces.json. Pulls Lisa-authored Off the Wall Art Magazine
// pieces from the PAG "Artist Bios & Content Hub" base and writes a JSON
// file the writing.html browser code reads to render the Off the Wall
// section.
//
// Lives in a different Airtable base than the other drlisa fetchers (the
// PAG base, not Bountiful Path Content Library). Mirrors the pattern of
// fetch-selected-works.js.
//
// Author filter: includes records where Author is empty (default = Lisa)
// or explicitly "Lisa Belisle". Excludes "Other" or "Unknown". This lets
// Lisa keep republished PAG bios off her personal site by tagging the
// Author field once in Airtable.

const PAG_BASE_ID = process.env.AIRTABLE_PAG_BASE_ID || 'appssefs1ffPNnDZl';
const ARTISTS_TABLE = process.env.AIRTABLE_PAG_ARTISTS_TABLE_ID || 'tblXO4g5x2TFMtQwz';

async function airtableList(apiKey, baseId, tableId, params = {}) {
  const all = [];
  let offset;
  do {
    const q = new URLSearchParams(params);
    if (offset) q.set('offset', offset);
    const url = `https://api.airtable.com/v0/${baseId}/${tableId}?${q}`;
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

function displayName(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.includes(',')) {
    const [last, first] = s.split(',').map(p => p.trim());
    return `${first} ${last}`.replace(/\s+/g, ' ').trim();
  }
  return s;
}

function extractTitle(draft, url) {
  if (draft) {
    const first = String(draft).split('\n').find(l => l.trim());
    if (first && first.length < 120) return first.trim();
  }
  if (url) {
    const slug = String(url).replace(/\/$/, '').split('/').pop() || '';
    return slug
      .split('-')
      .filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1))
      .join(' ');
  }
  return '';
}

function extractExcerpt(draft) {
  if (!draft) return '';
  const paras = String(draft).split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (paras.length < 2) return '';
  const ex = paras[1];
  if (ex.length > 280) return ex.slice(0, 277).trimEnd() + '…';
  return ex;
}

function extractPullQuote(draft) {
  if (!draft) return '';
  const text = String(draft);
  // Prefer 40+-char fragments (sentence-length); fall back to 20+.
  let m = text.match(/[“"]([^“”"]{40,200})[”"]/);
  if (m) return m[1].trim();
  m = text.match(/[“"]([^“”"]{20,200})[”"]/);
  return m ? m[1].trim() : '';
}

async function fetchOgImage(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return '';
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1] : '';
  } catch (e) {
    return '';
  }
}

function videoIdFromUrl(url) {
  if (!url) return '';
  const first = String(url).split(/\s+/).find(p => /https?:/.test(p)) || String(url);
  const m = first.match(/(?:v=|youtu\.be\/|\/embed\/)([\w-]{6,})/);
  return m ? m[1] : '';
}

export async function fetchOtwPieces(apiKey) {
  const recs = await airtableList(apiKey, PAG_BASE_ID, ARTISTS_TABLE, {
    pageSize: '100',
  });
  const items = [];
  for (const r of recs) {
    const f = r.fields || {};
    const otwUrl = f['OTW Published URL'];
    if (!otwUrl) continue;
    // Author filter: empty or "Lisa Belisle" only.
    const author = (f['Author'] || '').trim();
    if (author && author !== 'Lisa Belisle') continue;
    const artistName = displayName(f['Artist Name']);
    if (!artistName) continue;
    const draft = f['OTW Draft'] || '';
    const rmUrl = f['Radio Maine URL'] || '';
    items.push({
      artistName,
      otwUrl,
      otwTitle: extractTitle(draft, otwUrl),
      otwExcerpt: extractExcerpt(draft),
      otwPullQuote: extractPullQuote(draft),
      image: '', // filled in below from each Substack post's og:image
      rmYoutubeUrl: rmUrl ? rmUrl.split(/\s+/)[0] : '',
      rmVideoId: videoIdFromUrl(rmUrl),
      pagUrl: f['PAG/ArtCloud URL'] || '',
      author: author || 'Lisa Belisle',
      createdTime: r.createdTime || '',
    });
  }
  // Fetch OG images in parallel batches.
  const concurrency = 8;
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(async (it) => { it.image = await fetchOgImage(it.otwUrl); }));
  }
  items.sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''));
  return {
    generated: new Date().toISOString().slice(0, 10),
    source: 'airtable',
    count: items.length,
    items,
    meta: {
      note: 'Lisa-authored Off the Wall Art Magazine pieces. Source: PAG Airtable Artists table; rebuilt by scripts/build-data.js on each Netlify build.',
    },
  };
}

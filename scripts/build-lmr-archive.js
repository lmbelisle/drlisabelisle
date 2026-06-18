/**
 * build-lmr-archive.js
 *
 * Generates per-episode HTML pages + index for the Love Maine Radio archive
 * at https://drlisabelisle.com/love-maine-radio/
 *
 * Data sources:
 *   - Airtable LMR Archive (base appeL2c4z0YGSi980, table tblZRvEIaMvexcEoC)
 *   - mentioned_block.json (per-episode crosslinks, committed to repo)
 *
 * Outputs:
 *   /love-maine-radio/{slug}.html  — one per non-quarantined episode (~387)
 *   /love-maine-radio/index.html   — chronological archive index
 *
 * Run as part of the Netlify build pipeline alongside scripts/build-data.js.
 *
 * Drop this into the bountifulpath or drlisabelisle.com repo's scripts/ dir.
 * Pre-reqs: API_KEY in env, AIRTABLE_BASE_ID = appeL2c4z0YGSi980,
 *           node-fetch or built-in fetch (Node 18+).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appeL2c4z0YGSi980';
const LMR_TABLE_ID = 'tblZRvEIaMvexcEoC';
const SW_TABLE_ID = 'tblm99Rpdyz9E0sxx';
const API_KEY = process.env.AIRTABLE_API_KEY;
const OUTPUT_DIR = process.env.LMR_OUT_DIR || './love-maine-radio';
const SITE_URL = 'https://drlisabelisle.com';
const CROSSLINKS_PATH = process.env.LMR_CROSSLINKS || './data/lmr-mentioned-block.json';

const REBRAND_DATE = '2014-11-01';

function escapeHTML(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/#\d+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchAirtable(tableId, opts = {}) {
  const records = [];
  let offset = '';
  do {
    const params = new URLSearchParams({ pageSize: '100', ...(offset ? { offset } : {}) });
    const url = `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    const data = await r.json();
    records.push(...(data.records || []));
    offset = data.offset || '';
  } while (offset);
  return records;
}

function humanDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function isPreRebrand(airDate) {
  return airDate && airDate < REBRAND_DATE;
}

function durationISO(secs) {
  if (!secs) return undefined;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `PT${m}M${s}S`;
}

/**
 * Transcript renderer.
 * The Cleaned Transcript (Web) field uses the format:
 *   Speaker Name:
 *   body paragraph
 *
 *   Next Speaker:
 *   body paragraph
 *
 * Split on double-newline. First line of each block ending in : is the
 * speaker; the rest is body. Strip any (MM:SS) timestamps if present.
 */
function renderTranscript(webText) {
  if (!webText) return '';
  const stripped = webText
    .replace(/(^|\n)[\(\[]\d{1,2}:\d{2}(?::\d{2})?[\)\]]:?[ \t]*(?=\n|$)/g, '$1')
    .replace(/:\s*[\(\[]\d{1,2}:\d{2}(?::\d{2})?[\)\]]\s*:/g, ':')
    .replace(/\s*[\(\[]\d{1,2}:\d{2}(?::\d{2})?[\)\]]/g, '');
  const blocks = stripped.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  return blocks.map(b => {
    const lines = b.split('\n');
    const first = lines[0] || '';
    const speakerMatch = first.match(/^(.+?):\s*$/);
    if (speakerMatch) {
      const speaker = speakerMatch[1];
      const body = lines.slice(1).join(' ').trim();
      return `<div class="lmr-turn"><p class="lmr-turn-speaker">${escapeHTML(speaker)}:</p><p>${escapeHTML(body)}</p></div>`;
    }
    return `<div class="lmr-turn"><p>${escapeHTML(b)}</p></div>`;
  }).join('\n');
}

function renderMentionedBlock(mentioned, memorial) {
  if (!mentioned) return '';
  const parts = [];
  parts.push('<section class="lmr-mentioned"><h2>Mentioned in this episode</h2>');

  // Featured cards
  for (const card of mentioned.ecosystem || []) {
    parts.push('<div class="lmr-mention-card">');
    parts.push(`<p class="lmr-mention-name">${escapeHTML(card.name)}</p>`);
    if (card.note) parts.push(`<p class="lmr-mention-note">${escapeHTML(card.note)}</p>`);
    for (const link of card.links || []) {
      parts.push(`<a class="lmr-mention-link" href="${escapeHTML(link.href)}">${escapeHTML(link.label || 'Link')}</a>`);
    }
    parts.push('</div>');
  }

  // More-from-guest rows
  for (const gl of mentioned.guest_links || []) {
    const links = (gl.links || []).map(l =>
      `<a href="${escapeHTML(l.href)}" class="lmr-mention-link">${escapeHTML(l.label || 'link')}</a>`
    ).join(' <span class="lmr-mention-sep">·</span> ');
    parts.push(`<p class="lmr-mention-row"><span class="lmr-mention-row-label">More from ${escapeHTML(gl.guest)}:</span> ${links}</p>`);
  }

  // Also-referenced row
  if (mentioned.also_referenced && mentioned.also_referenced.length) {
    const links = mentioned.also_referenced
      .filter(ar => ar.href)
      .map(ar => `<a href="${escapeHTML(ar.href)}" class="lmr-mention-link">${escapeHTML(ar.name)}</a>`)
      .join(' <span class="lmr-mention-sep">·</span> ');
    if (links) {
      parts.push(`<p class="lmr-mention-row"><span class="lmr-mention-row-label">Also referenced:</span> ${links}</p>`);
    }
  }

  parts.push('</section>');
  return parts.join('\n');
}

function renderMemorial(memorial) {
  if (!memorial) return '';
  return `<p class="lmr-memorial">In memoriam: ${escapeHTML(memorial.name)}, ${memorial.born}–${memorial.died}. Remembered on <a href="${SITE_URL}/remembering">drlisabelisle.com/remembering</a>.</p>`;
}

function renderSchemaLD(ep, crosslinks, slug, audioUrl) {
  const pageUrl = `${SITE_URL}/love-maine-radio/${slug}.html`;
  const mentions = [];

  // Combine ecosystem + also_referenced + grounding into mentions[]
  for (const card of (crosslinks?.mentioned?.ecosystem) || []) {
    for (const link of card.links || []) {
      mentions.push({ '@type': 'Person', name: card.name, url: link.href });
    }
  }
  for (const ar of (crosslinks?.mentioned?.also_referenced) || []) {
    if (ar.href) mentions.push({ '@type': ar.type || 'Organization', name: ar.name, url: ar.href });
  }
  for (const g of (crosslinks?.mentioned?.grounding) || []) {
    if (g.href) mentions.push({ '@type': g.type || 'Person', name: g.name, sameAs: g.href });
  }

  const guests = (ep.guests || '').split(',').map(g => g.trim()).filter(Boolean);

  const graph = [
    {
      '@type': 'PodcastEpisode',
      '@id': `${pageUrl}#episode`,
      name: ep.title,
      episodeNumber: ep.episodeNumber || undefined,
      datePublished: ep.airDate,
      description: ep.webSummary || ep.description,
      url: pageUrl,
      duration: durationISO(ep.audioDuration),
      partOfSeries: {
        '@type': 'PodcastSeries',
        '@id': `${SITE_URL}/love-maine-radio/#series`,
        name: 'Love Maine Radio',
        alternateName: ['The Dr. Lisa Radio Hour & Podcast', 'Dr. Lisa Radio Hour'],
      },
      associatedMedia: { '@id': `${pageUrl}#audio` },
      mentions: mentions.length ? mentions : undefined,
    },
    {
      '@type': 'AudioObject',
      '@id': `${pageUrl}#audio`,
      contentUrl: audioUrl,
      encodingFormat: 'audio/mpeg',
      duration: durationISO(ep.audioDuration),
    },
    {
      '@type': 'Person',
      '@id': `${SITE_URL}/#lisa`,
      name: 'Dr. Lisa Belisle',
      jobTitle: 'Host',
    },
    ...guests.map(name => ({ '@type': 'Person', name })),
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Love Maine Radio', item: `${SITE_URL}/love-maine-radio/` },
        { '@type': 'ListItem', position: 3, name: ep.title },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': pageUrl,
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['.lmr-pull-quote blockquote', '.lmr-summary p'],
      },
    },
  ];

  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

function renderEpisodePage(ep, crosslinks) {
  const slug = slugify(ep.title);
  const pageUrl = `${SITE_URL}/love-maine-radio/${slug}.html`;
  const subhead = isPreRebrand(ep.airDate)
    ? '<p class="lmr-subhead">Originally aired as The Dr. Lisa Radio Hour &amp; Podcast</p>'
    : '';

  const pullQuoteBlock = ep.headlineQuote
    ? `<section class="lmr-pull-quote"><blockquote>${escapeHTML(ep.headlineQuote)}</blockquote></section>`
    : '';

  const audioBlock = ep.audioUrl
    ? `<audio src="${escapeHTML(ep.audioUrl)}" controls preload="none">Your browser does not support audio.</audio>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHTML(ep.title)} — Love Maine Radio</title>
<meta name="description" content="${escapeHTML((ep.webSummary || '').slice(0, 200))}">
<link rel="canonical" href="${pageUrl}">
<meta property="og:title" content="${escapeHTML(ep.title)}">
<meta property="og:description" content="${escapeHTML((ep.webSummary || '').slice(0, 200))}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="article">
<link rel="stylesheet" href="/love-maine-radio/lmr.css">
${renderSchemaLD(ep, crosslinks, slug, ep.audioUrl)}
</head>
<body>
<main class="lmr-page">
<header class="lmr-header">
<p class="lmr-eyebrow">LOVE MAINE RADIO${ep.episodeNumber ? ` · EPISODE ${ep.episodeNumber}` : ''}${ep.airDate ? ` · ${humanDate(ep.airDate).toUpperCase()}` : ''}</p>
${subhead}
<h1>${escapeHTML(ep.title)}</h1>
${renderMemorial(crosslinks?.memorial)}
</header>
${pullQuoteBlock}
${audioBlock}
<section class="lmr-summary">
<h2>Episode summary</h2>
<p>${escapeHTML(ep.webSummary || ep.description || '')}</p>
</section>
<section class="lmr-transcript">
<h2>Transcript</h2>
<div class="lmr-transcript-body">
${renderTranscript(ep.cleanedTranscriptWeb)}
</div>
</section>
${renderMentionedBlock(crosslinks?.mentioned, crosslinks?.memorial)}
<footer class="lmr-archive-footer">
<p>Part of the <a href="/love-maine-radio/">Love Maine Radio archive</a> (2011–2018).</p>
</footer>
</main>
</body>
</html>`;
  return { slug, html };
}

function renderIndex(episodes) {
  const items = episodes
    .filter(e => !e.quarantine)
    .sort((a, b) => (a.airDate || '').localeCompare(b.airDate || ''))
    .map(e => {
      const slug = slugify(e.title);
      const date = humanDate(e.airDate);
      const guests = (e.guests || '').split(',').map(g => g.trim()).filter(Boolean).join(', ');
      return `<li class="lmr-index-item">
<a href="/love-maine-radio/${slug}.html">
<span class="lmr-index-epn">${e.episodeNumber ? `#${e.episodeNumber}` : ''}</span>
<span class="lmr-index-title">${escapeHTML(e.title)}</span>
<span class="lmr-index-date">${date}</span>
${guests ? `<span class="lmr-index-guests">${escapeHTML(guests)}</span>` : ''}
</a>
</li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Love Maine Radio archive (2011–2018)</title>
<meta name="description" content="The complete archive of Love Maine Radio, the show that aired from 2011 to 2018, hosted by Dr. Lisa Belisle. Originally The Dr. Lisa Radio Hour &amp; Podcast.">
<link rel="canonical" href="${SITE_URL}/love-maine-radio/">
<link rel="stylesheet" href="/love-maine-radio/lmr.css">
</head>
<body>
<main class="lmr-index-page">
<header>
<h1>Love Maine Radio</h1>
<p class="lmr-index-intro">Love Maine Radio (2011–2018), originally The Dr. Lisa Radio Hour &amp; Podcast. The current show is <a href="https://radiomaine.com">Radio Maine</a>, which began in 2021.</p>
</header>
<ul class="lmr-index-list">
${items}
</ul>
</main>
</body>
</html>`;
}

async function main() {
  if (!API_KEY) {
    console.error('Missing AIRTABLE_API_KEY');
    process.exit(1);
  }

  console.log('Fetching LMR Archive records...');
  const raw = await fetchAirtable(LMR_TABLE_ID);
  console.log(`  ${raw.length} records`);

  const episodes = raw.map(r => ({
    recordId: r.id,
    title: r.fields['Title'],
    episodeNumber: r.fields['Episode #'],
    airDate: r.fields['Air Date'],
    description: r.fields['Description'],
    guests: r.fields['Guests'],
    audioUrl: r.fields['Audio URL'],
    headlineQuote: r.fields['Headline Quote'],
    cleanedTranscriptWeb: r.fields['Cleaned Transcript (Web)'],
    webSummary: r.fields['Web Summary'],
    quarantine: r.fields['Quarantine'],
    webEdited: r.fields['Web Edited'],
    audioDuration: r.fields['Audio Duration (sec)'],
  }));

  console.log('Loading mentioned-block crosslinks...');
  const crosslinksArr = JSON.parse(fs.readFileSync(CROSSLINKS_PATH, 'utf8'));
  const crosslinksByRid = Object.fromEntries(crosslinksArr.map(c => [c.recordId, c]));
  console.log(`  ${Object.keys(crosslinksByRid).length} crosslink entries`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Episode pages
  let written = 0;
  for (const ep of episodes) {
    if (ep.quarantine) continue;
    if (!ep.cleanedTranscriptWeb) continue;
    const crosslinks = crosslinksByRid[ep.recordId];
    const { slug, html } = renderEpisodePage(ep, crosslinks);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${slug}.html`), html);
    written++;
  }
  console.log(`  ${written} episode pages written`);

  // Index page
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), renderIndex(episodes));
  console.log('  index.html written');

  console.log('Done.');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { renderEpisodePage, renderIndex, slugify };

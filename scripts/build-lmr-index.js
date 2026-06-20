/**
 * build-lmr-index.js
 *
 * Re-renders love-maine-radio/index.html with episodes grouped by year +
 * a sticky year-jump nav. Reads existing per-episode HTML files in
 * love-maine-radio/ as the source of truth (no Airtable token needed).
 *
 * For each {slug}.html we pull title, episodeNumber, datePublished, and
 * guest names from the embedded JSON-LD. Pages are grouped by year, sorted
 * chronologically within each year, then rendered into one index.html.
 *
 * Run: node scripts/build-lmr-index.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '..', 'love-maine-radio');

function escapeHTML(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function humanDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function pullJsonLd(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function readEpisode(slug) {
  const file = path.join(OUTPUT_DIR, `${slug}.html`);
  const html = fs.readFileSync(file, 'utf8');
  const jsonld = pullJsonLd(html);
  if (!jsonld) return null;
  const ep = (jsonld['@graph'] || []).find(n => n['@type'] === 'PodcastEpisode');
  if (!ep) return null;
  const guests = (jsonld['@graph'] || [])
    .filter(n => n['@type'] === 'Person' && !n.jobTitle)
    .map(n => n.name);
  return {
    slug,
    title: ep.name,
    episodeNumber: ep.episodeNumber,
    airDate: ep.datePublished,
    guests,
  };
}

function renderIndex(episodes) {
  const byYear = new Map();
  for (const e of episodes) {
    if (!e || !e.airDate) continue;
    const year = e.airDate.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(e);
  }
  for (const yr of byYear.keys()) {
    byYear.get(yr).sort((a, b) => (a.airDate || '').localeCompare(b.airDate || ''));
  }
  const years = [...byYear.keys()].sort();

  const yearNav = years
    .map(y => `<a class="lmr-year-jump" href="#y${y}">${y}<span class="lmr-year-count">${byYear.get(y).length}</span></a>`)
    .join('');

  const sections = years.map(y => {
    const items = byYear.get(y).map(e => `<li class="lmr-index-item">
<a href="/love-maine-radio/${e.slug}.html">
<span class="lmr-index-epn">${e.episodeNumber ? `#${e.episodeNumber}` : ''}</span>
<span class="lmr-index-title">${escapeHTML(e.title)}</span>
<span class="lmr-index-date">${humanDate(e.airDate)}</span>
${e.guests.length ? `<span class="lmr-index-guests">${escapeHTML(e.guests.join(', '))}</span>` : ''}
</a>
</li>`).join('\n');
    return `<section class="lmr-year-section" id="y${y}">
<h2 class="lmr-year-heading">${y} <span class="lmr-year-heading-count">${byYear.get(y).length} episodes</span></h2>
<ul class="lmr-index-list">
${items}
</ul>
</section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Love Maine Radio: Selected Episodes</title>
<meta name="description" content="Selected episodes from Love Maine Radio (2011–2018), hosted by Dr. Lisa Belisle. Originally The Dr. Lisa Radio Hour &amp; Podcast. The current show is Radio Maine, which began in 2021.">
<link rel="canonical" href="https://drlisabelisle.com/love-maine-radio/">
<link rel="stylesheet" href="/love-maine-radio/lmr.css">
</head>
<body>
<main class="lmr-index-page">
<header class="lmr-index-header">
<img src="/love-maine-radio/img/lmr-logo.png" alt="Love Maine Radio" class="lmr-index-logo" width="180" height="178">
<h1 class="lmr-index-h1-visually-hidden">Love Maine Radio: Selected Episodes</h1>
<p class="lmr-index-intro">A curated selection from Love Maine Radio (2011–2018), originally The Dr. Lisa Radio Hour &amp; Podcast. The current show is <a href="https://radiomaine.com">Radio Maine</a>, which began in 2021.</p>
</header>
<nav class="lmr-year-nav" aria-label="Jump to year">
${yearNav}
</nav>
${sections}
</main>
</body>
</html>`;
}

function main() {
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html');
  const episodes = files.map(f => {
    try { return readEpisode(f.replace(/\.html$/, '')); }
    catch { return null; }
  }).filter(Boolean);
  console.log(`Read ${episodes.length} episodes`);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), renderIndex(episodes));
  console.log('Wrote love-maine-radio/index.html');
}

main();

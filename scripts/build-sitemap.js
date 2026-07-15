// Generates sitemap.xml for drlisabelisle.com.
//
// The previous sitemap.xml was hand-maintained and listed only the static
// pages plus the love-maine-radio/ archive. It silently omitted all 89
// Selected Works essay pages in writing/, leaving a large canonical body of
// work invisible to search. This script rebuilds the sitemap from the sources
// of truth so writing/ can never fall out of it again:
//
//   - static pages: the fixed list below
//   - writing/ essays: selected-works.json (canonical slugs + dates)
//   - love-maine-radio/ pages: the .html files actually on disk
//
// Run after generate-selected-works-pages.js:
//   node scripts/build-sitemap.js

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ORIGIN = 'https://drlisabelisle.com';

// Match the slugify used by generate-selected-works-pages.js exactly, so the
// URLs in the sitemap point at the files that generator writes.
function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/['‘’‚‛′]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

// Static pages with their editorial priorities (preserved from the prior
// hand-maintained sitemap).
const STATIC = [
  { path: '/',               changefreq: 'monthly', priority: '1.0' },
  { path: '/writing.html',   changefreq: 'weekly',  priority: '0.9' },
  { path: '/podcast.html',   changefreq: 'weekly',  priority: '0.9' },
  { path: '/speaking.html',  changefreq: 'monthly', priority: '0.9' },
  { path: '/events.html',    changefreq: 'weekly',  priority: '0.9' },
  { path: '/about.html',     changefreq: 'monthly', priority: '0.9' },
  { path: '/contact.html',   changefreq: 'monthly', priority: '0.8' },
  { path: '/remembering.html', changefreq: 'monthly', priority: '0.7' },
];

function urlBlock({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${ORIGIN}${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

async function main() {
  const today = process.env.SITEMAP_DATE || '2026-04-26'; // static-page fallback lastmod
  const blocks = [];

  for (const s of STATIC) {
    blocks.push(urlBlock({ loc: s.path, lastmod: today, changefreq: s.changefreq, priority: s.priority }));
  }

  // Writing essays: canonical slugs + dates from selected-works.json. These are
  // evergreen, so changefreq yearly, priority 0.7.
  const sw = JSON.parse(await readFile(join(REPO_ROOT, 'selected-works.json'), 'utf8'));
  const essays = (sw.items || [])
    .filter(it => it.fullText && it.fullText.trim().length > 0 && it.showOnSite)
    .map(it => ({ slug: slugify(it.title), date: it.date }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const e of essays) {
    blocks.push(urlBlock({ loc: `/writing/${e.slug}.html`, lastmod: e.date || today, changefreq: 'yearly', priority: '0.7' }));
  }

  // Love Maine Radio: whatever HTML is actually on disk.
  const lmrLastmod = await lmrLastmod_();
  const lmrFiles = (await readdir(join(REPO_ROOT, 'love-maine-radio')))
    .filter(f => f.endsWith('.html'))
    .sort();
  for (const f of lmrFiles) {
    blocks.push(urlBlock({ loc: `/love-maine-radio/${f}`, lastmod: lmrLastmod, changefreq: 'yearly', priority: '0.6' }));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${blocks.join('\n')}
</urlset>
`;

  await writeFile(join(REPO_ROOT, 'sitemap.xml'), xml, 'utf8');
  console.log(`build-sitemap: ${STATIC.length} static + ${essays.length} writing + ${lmrFiles.length} love-maine-radio = ${blocks.length} URLs.`);

  // Also refresh the crawlable <noscript> link list in writing.html, so the
  // writing/ mirror pages are reachable by search engines without JavaScript.
  await updateWritingCrawlLinks(sw);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function updateWritingCrawlLinks(sw) {
  const path = join(REPO_ROOT, 'writing.html');
  let html;
  try { html = await readFile(path, 'utf8'); } catch { return; }
  const START = '<!-- ARCHIVE-LINKS:START -->';
  const END = '<!-- ARCHIVE-LINKS:END -->';
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s < 0 || e < 0 || e < s) {
    console.warn('build-sitemap: ARCHIVE-LINKS markers not found in writing.html; skipping crawl links.');
    return;
  }
  const items = (sw.items || [])
    .filter(it => it.fullText && it.fullText.trim().length > 0 && it.showOnSite)
    .map(it => ({ slug: slugify(it.title), title: it.title }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const links = items
    .map(it => `        <li><a href="writing/${it.slug}.html">${esc(it.title)}</a></li>`)
    .join('\n');
  const next = html.slice(0, s + START.length) + '\n' + links + '\n        ' + html.slice(e);
  await writeFile(path, next, 'utf8');
  console.log(`build-sitemap: wrote ${items.length} crawlable links into writing.html.`);
}

async function lmrLastmod_() {
  try {
    const d = JSON.parse(await readFile(join(REPO_ROOT, 'data', 'lmr-selected-episodes.json'), 'utf8'));
    return d._lastUpdated || '2026-06-17';
  } catch {
    return '2026-06-17';
  }
}

main().catch(err => {
  console.error('build-sitemap failed:');
  console.error(err);
  process.exit(1);
});

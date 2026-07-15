// Generates static mirror pages for every Selected Works item with full text.
//
// Reads selected-works.json, emits writing/[slug].html for every item where
// fullText is populated and showOnSite is true. Designed to run after the
// fetch-selected-works step in build-data.js so pages stay in sync with
// Airtable.
//
// Each generated page is a stable, BP-ecosystem-controlled landing for a
// piece originally published at Maine Magazine (or another external outlet).
// The original outlet URL appears as a secondary "Originally published"
// link; if Airtable carries a Wayback URL, that ships as a fallback. Pieces
// flagged memoriam=true render the memorial note above the body.
//
// To regenerate after editing this script or selected-works.json:
//   node scripts/generate-selected-works-pages.js

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_DIR = join(REPO_ROOT, 'writing');

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    // Strip apostrophe variants (straight, curly left/right, low-9, prime)
    .replace(/['‘’‚‛′]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (!y || !m) return iso;
  if (!d) return `${months[m-1]} ${y}`;
  return `${months[m-1]} ${d}, ${y}`;
}

function paragraphsFrom(raw) {
  if (!raw) return [];
  let paras = raw.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (paras.length <= 1) {
    // Fall back to grouping sentences
    paras = raw
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .reduce((acc, s, i) => {
        const idx = Math.floor(i / 4);
        acc[idx] = (acc[idx] || '') + s + ' ';
        return acc;
      }, [])
      .map(p => p.trim())
      .filter(Boolean);
  }
  return paras;
}

function renderPullQuoteHTML(p) {
  const cite = p.attribution ? `<cite>&mdash; ${escapeHTML(p.attribution)}</cite>` : '';
  // Share button copies the quote + attribution + page URL when clicked.
  const shareBtn = `<button class="work-pullquote-share" type="button" aria-label="Copy this quote" data-text="${escapeHTML(p.text)}"${p.attribution ? ` data-attribution="${escapeHTML(p.attribution)}"` : ''}>↗</button>`;
  return `<blockquote class="work-pullquote">${shareBtn}&ldquo;${escapeHTML(p.text)}&rdquo;${cite}</blockquote>`;
}

// Try to find which paragraph index in `paragraphs` most strongly matches `passageText`.
// Returns -1 if no good match. Uses simple substring + token-overlap.
function findBestParagraphIndex(paragraphs, passageText) {
  if (!passageText || paragraphs.length === 0) return -1;
  const target = passageText.toLowerCase();

  // 1. Direct substring on a meaningful chunk of the passage
  const chunk = target.slice(0, Math.min(60, target.length));
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].toLowerCase().includes(chunk)) return i;
  }

  // 2. Token-overlap fallback
  const targetTokens = new Set(target.split(/\W+/).filter(t => t.length > 4));
  let bestScore = 0;
  let bestIdx = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    const pTokens = new Set(paragraphs[i].toLowerCase().split(/\W+/).filter(t => t.length > 4));
    let overlap = 0;
    for (const t of targetTokens) if (pTokens.has(t)) overlap++;
    if (overlap > bestScore && overlap >= 4) {
      bestScore = overlap;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Pull quoted sentences out of the body. A quoted sentence is text wrapped in
// curly or straight double quotes within a paragraph. We pair each with the
// "says X" / "explains X" attribution that immediately follows it when present.
function extractQuotesFromBody(paragraphs) {
  const out = [];
  // Match curly-double, straight-double, or smart-quote pairs.
  const re = /[“"]([^”"]{40,360})[”"](?:[\s,]+(?:says|said|explains|explained|notes|adds|tells|recalled|recalls|asks|asked)\s+(?:Dr\.?\s+)?([A-Z][A-Za-z'\-.]*(?:\s+[A-Z][A-Za-z'\-.]*){0,2}))?/g;
  paragraphs.forEach((para, idx) => {
    let m;
    while ((m = re.exec(para)) !== null) {
      const text = m[1].trim();
      const attribution = (m[2] || '').trim();
      // Skip obviously-short or over-shouty fragments.
      if (text.length < 50) continue;
      if (text.split(/\s+/).length < 8) continue;
      out.push({ text, attribution, paraIdx: idx });
    }
  });
  return out;
}

// Build the body with pull quotes interspersed at natural points.
// Returns an HTML string with <p> and <blockquote> elements interleaved.
function renderBodyWithPullQuotes(paragraphs, passages) {
  if (paragraphs.length === 0) return '';

  // Build a tokenized fingerprint of the first 2 paragraphs so we can reject
  // candidate pull quotes that just echo the opening (which is already in
  // the body, often with a drop cap).
  const openingFingerprint = (paragraphs.slice(0, 2).join(' ') || '').toLowerCase();

  function overlapsOpening(text) {
    const t = text.toLowerCase();
    const head = t.slice(0, Math.min(50, t.length));
    if (head.length >= 30 && openingFingerprint.includes(head)) return true;
    return false;
  }

  // Layer 1: Airtable keyPassages (curated quotes), minus any that echo the opening.
  let candidates = (Array.isArray(passages) ? passages : [])
    .filter(p => p && p.text && p.text.length >= 40 && p.text.length <= 360)
    .filter(p => !overlapsOpening(p.text));

  // Layer 2: if nothing usable, scan the body for quoted lines in middle paragraphs.
  if (candidates.length === 0) {
    const middleQuotes = extractQuotesFromBody(paragraphs)
      .filter(q => q.paraIdx >= 1 && q.paraIdx <= paragraphs.length - 2)
      .filter(q => !overlapsOpening(q.text));
    candidates = middleQuotes;
  }

  // Decide how many pull quotes to use based on article length.
  const targetCount = paragraphs.length >= 16 ? Math.min(3, candidates.length)
                    : paragraphs.length >= 10 ? Math.min(2, candidates.length)
                    : paragraphs.length >= 6  ? Math.min(1, candidates.length)
                    : 0;
  if (targetCount === 0) {
    return paragraphs.map(p => `<p>${escapeHTML(p)}</p>`).join('\n');
  }

  // Resolve each candidate to a paragraph index, dedupe, keep first targetCount.
  const placements = []; // [{passage, afterParaIdx}]
  const usedParaIdx = new Set();
  for (const passage of candidates) {
    if (placements.length >= targetCount) break;
    const idx = findBestParagraphIndex(paragraphs, passage.text);
    if (idx < 0) continue;
    // Don't place at the very first or very last paragraph.
    if (idx <= 0 || idx >= paragraphs.length - 1) continue;
    if (usedParaIdx.has(idx) || usedParaIdx.has(idx - 1) || usedParaIdx.has(idx + 1)) continue;
    placements.push({ passage, afterParaIdx: idx });
    usedParaIdx.add(idx);
  }

  // If no placements landed (e.g., passages don't map), fall back to evenly spaced quotes.
  if (placements.length === 0 && candidates.length > 0) {
    const span = Math.max(1, Math.floor(paragraphs.length / (targetCount + 1)));
    for (let i = 0; i < targetCount && i < candidates.length; i++) {
      placements.push({ passage: candidates[i], afterParaIdx: span * (i + 1) - 1 });
    }
  }

  // Sort placements by para index ascending.
  placements.sort((a, b) => a.afterParaIdx - b.afterParaIdx);

  // Compute section-divider positions for long articles. We add an
  // ornamental three-dot divider once or twice in articles with enough
  // paragraphs, but never adjacent to a pull quote.
  const dividerIndices = new Set();
  if (paragraphs.length >= 14) {
    const dividerCount = paragraphs.length >= 22 ? 2 : 1;
    const stride = Math.floor(paragraphs.length / (dividerCount + 1));
    const taken = new Set(placements.map(p => p.afterParaIdx));
    for (let n = 1; n <= dividerCount; n++) {
      let idx = stride * n - 1;
      // Avoid placing a divider next to a pull quote or at the boundaries.
      while (idx > 0 && idx < paragraphs.length - 1 && (taken.has(idx) || taken.has(idx - 1) || taken.has(idx + 1) || dividerIndices.has(idx))) {
        idx++;
      }
      if (idx > 0 && idx < paragraphs.length - 1) {
        dividerIndices.add(idx);
      }
    }
  }

  // Render the first paragraph: drop cap + small-caps lead-in on the next 3 words.
  function renderFirstParagraph(raw) {
    const text = raw;
    // The drop cap is the first letter (CSS ::first-letter handles it).
    // We want a small-caps span around the next ~3 words after the first letter.
    // Detect the first letter's length (could be multi-byte in unicode but normally 1 char)
    // and find a span that covers the following ~3 words but starts AFTER the first letter
    // so that ::first-letter still wins.
    const firstChar = text.charAt(0);
    const rest = text.slice(1);
    // Match the next 3 words (allowing for the small space already after the first letter).
    const m = rest.match(/^(\s*)(\S+(?:\s+\S+){0,2})/);
    if (!m) return `<p class="work-body-first">${escapeHTML(text)}</p>`;
    const leadin = m[2];
    const after = rest.slice(m[0].length);
    return `<p class="work-body-first">${escapeHTML(firstChar)}${escapeHTML(m[1])}<span class="work-body-leadin">${escapeHTML(leadin)}</span>${escapeHTML(after)}</p>`;
  }

  // Stitch the body.
  const out = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (i === 0) {
      out.push(renderFirstParagraph(paragraphs[i]));
    } else {
      out.push(`<p>${escapeHTML(paragraphs[i])}</p>`);
    }
    const placement = placements.find(pl => pl.afterParaIdx === i);
    if (placement) {
out.push(renderPullQuoteHTML(placement.passage));
    } else if (dividerIndices.has(i)) {
out.push('<div class="work-section-divider" aria-hidden="true">&middot;&nbsp;&middot;&nbsp;&middot;</div>');
    }
  }
  return out.join('\n');
}

function renderMemorial(item) {
  if (!item.memoriam) return '';
  const rawNote = (item.memoriamNote || '').trim();
  if (!rawNote) return '';
  // BP voice: no em dashes in memorial framing. The Airtable note often uses
  // " — " for parenthetical breaks and to separate the dates from the verb-led
  // summary. Replace context-appropriately: if the next word starts uppercase,
  // promote to a sentence break (". "); otherwise, soften to a comma.
  // Preserve en dashes inside date ranges like "1927–2012".
  function scrubEmDashes(text) {
    let t = text.replace(/\s+—\s+(\S)/g, (_, ch) => {
      return /[A-Z]/.test(ch) ? '. ' + ch : ', ' + ch;
    });
    return t.replace(/—/g, ',');
  }
  // Split on blank lines so multi-person memoriams (e.g. Bigelow's two
  // figures, or any entry with separate paragraphs) render as separate
  // paragraphs with breathing room between them.
  const paragraphs = rawNote
    .split(/\n\n+/)
    .map(p => scrubEmDashes(p.trim()))
    .filter(Boolean);
  const body = paragraphs.map(p => `  <p>${escapeHTML(p)}</p>`).join('\n');
  return `
<div class="work-memoriam">
  <div class="work-memoriam-label">In memoriam</div>
${body}
</div>`;
}

function renderArticleSchema(item, slug) {
  const url = `https://drlisabelisle.com/writing/${slug}.html`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: item.title,
    datePublished: item.date,
    url,
    author: { '@id': 'https://drlisabelisle.com/#person' },
    publisher: { '@id': 'https://drlisabelisle.com/#person' },
    mainEntityOfPage: url,
    isBasedOn: item.url || undefined,
    description: item.blurb || undefined,
    inLanguage: 'en-US'
  };
  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

function buildSubtitle(item) {
  // The Airtable `blurb` field tends to mirror the opening of the article itself,
  // which would duplicate the drop-cap paragraph. Suppress the subtitle when the
  // blurb shares its opening words with the article body.
  const blurb = (item.blurb || '').trim();
  if (!blurb) return '';
  const fullText = (item.fullText || '').trim();
  const blurbHead = blurb.slice(0, Math.min(40, blurb.length)).toLowerCase();
  const bodyHead = fullText.slice(0, Math.min(120, fullText.length)).toLowerCase();
  if (blurbHead.length >= 30 && bodyHead.includes(blurbHead)) {
    return ''; // Don't show a subtitle that just echoes the body opening.
  }
  // First sentence, capped at ~180 chars.
  const m = blurb.match(/^.+?[.!?](?=\s|$)/);
  let sub = (m ? m[0] : blurb).trim();
  if (sub.length > 180) sub = sub.slice(0, 178).replace(/\s+\S*$/, '') + '…';
  return sub;
}

function readingMinutes(text) {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  // 220 wpm reading pace.
  return Math.max(1, Math.round(words / 220));
}

function renderTags(themes) {
  if (!Array.isArray(themes) || themes.length === 0) return '';
  const visible = themes.filter(Boolean).slice(0, 4);
  if (visible.length === 0) return '';
  const chips = visible
    .map(t => `<span class="work-tag">${escapeHTML(t)}</span>`)
    .join('');
  return `<div class="work-tags">${chips}</div>`;
}

// Pick up to 3 related pieces from the same topic (or pillar fallback).
// Excludes the current item, and prefers items with mirror pages.
function pickRelated(currentItem, allItems) {
  const exclude = new Set([currentItem.title]);
  const candidates = allItems.filter(it =>
    !exclude.has(it.title) &&
    it.fullText &&
    it.fullText.trim().length > 0
  );
  function score(item) {
    let s = 0;
    if (currentItem.topic && item.topic === currentItem.topic) s += 8;
    if (currentItem.pillar && item.pillar === currentItem.pillar) s += 3;
    if (Array.isArray(currentItem.themes) && Array.isArray(item.themes)) {
      const overlap = currentItem.themes.filter(t => item.themes.includes(t)).length;
      s += overlap * 2;
    }
    return s;
  }
  const ranked = candidates
    .map(it => ({ item: it, score: score(it) }))
    .sort((a, b) => b.score - a.score || (b.item.date || '').localeCompare(a.item.date || ''));
  // Take top 3 with at least some score, fall back to recency if score is zero.
  const top = ranked.slice(0, 3).map(x => x.item);
  return top;
}

function renderRelated(currentItem, allItems) {
  const related = pickRelated(currentItem, allItems);
  if (related.length === 0) return '';
  const items = related.map(it => {
    const slug = slugify(it.title);
    const date = fmtDate(it.date);
    return `<a class="work-related-item" href="${escapeHTML(slug)}.html">
      <div class="work-related-item-meta">${escapeHTML(it.outlet || '')}${date ? ` &middot; ${escapeHTML(date)}` : ''}</div>
      <div class="work-related-item-title">${escapeHTML(it.title)}</div>
    </a>`;
  }).join('\n');
  return `
<div class="work-related">
  <div class="work-related-label">More from Selected Works</div>
  <div class="work-related-grid">
${items}
  </div>
</div>`;
}

function pageHTML(item, slug, allItems) {
  const dateStr = fmtDate(item.date);
  const outlet = item.outlet || '';
  const description = (item.blurb || `${item.title} — originally published at ${outlet}, ${dateStr}.`).slice(0, 240);
  const ogImage = 'https://drlisabelisle.com/coast-sunset.jpg';
  const minutes = readingMinutes(item.fullText || '');

  const paragraphs = paragraphsFrom(item.fullText || '');
  const body = renderBodyWithPullQuotes(paragraphs, item.keyPassages);
  const subtitle = buildSubtitle(item);
  const memoriam = renderMemorial(item);
  const tags = renderTags(item.themes);
  const related = renderRelated(item, allItems);

  const originalLinkBlock = item.url ? `
<div class="work-attribution">
  <p>Originally published at <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener">${escapeHTML(outlet)}</a>${dateStr ? `, ${escapeHTML(dateStr)}` : ''}.</p>
  ${item.backupUrl ? `<p class="work-attribution-fallback">If the original is unavailable: <a href="${escapeHTML(item.backupUrl)}" target="_blank" rel="noopener">read on the Wayback Machine</a>.</p>` : ''}
</div>` : '';

  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
<meta charset="UTF-8">
<script>document.documentElement.classList.replace("no-js","js");</script>
<script src="../js/main.js" defer></script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(item.title)} | Selected Works | Lisa Belisle, MD</title>
<meta name="description" content="${escapeHTML(description)}">
<meta name="author" content="Lisa Belisle, MD">
<link rel="canonical" href="https://drlisabelisle.com/writing/${slug}.html">

<meta property="og:site_name" content="Lisa Belisle, MD">
<meta property="og:type" content="article">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="https://drlisabelisle.com/writing/${slug}.html">
<meta property="og:title" content="${escapeHTML(item.title)}">
<meta property="og:description" content="${escapeHTML(description)}">
<meta property="og:image" content="${ogImage}">
<meta property="article:author" content="Lisa Belisle">
<meta property="article:published_time" content="${escapeHTML(item.date || '')}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHTML(item.title)}">
<meta name="twitter:description" content="${escapeHTML(description)}">
<meta name="twitter:image" content="${ogImage}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/styles.css">

${renderArticleSchema(item, slug)}
</head>
<body>

<nav>
  <div class="nav-inner">
    <a href="/" class="nav-name">Lisa Belisle</a>
    <ul class="nav-links" id="nav-links">
      <li><a href="../writing.html">Writing</a></li>
      <li><a href="../podcast.html">Podcast</a></li>
      <li><a href="../speaking.html">Speaking</a></li>
      <li><a href="../events.html">Events</a></li>
      <li><a href="../about.html">About</a></li>
      <li><a href="../contact.html">Contact</a></li>
    </ul>
    <button class="nav-toggle" id="nav-toggle" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
</nav>

<main class="work-page">
  <div class="wrap">
  <article class="work-article">
    <header class="work-header">
      <div class="work-eyebrow"><a href="../writing.html">Selected Works</a> &middot; ${escapeHTML(outlet)}${dateStr ? ` &middot; ${escapeHTML(dateStr)}` : ''}${minutes ? ` &middot; ${minutes} min read` : ''}</div>
      <h1 class="work-title">${escapeHTML(item.title)}</h1>
      ${subtitle ? `<p class="work-subtitle">${escapeHTML(subtitle)}</p>` : ''}
      <div class="work-rule"></div>
      ${tags}
    </header>

    ${memoriam}

    <div class="work-body">
${body}
    </div>

    ${originalLinkBlock}

    ${related}
  </article>
  </div>
</main>

<footer>
  <div class="footer-inner">
    <span class="footer-name">Lisa Belisle, MD, PhD, MPH, MBA &nbsp;&middot;&nbsp; Littlejohn Island, Maine</span>
    <span class="footer-copy">&copy; 2026 Dr. Lisa Belisle. All rights reserved.</span>
    <ul class="footer-links">
      <li><a href="https://www.bountifulpath.com" target="_blank">The Bountiful Path</a></li>
      <li><a href="https://www.radiomaine.com" target="_blank">Radio Maine</a></li>
      <li><a href="https://wgan.com/podcasts/categories/podcasts-healthy-conversation/" target="_blank">A Healthy Conversation</a></li>
      <li><a href="https://portlandartgallery.com" target="_blank">Portland Art Gallery</a></li>
      <li><a href="../contact.html">Contact</a></li>
    </ul>
  </div>
</footer>

<script>
document.getElementById('nav-toggle').addEventListener('click', function() {
  document.getElementById('nav-links').classList.toggle('open');
});

// Pull-quote share: copy quote + attribution + page URL to the clipboard.
document.querySelectorAll('.work-pullquote-share').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    var quoteText = btn.getAttribute('data-text') || '';
    var attribution = btn.getAttribute('data-attribution') || '';
    var pageUrl = window.location.href.split('#')[0];
    var clip = '"' + quoteText + '"';
    if (attribution) clip += ' — ' + attribution;
    clip += '\\n\\nFrom: ${escapeHTML(item.title)}\\n' + pageUrl;
    navigator.clipboard.writeText(clip).then(function() {
      btn.setAttribute('aria-pressed', 'true');
      btn.textContent = '✓';
      setTimeout(function() {
        btn.removeAttribute('aria-pressed');
        btn.textContent = '↗';
      }, 1600);
    }).catch(function() {
      btn.textContent = '!';
      setTimeout(function() { btn.textContent = '↗'; }, 1600);
    });
  });
});
</script>

</body>
</html>
`;
}

async function main() {
  const json = JSON.parse(await readFile(join(REPO_ROOT, 'selected-works.json'), 'utf8'));
  // Generate a mirror page only for items with fullText that are also
  // marked showOnSite. selected-works.json no longer contains hidden
  // records at all (fetch-selected-works.js excludes them), so this
  // check is belt-and-suspenders in case the JSON is ever hand-edited.
  const items = (json.items || []).filter(it => it.fullText && it.fullText.trim().length > 0 && it.showOnSite);

  if (!existsSync(OUT_DIR)) {
    await mkdir(OUT_DIR, { recursive: true });
  }

  // Detect slug collisions
  const slugMap = new Map();
  for (const it of items) {
    const slug = slugify(it.title);
    if (slugMap.has(slug)) {
      console.warn(`Slug collision: ${slug} — already used by "${slugMap.get(slug)}", now also "${it.title}"`);
    }
    slugMap.set(slug, it.title);
  }

  let written = 0;
  for (const it of items) {
    const slug = slugify(it.title);
    const html = pageHTML(it, slug, items);
    await writeFile(join(OUT_DIR, `${slug}.html`), html, 'utf8');
    written++;
  }

  console.log(`generate-selected-works-pages: wrote ${written} pages to writing/.`);
}

main().catch(err => {
  console.error('generate-selected-works-pages failed:');
  console.error(err);
  process.exit(1);
});

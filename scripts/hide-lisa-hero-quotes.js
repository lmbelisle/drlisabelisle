/**
 * hide-lisa-hero-quotes.js
 *
 * One-off cleanup: removes the <section class="lmr-pull-quote">…</section>
 * block from any love-maine-radio/*.html where the blockquote attribution
 * matches "— Lily" or "— Lisa Belisle" / "— Dr. Lisa Belisle".
 *
 * The Headline Quote field in Airtable is left untouched — once Lisa picks
 * guest quotes for these episodes, the regenerated pages will pick them up.
 *
 * Run: node scripts/hide-lisa-hero-quotes.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '..', 'love-maine-radio');

const PULL_QUOTE_RE = /<section class="lmr-pull-quote"><blockquote>([\s\S]*?)<\/blockquote><\/section>\n?/;
const LISA_ATTRIB_RE = /[—\-]\s*(Dr\.\s*)?Lisa\s*Belisle|[—\-]\s*Lily/i;

const files = fs.readdirSync(OUTPUT_DIR)
  .filter(f => f.endsWith('.html') && f !== 'index.html');

const stripped = [];
const skippedNotLisa = [];
const noQuote = [];

for (const f of files) {
  const fp = path.join(OUTPUT_DIR, f);
  const html = fs.readFileSync(fp, 'utf8');
  const m = html.match(PULL_QUOTE_RE);
  if (!m) { noQuote.push(f); continue; }
  if (!LISA_ATTRIB_RE.test(m[1])) { skippedNotLisa.push(f); continue; }
  const updated = html.replace(PULL_QUOTE_RE, '');
  fs.writeFileSync(fp, updated);
  stripped.push(f);
}

console.log(`stripped ${stripped.length} pages, left ${skippedNotLisa.length} guest-attributed alone, ${noQuote.length} had no pull-quote`);
if (stripped.length) {
  console.log('\nfirst 10 stripped:');
  stripped.slice(0, 10).forEach(f => console.log('  ' + f));
}

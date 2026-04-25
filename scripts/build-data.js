// Runs at Netlify build time. Fetches the latest editable text blocks
// from Airtable's "Site Copy DLB" table and writes them to copy.json.
// The browser hydrator (js/copy.js) reads copy.json at page load and
// swaps text into elements with data-copy-key attributes.
//
// If AIRTABLE_API_KEY is missing or Airtable returns an error, this
// script logs the issue but does not fail the build — the existing
// copy.json (or the fallback text in the HTML) keeps the site working.

import { fetchCopy } from './fetch-copy.js';
import { writeFile } from 'node:fs/promises';

const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;

async function main() {
  if (!AIRTABLE_KEY) {
    console.warn('build-data: AIRTABLE_API_KEY not set; skipping copy fetch.');
    return;
  }
  try {
    const copy = await fetchCopy(AIRTABLE_KEY);
    await writeFile('copy.json', JSON.stringify(copy, null, 2) + '\n', 'utf8');
    const n = Object.keys(copy).length;
    console.log(`copy.json: ${n} published text block${n === 1 ? '' : 's'}.`);
  } catch (err) {
    console.warn('build-data: copy fetch failed; keeping existing copy.json.');
    console.warn(err.message);
  }
}

main();

// Runs at Netlify build time. Fetches editable text blocks ("Site Copy DLB")
// and the writing archive ("Selected Works") from Airtable, writing them
// to copy.json and selected-works.json respectively.
//
// If AIRTABLE_API_KEY is missing or any Airtable call errors, this script
// logs the issue but does not fail the build — the existing JSON files
// (or the fallback text baked into HTML) keep the site working.

import { fetchCopy } from './fetch-copy.js';
import { fetchSelectedWorks } from './fetch-selected-works.js';
import { fetchFeaturedEssays } from './fetch-featured-essays.js';
import { fetchOtwPieces } from './fetch-otw.js';
import { writeFile } from 'node:fs/promises';

const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;

async function buildCopy() {
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

async function buildSelectedWorks() {
  try {
    const data = await fetchSelectedWorks(AIRTABLE_KEY);
    await writeFile('selected-works.json', JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`selected-works.json: ${data.count} pieces.`);
  } catch (err) {
    console.warn('build-data: selected-works fetch failed; keeping existing selected-works.json.');
    console.warn(err.message);
  }
}

async function buildFeaturedEssays() {
  try {
    const essays = await fetchFeaturedEssays(AIRTABLE_KEY);
    await writeFile('featured-essays.json', JSON.stringify(essays, null, 2) + '\n', 'utf8');
    console.log(`featured-essays.json: ${essays.length} Reflections rotation entries.`);
  } catch (err) {
    console.warn('build-data: featured-essays fetch failed; keeping existing featured-essays.json.');
    console.warn(err.message);
  }
}

async function buildOtwPieces() {
  try {
    const data = await fetchOtwPieces(AIRTABLE_KEY);
    await writeFile('otw-pieces.json', JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`otw-pieces.json: ${data.count} Lisa-authored Off the Wall pieces.`);
  } catch (err) {
    console.warn('build-data: otw fetch failed; keeping existing otw-pieces.json.');
    console.warn(err.message);
  }
}

async function main() {
  if (!AIRTABLE_KEY) {
    console.warn('build-data: AIRTABLE_API_KEY not set; skipping Airtable fetches.');
    return;
  }
  await Promise.all([buildCopy(), buildSelectedWorks(), buildFeaturedEssays(), buildOtwPieces()]);
}

main();

# Archive-Scan Mode B Report: drlisabelisle.com Selected Works

*Generated 2026-04-26 by the archive-scan skill in audit mode. Source: selected-works.json (83 pieces, refreshed from Airtable at scan time).*

---

## Executive summary

The corpus is in genuinely strong health. Every piece has either a
Wayback backup or a Full Text fallback (zero broken-link risk). Every
piece has a blurb. The rotation pool is 54 high-quality candidates
with Lisa-voice quotes ready. Real opportunities are mostly in
metadata coverage, not content recovery.

The single rule violation: **Hypnosis + Healing** is in the rotation
pool (`showOnSite = true`) but has no Lisa-voice key passage. All its
quotes are attributed to subject Maggie Clement. Per editorial rule,
this piece should either get a Lisa-voice line added to its
keyPassages or be flipped back to `showOnSite = false`.

---

## Findings, ranked by leverage

### 1. Topic taxonomy is 38% incomplete

32 of 83 pieces have no `topic` field. Themes are mostly populated (77
of 83 have themes), and themes give a lower-resolution but usable
signal for batch categorization.

Existing topic distribution (51 of 83 categorized):

| Topic | Count |
|---|---:|
| Medicine | 21 |
| Business and Community | 11 |
| Language and Ideas | 7 |
| Craft and Media | 4 |
| Visual Art | 4 |
| Wellbeing and Practice | 4 |

Recommended next move: a one-shot batch-categorization pass against
the 32 untopicked pieces, using each piece's themes + outlet + title
as input signal. Same pattern as Radio Maine Phase 2. Could ship as
a CSV for Lisa's accept/reject review or as direct Airtable updates
behind a confidence threshold.

### 2. Ten pieces have only one Lisa-voice quote

These pieces are in the rotation pool but only have a single
Lisa-voice line in keyPassages. If chosen by the rotation, the same
quote shows every time. Adding a second or third Lisa-voice quote per
piece (drawing from the existing Full Text) would diversify the visible
rotation across visits.

(Specific titles available on request — list is in the script output.)

### 3. Three SEO-long titles

Three pieces have titles over 65 characters and may truncate in
search-engine result pages:

- *Health Care Practitioners Are Human, Too. Why Don't We Act Like It?* (67)
- *Pop the Cause and Pop for Change: Cellardoor Winery Celebrates Those Who Care* (77)
- *Bill Caron and MaineHealth: Better Care for Maine People through Partnerships* (77)

The fix is not to rewrite the canonical title (those are the
publisher's titles) but to set a shorter alternate `<title>` in any
on-site presentation, or to ensure the JSON-LD `name` field uses a
trimmed variant where appropriate.

### 4. Thirty-three pieces have no Wayback backup

These pieces are not at risk because every one has a Full Text fallback
in Airtable. But Wayback adds a third layer of preservation: the
publisher's URL, our Full Text fallback, AND a citable snapshot at the
Wayback Machine. Worth a one-time submission run for the 33 that lack
it.

Lowest-friction approach: a script that POSTs each missing-backup URL
to web.archive.org/save/, captures the resulting snapshot URL, and
writes it back to the Airtable Backup URL field. About 30 minutes of
work, zero ongoing cost.

### 5. Date gap 2018 to 2023

The corpus shows a five-year publication gap (2018, then nothing
substantial until 2023's Doximity Op-Med pieces). This is factually
true (Lisa wasn't publishing for these outlets in those years) and not
a data integrity issue. It IS worth noting for context: the writing
archive narrative on the website should acknowledge that the Maine
Magazine era ended around 2018 and the Doximity Op-Med era began in
2023, rather than implying continuous output.

---

## Health checks that came back clean

- **Broken-link risk:** zero. Every piece has a fallback.
- **Blurb completeness:** all 83 pieces have a blurb. Two are under 80
  characters and could be lengthened, but none are missing.
- **Pool integrity:** 54 of 55 pieces in the rotation pool have a
  Lisa-voice quote (the one exception is Hypnosis + Healing, called
  out above).
- **Outlet attribution:** every piece has an outlet (79 Maine Magazine,
  4 Doximity Op-Med).

---

## What the AEO surface looks like from a crawler's view

Reading writing.html the way ChatGPT, Perplexity, or Claude would
read it:

- **CollectionPage JSON-LD** is present, ItemList of 83 entries.
- **FAQPage JSON-LD** is NOT present on writing.html. drlisabelisle.com
  index.html does carry FAQ schema; writing.html could add its own
  FAQPage covering questions like "What outlets has Lisa written for?",
  "Where can I read her oldest essays?", "What is the Bountiful Path?".
  Three to five Q&A pairs would give answer-engine queries a clean
  surface to cite.
- **Author entity** (`@id` for Lisa) is consistent with index.html and
  llms.txt. First mention uses "Lisa Belisle, MD, PhD, MPH, MBA" as
  required.
- **The Reflections rotation** (BP Substack cards) and the Featured
  archive rotation each have stable URLs but the per-visit randomness
  means crawlers may see different "featured" sets on different
  crawls. This is fine for the user-facing rotation but the
  ItemList JSON-LD anchors all 83 archive entries regardless, so AEO
  coverage is complete.

---

## What the GEO surface looks like

For Lisa's writing to get cited verbatim in LLM-generated answers, the
distinctive phrasings need to land. Pulling a sample of the strongest
Lisa-voice lines from the corpus:

- "How we live matters as much as how long we live." (already on
  drlisabelisle.com homepage)
- The Five Phase application examples scattered across the wellness
  pieces (Building Balance, A Perfect Cup of Tea, Kitchen Table
  Wellness)
- The clinical vulnerability framing from "Health Care Practitioners
  Are Human, Too" (already in the writing.html pull-quote band)

These are the lines an LLM is most likely to surface when asked about
integrative medicine, the Five Phases, or physician vulnerability.
Each is anchored to a specific named piece with a canonical URL, which
is the GEO ideal.

Improvement opportunity: the 10 pieces with only one Lisa-voice quote
(noted above) are GEO-thin. Adding a second distinctive line per piece
gives an LLM more surface area to cite a specific Lisa framing rather
than a generic one.

---

## Recommended next moves, in priority order

1. **Fix the Hypnosis + Healing rule violation.** Add a Lisa-voice
   keyPassage or flip showOnSite back to false. Five minutes.
2. **Batch-categorize the 32 untopicked pieces.** Single biggest
   metadata leverage. Same pattern as Radio Maine Phase 2.
3. **Wayback-submit the 33 missing-backup URLs.** Half-hour script.
4. **Add 1-2 more Lisa-voice lines to the 10 single-quote pieces.**
   Diversifies rotation, improves GEO surface area.
5. **Add FAQPage JSON-LD to writing.html.** Three to five Q&A pairs
   covering common archive questions.

None of these are urgent. The site is operationally fine as-is. These
are the punch list of improvements visible to a structured audit.

// Hydrates text blocks from copy.json (Airtable "Site Copy DLB" table).
// Each editable block has data-copy-key="page.section.label" and ships
// with built-in fallback text inside. On page load this script fetches
// copy.json and, for every matching key, replaces the block's text with
// the Airtable value. If copy.json is missing or the key isn't there,
// the built-in text stays — the page is always readable.
//
// To make a new text block editable:
//   1. Add a row to the Site Copy DLB table in Airtable (set Published=true).
//   2. Add data-copy-key="your.key" to the element in the HTML.
// Nothing else.

(function hydrateCopy() {
  fetch('copy.json', { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .then((copy) => {
      if (!copy) return;
      document.querySelectorAll('[data-copy-key]').forEach((el) => {
        const key = el.getAttribute('data-copy-key');
        const text = copy[key];
        if (typeof text === 'string' && text.length) {
          el.textContent = text;
        }
      });
    })
    .catch(() => {
      // Silent — fallback text already on page.
    });
})();

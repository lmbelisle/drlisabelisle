// Newsletter slide-in for drlisabelisle.com
// -----------------------------------------------------------------------------
// A quiet, brand-appropriate invitation to subscribe to The Bountiful Path.
//
// Deliberate design choices (see the popup plus/minus discussion):
//  - It is a small bottom-corner SLIDE-IN, not a full-screen modal. Google
//    penalizes intrusive interstitials on mobile; a corner card that never
//    covers the content avoids that, protecting the SEO work the ecosystem
//    has been building.
//  - It NEVER appears on load. It waits for the reader to settle in — whichever
//    comes first: ~40s dwell or scrolling past ~45% of the page.
//  - It shows ONCE per visitor. The moment it is shown, dismissed, or acted on,
//    a localStorage flag is set so a returning reader is never nagged.
//  - The register stays unhurried: an invitation, not a hard sell.
(function () {
  'use strict';

  var DONE_KEY = 'bp_newsletter_slidein_done';        // set once they subscribe → never again
  var SHOWN_AT_KEY = 'bp_newsletter_slidein_shown_at'; // timestamp of the last time it appeared
  var REASK_MS = 30 * 24 * 60 * 60 * 1000;             // re-ask a non-subscriber after 30 days
  var SUBSCRIBE_URL = 'https://drlisabelisle.substack.com/subscribe';

  // Suppression rules:
  //  - If they've subscribed, never show again.
  //  - If it was shown in the last 30 days, stay quiet; after that, ask once more.
  try {
    if (localStorage.getItem(DONE_KEY)) return;
    var shownAt = parseInt(localStorage.getItem(SHOWN_AT_KEY) || '0', 10);
    if (shownAt && (Date.now() - shownAt) < REASK_MS) return;
  } catch (e) { /* private mode — fall through, show once this session */ }

  // Honor reduced-motion preferences.
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Stamp the time it appeared, so the 30-day re-ask clock starts now.
  function markShown() {
    try { localStorage.setItem(SHOWN_AT_KEY, String(Date.now())); } catch (e) {}
  }

  var shown = false;
  function show() {
    if (shown) return;
    shown = true;
    markShown();
    buildAndReveal();
    cleanupTriggers();
  }

  // --- Triggers: dwell time OR scroll depth, whichever first -----------------
  var dwellTimer = setTimeout(show, 40000);
  function onScroll() {
    var scrolled = window.scrollY + window.innerHeight;
    var depth = document.documentElement.scrollHeight || document.body.scrollHeight;
    if (depth > 0 && scrolled / depth >= 0.45) show();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  function cleanupTriggers() {
    clearTimeout(dwellTimer);
    window.removeEventListener('scroll', onScroll);
  }

  // --- Styles (injected once) ------------------------------------------------
  function injectStyles() {
    if (document.getElementById('bp-slidein-styles')) return;
    var css = '' +
      '.bp-slidein{position:fixed;right:20px;bottom:20px;z-index:9999;width:330px;max-width:calc(100vw - 40px);' +
        'background:#FEFCF9;border:1px solid rgba(27,115,131,0.28);border-top:3px solid #1B7383;' +
        'border-radius:3px;box-shadow:0 14px 40px rgba(20,40,45,0.18);padding:1.25rem 1.35rem 1.35rem;' +
        'font-family:Inter,system-ui,sans-serif;color:#26303a;' +
        'opacity:0;transform:translateY(14px);transition:opacity .5s ease,transform .5s ease;}' +
      '.bp-slidein.is-in{opacity:1;transform:translateY(0);}' +
      '.bp-slidein-eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#1B7383;margin:0 0 .45rem;}' +
      '.bp-slidein-title{font-family:"Cormorant Garamond",Georgia,serif;font-size:1.5rem;line-height:1.2;font-weight:600;margin:0 0 .5rem;color:#1d2730;}' +
      '.bp-slidein-body{font-size:13.5px;line-height:1.55;color:#46535c;margin:0 0 1rem;}' +
      '.bp-slidein-cta{display:inline-block;background:#1B7383;color:#fff;text-decoration:none;' +
        'font-size:13px;letter-spacing:.03em;padding:.6rem 1.1rem;border-radius:2px;}' +
      '.bp-slidein-cta:hover{background:#155c69;}' +
      '.bp-slidein-no{display:block;margin-top:.7rem;font-size:12px;color:#8a949b;background:none;border:none;padding:0;cursor:pointer;}' +
      '.bp-slidein-no:hover{color:#46535c;text-decoration:underline;}' +
      '.bp-slidein-close{position:absolute;top:8px;right:10px;background:none;border:none;font-size:20px;line-height:1;' +
        'color:#a7b0b6;cursor:pointer;padding:2px 6px;}' +
      '.bp-slidein-close:hover{color:#46535c;}' +
      (reduceMotion ? '.bp-slidein{transition:none;}' : '');
    var el = document.createElement('style');
    el.id = 'bp-slidein-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // --- Build + reveal --------------------------------------------------------
  function buildAndReveal() {
    injectStyles();
    var card = document.createElement('aside');
    card.className = 'bp-slidein';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Subscribe to The Bountiful Path');
    card.innerHTML =
      '<button class="bp-slidein-close" aria-label="Close">&times;</button>' +
      '<p class="bp-slidein-eyebrow">The Bountiful Path</p>' +
      '<h2 class="bp-slidein-title">A letter from the coast.</h2>' +
      '<p class="bp-slidein-body">Essays on medicine, the seasons, and life on the Maine coast, ' +
        'delivered quietly to your inbox. Free to read.</p>' +
      '<a class="bp-slidein-cta" href="' + SUBSCRIBE_URL + '" target="_blank" rel="noopener">Subscribe</a>' +
      '<button class="bp-slidein-no" type="button">Maybe later</button>';

    function dismiss() {
      card.classList.remove('is-in');
      window.setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); },
        reduceMotion ? 0 : 500);
    }
    // Clicking Subscribe is taken as "done" — never ask again. Closing or
    // "Maybe later" only resets the 30-day clock (handled by markShown).
    function subscribed() {
      try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {}
      dismiss();
    }
    card.querySelector('.bp-slidein-close').addEventListener('click', dismiss);
    card.querySelector('.bp-slidein-no').addEventListener('click', dismiss);
    card.querySelector('.bp-slidein-cta').addEventListener('click', subscribed);
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); }
    });

    document.body.appendChild(card);
    // next frame → trigger the transition
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { card.classList.add('is-in'); });
    });
  }
})();

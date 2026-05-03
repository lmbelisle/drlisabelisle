// Shared motion utilities for drlisabelisle.com.
// Per-card reveal observer, image fade-in, optional reading progress.
// Patterns aligned with bountifulpath.com.
(function () {
  'use strict';

  document.documentElement.classList.replace('no-js', 'js');

  let cardObs = null;

  document.addEventListener('DOMContentLoaded', () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasIO = 'IntersectionObserver' in window;

    // Per-card observer: each .stagger > * card observes its own viewport
    // entry and gets .in-view directly. Works on desktop AND mobile.
    if (hasIO && !reduceMotion) {
      cardObs = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      observeNewCards(document.querySelectorAll('.stagger > *'));
      // Watch every .stagger parent for hydrated children (writing.html
      // replaces #reflections-grid and #otw-grid contents from JSON).
      const mut = new MutationObserver(records => {
        records.forEach(r => {
          if (!r.target.classList.contains('stagger')) return;
          observeNewCards(r.addedNodes);
          // Re-fade any newly inserted images too.
          r.addedNodes.forEach(n => {
            if (!(n instanceof HTMLElement)) return;
            initImageFade(n.querySelectorAll('img'));
          });
        });
      });
      document.querySelectorAll('.stagger').forEach(p => mut.observe(p, { childList: true }));
    } else {
      document.querySelectorAll('.stagger > *').forEach(el => el.classList.add('in-view'));
    }

    // Image fade: every <img> goes from blank to crisp instead of popping.
    initImageFade(document.querySelectorAll('img'));

    // Reading progress thread — only wired if <html data-reading-progress>.
    if (document.documentElement.hasAttribute('data-reading-progress') && !reduceMotion) {
      wireReadingProgress();
    }
  });

  function observeNewCards(nodes) {
    if (!cardObs) return;
    nodes.forEach(n => {
      if (!(n instanceof HTMLElement)) return;
      // Only observe direct children of .stagger; ignore text nodes etc.
      if (n.parentElement && n.parentElement.classList.contains('stagger')) {
        cardObs.observe(n);
      }
    });
  }

  function initImageFade(imgs) {
    imgs.forEach(img => {
      if (img.classList.contains('bp-img-loaded') || img.classList.contains('bp-img-loading')) return;
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('bp-img-loaded');
      } else {
        img.classList.add('bp-img-loading');
        img.addEventListener('load', () => {
          img.classList.remove('bp-img-loading');
          img.classList.add('bp-img-loaded');
        }, { once: true });
        img.addEventListener('error', () => {
          img.classList.remove('bp-img-loading');
        }, { once: true });
      }
    });
  }

  function wireReadingProgress() {
    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
      document.documentElement.style.setProperty('--progress', pct + '%');
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }
})();

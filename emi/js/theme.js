/* Night mode. The collection is drawn on two grounds, so the site has both.
   Loaded ahead of the page so the ground is right before anything paints. */
(function () {
  'use strict';
  var KEY = 'emi-theme';
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function apply(theme) {
    if (theme === 'night') root.setAttribute('data-theme', 'night');
    else root.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'night' ? '#060303' : '#ccff01');
    swapArt(theme);
  }

  /* The hero loops have their ground baked in, so each has a night twin drawn
     by the same rule the studio uses. Swapping the src rather than shipping
     both keeps one of them off the wire. */
  function swapArt(theme) {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var imgs = document.querySelectorAll('[data-day]');
    for (var i = 0; i < imgs.length; i++) {
      var el = imgs[i];
      var key = (theme === 'night' ? 'night' : 'day') + (reduce ? 'Still' : '');
      var next = el.dataset[key] || el.dataset.day;
      if (next && el.getAttribute('src') !== next) el.setAttribute('src', next);
    }
  }

  var saved = stored();
  var initial = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');
  apply(initial);

  document.addEventListener('DOMContentLoaded', function () {
    swapArt(root.getAttribute('data-theme') === 'night' ? 'night' : 'day');
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'night' ? 'day' : 'night';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
      btn.setAttribute('aria-pressed', String(next === 'night'));
    });
    btn.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'night'));
  });
})();

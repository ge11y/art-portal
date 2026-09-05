/* ============================================================
   EMI MARKET TRACKER
   Real numbers or none. If the feed is unreachable the section says
   so rather than showing a stale or invented figure.
   ============================================================ */
(function () {
  'use strict';

  var el = document.getElementById('tracker-stats');
  if (!el) return;

  function eth(n, dp) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return n.toFixed(dp == null ? 4 : dp).replace(/\.?0+$/, '') || '0';
  }

  function set(key, text) {
    var node = el.querySelector('[data-k="' + key + '"]');
    if (node) node.textContent = text;
  }

  function ago(iso) {
    var t = new Date(iso);
    if (isNaN(t)) return '';
    var mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return 'just now';
    if (mins === 1) return 'a minute ago';
    if (mins < 60) return mins + ' minutes ago';
    var hrs = Math.round(mins / 60);
    return hrs === 1 ? 'an hour ago' : hrs + ' hours ago';
  }

  fetch('api/stats', { cache: 'no-cache' })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (res) {
      var d = res.j;
      if (!res.ok || !d || !d.ok) throw new Error((d && d.error) || 'unavailable');
      var sym = d.symbol || 'ETH';

      set('floor', d.floor ? eth(d.floor) + ' ' + sym : 'No listings');
      set('day', d.day ? eth(d.day.volume) + ' ' + sym : '0 ' + sym);
      set('volume', eth(d.volume) + ' ' + sym);
      set('sales', String(d.sales));
      set('owners', d.owners + ' / ' + d.supply);
      set('cap', d.marketCap ? eth(d.marketCap, 2) + ' ' + sym : '—');

      var when = document.getElementById('tracker-when');
      if (when) when.textContent = 'From OpenSea, ' + ago(d.fetchedAt);

      var note = document.getElementById('tracker-note');
      if (note && d.day) {
        note.textContent = d.day.sales + (d.day.sales === 1 ? ' sale' : ' sales') + ' in the last 24 hours.';
      }
    })
    .catch(function () {
      var when = document.getElementById('tracker-when');
      if (when) when.textContent = 'Market data is unavailable right now.';
      el.classList.add('is-down');
    });
})();

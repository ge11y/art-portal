/* ============================================================
   EMI PERKS
   Where an Emi gets you in. What you get is public, because it is
   also the reason to want one. How to claim it is for holders.
   Entries live in data/perks.json.
   ============================================================ */
(function () {
  'use strict';

  var UNLOCK_KEY = 'emi-studio-unlocked';
  var $ = function (id) { return document.getElementById(id); };

  var perks = null;
  var unlocked = false;

  function readUnlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === 'yes'; } catch (e) { return false; }
  }
  function rememberUnlocked() {
    try { localStorage.setItem(UNLOCK_KEY, 'yes'); } catch (e) { /* private window */ }
  }

  function checkPassword(pass) {
    return fetch('api/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pass })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok && j && j.ok, error: j && j.error }; });
    });
  }

  /* ---------- shaping ---------- */

  function perkStatus(p) {
    if (p.date) {
      var d = new Date(p.date + 'T23:59:59');
      if (!isNaN(d) && d < new Date()) return 'closed';
    }
    return p.status || 'open';
  }

  var STATUS_ORDER = { open: 0, upcoming: 1, closed: 2 };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  function chainTags(chain) {
    if (!chain) return '';
    var list = Array.isArray(chain) ? chain : [chain];
    return list.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('');
  }

  function prettyDate(iso) {
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ---------- rendering ---------- */

  function render() {
    var list = $('perks-list');
    if (!list || !perks) return;
    var empty = $('perks-empty');
    var door = $('perks-door');
    var count = $('perks-count');

    document.body.classList.toggle('is-unlocked', unlocked);

    if (!perks.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      if (door) door.hidden = true;
      if (count) count.textContent = '';
      return;
    }
    if (empty) empty.hidden = true;

    var sorted = perks.slice().sort(function (a, b) {
      var d = STATUS_ORDER[perkStatus(a)] - STATUS_ORDER[perkStatus(b)];
      if (d) return d;
      return (a.date || '') < (b.date || '') ? -1 : 1;
    });

    var open = sorted.filter(function (p) { return perkStatus(p) === 'open'; }).length;
    var soon = sorted.filter(function (p) { return perkStatus(p) === 'upcoming'; }).length;
    if (count) {
      var bits = [];
      if (open) bits.push(open + (open === 1 ? ' open now' : ' open now'));
      if (soon) bits.push(soon + ' lined up');
      count.textContent = bits.length ? bits.join(' \u00B7 ') : 'Nothing open at the moment';
    }

    list.innerHTML = sorted.map(function (p) {
      var st = perkStatus(p);
      var hasDetail = p.claim || p.url;
      var detail = '';
      if (hasDetail) {
        detail = unlocked
          ? '<div class="perk-claim">' +
              (p.claim ? '<p>' + esc(p.claim) + '</p>' : '') +
              (p.url ? '<a class="btn btn-ink" href="' + esc(p.url) + '" target="_blank" rel="noopener">Go &#x2197;</a>' : '') +
            '</div>'
          : '<p class="perk-locked">Claim details locked</p>';
      }
      return '<article class="perk perk-' + st + (p.banner ? ' has-banner' : '') + '">' +
        (p.banner ? '<span class="perk-banner" style="background-image:url(&quot;' + esc(p.banner) + '&quot;)" role="img" aria-label="' + esc(p.collection) + '"></span>' : '') +
        '<div class="perk-body">' +
          '<div class="perk-top">' +
            '<h3>' + esc(p.collection) + '</h3>' +
            '<span class="perk-status">' + st + '</span>' +
          '</div>' +
          (p.by ? '<p class="perk-by">by ' + esc(p.by) + '</p>' : '') +
          '<p class="perk-what">' + esc(p.perk) + '</p>' +
          (p.note ? '<p class="perk-note">' + esc(p.note) + '</p>' : '') +
          (p.link ? '<p class="perk-link"><a href="' + esc(p.link) + '" target="_blank" rel="noopener">Follow the project &#x2197;</a></p>' : '') +
          '<p class="perk-meta">' +
            chainTags(p.chain) +
            (p.date ? '<span>' + prettyDate(p.date) + '</span>' : '') +
          '</p>' +
          detail +
        '</div>' +
      '</article>';
    }).join('');

    if (door) door.hidden = unlocked || !sorted.some(function (p) { return p.claim || p.url; });
  }

  /* ---------- the door ---------- */

  function initDoor() {
    var btn = $('perks-unlock');
    if (!btn) return;
    var input = $('perks-password');
    var err = $('perks-door-error');

    function go() {
      var pass = input.value.trim();
      if (!pass) { err.textContent = 'Enter the password.'; return; }
      btn.disabled = true;
      err.textContent = 'Checking…';
      checkPassword(pass).then(function (res) {
        btn.disabled = false;
        if (res.ok) {
          unlocked = true;
          rememberUnlocked();
          err.textContent = '';
          input.value = '';
          render();
          return;
        }
        err.textContent = res.error || "That's not it. Ask in the chat.";
        input.select();
      }).catch(function () {
        btn.disabled = false;
        err.textContent = 'Could not reach the door. Try again.';
      });
    }

    btn.addEventListener('click', go);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); go(); }
    });
  }

  /* ---------- boot ---------- */

  function init() {
    if (!$('perks-list')) return;
    unlocked = readUnlocked();
    initDoor();
    fetch('data/perks.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { perks = (d && d.perks) || []; render(); })
      .catch(function () { perks = []; render(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

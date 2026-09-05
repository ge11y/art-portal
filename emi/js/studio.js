/* ============================================================
   EMI STUDIO
   Pick any Emi by number, flip its background, take it home.
   No wallet, no connection — every piece is public.
   ============================================================ */
(function () {
  'use strict';

  var TOTAL = 222;
  var CONTRACT = '0x9a08c037e631e901ed205a26e7632148f48e3d9c';
  var RPC = 'https://rpc.mainnet.chain.robinhood.com';
  var OPENSEA = 'https://opensea.io/item/robinhood/' + CONTRACT + '/';
  var ART = 'art/';

  // The collection's two grounds, sampled from the artwork itself.
  var GREEN = [204, 255, 1];
  var BLACK = [6, 3, 3];
  var WHITE = [255, 255, 255];

  var manifest = null;      // { green: [...], black: [...] }
  var greenSet = null;
  var current = 1;
  var mode = 'native';      // native | green | black
  var loaded = {};          // token -> HTMLImageElement
  var renderToken = 0;      // guards against out-of-order async renders

  var $ = function (id) { return document.getElementById(id); };
  var canvas, ctx, numInput, ownerEl, statusEl, dlBtn, openseaLink, modeBtns;

  /* ---------- the recolour ----------
     Every piece is a duotone: one ground, and marks sitting on it. OgBe drew
     the black pieces with white marks and the green pieces with black ones,
     so a background swap has to carry the marks across too. Keeping the ink
     black on a black ground erases whole figures; putting white marks on
     green washes them out. So we measure how far each pixel sits from its
     own ground, then re-lay that same figure in the target pair.

     Marks on black are white. Marks on green are black. */

  /* How much of this pixel is figure rather than ground, anti-aliasing
     included. A mark is anything that is not the ground, and OgBe uses all
     three colours both ways round: green pieces carry black ink, and 39 of
     the black pieces carry green. Taking the strongest direction of the two
     possible marks keeps those details instead of flattening them. */
  function markWeight(px, py, pz, ground, marks) {
    var best = 0;
    var dr = px - ground[0], dg = py - ground[1], db = pz - ground[2];
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var ur = m[0] - ground[0], ug = m[1] - ground[1], ub = m[2] - ground[2];
      var len = ur * ur + ug * ug + ub * ub;
      if (len < 1) continue;
      var t = (dr * ur + dg * ug + db * ub) / len;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      if (t > best) best = t;
    }
    return best;
  }

  function recolor(imgData, ground, targetGround, targetMark, marks) {
    var d = imgData.data;
    for (var i = 0; i < d.length; i += 4) {
      var w = markWeight(d[i], d[i + 1], d[i + 2], ground, marks);
      d[i]     = targetGround[0] + (targetMark[0] - targetGround[0]) * w;
      d[i + 1] = targetGround[1] + (targetMark[1] - targetGround[1]) * w;
      d[i + 2] = targetGround[2] + (targetMark[2] - targetGround[2]) * w;
    }
    return imgData;
  }

  /* ---------- loading ---------- */

  function isGreen(n) { return greenSet ? greenSet.has(n) : false; }

  function loadArt(n) {
    if (loaded[n]) return Promise.resolve(loaded[n]);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { loaded[n] = img; resolve(img); };
      img.onerror = function () { reject(new Error('could not load #' + n)); };
      img.src = ART + n + '.png';
    });
  }

  /* ---------- drawing ---------- */

  function draw(n) {
    var mine = ++renderToken;
    setStatus('Loading #' + n + '…');
    return loadArt(n).then(function (img) {
      if (mine !== renderToken) return;          // a newer request won
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      var green = isGreen(n);
      var native = green ? 'green' : 'black';
      var want = mode === 'native' ? native : mode;

      if (want !== native) {
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var ground = green ? GREEN : BLACK;
        // Marks on black are white; marks on green are black.
        recolor(data, ground,
          want === 'green' ? GREEN : BLACK,
          want === 'green' ? BLACK : WHITE,
          green ? [WHITE, BLACK] : [WHITE, GREEN]);
        ctx.putImageData(data, 0, 0);
      }
      canvas.setAttribute('aria-label', 'EMI #' + n);
      setStatus('');
    }).catch(function (err) {
      if (mine === renderToken) setStatus(err.message + '. Try another number.');
    });
  }

  function setStatus(msg) {
    statusEl.textContent = msg;
    statusEl.hidden = !msg;
  }

  /* ---------- owner, read-only ---------- */

  function showOwner(n) {
    ownerEl.textContent = '';
    var mine = renderToken;
    var data = '0x6352211e' + n.toString(16).padStart(64, '0');
    fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: CONTRACT, data: data }, 'latest']
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (mine !== renderToken) return;
        var res = j && j.result;
        if (!res || res.length < 66) return;
        var addr = '0x' + res.slice(-40);
        ownerEl.innerHTML = 'Held by <a href="https://opensea.io/' + addr +
          '" target="_blank" rel="noopener">' + addr.slice(0, 6) + '…' + addr.slice(-4) + '</a>';
      })
      .catch(function () { /* the chain is a nicety here, not a dependency */ });
  }

  /* ---------- state ---------- */

  function show(n, skipInput) {
    n = Math.min(TOTAL, Math.max(1, parseInt(n, 10) || 1));
    current = n;
    if (!skipInput) numInput.value = n;
    openseaLink.href = OPENSEA + n;
    updateModeButtons();
    draw(n);
    showOwner(n);
    if (history.replaceState) history.replaceState(null, '', '#emi-' + n);
  }

  function updateModeButtons() {
    var native = isGreen(current) ? 'green' : 'black';
    modeBtns.forEach(function (b) {
      var m = b.dataset.mode;
      var on = m === mode;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (m === 'native') {
        b.textContent = native === 'green' ? 'As minted (green)' : 'As minted (black)';
      }
    });
  }

  /* ---------- the holders' door ----------
     Swapping grounds is for holders. The password is checked on the server so
     it never ships in this file; getting it is a matter of being in the chat. */

  var UNLOCK_KEY = 'emi-studio-unlocked';
  var unlocked = false;

  function readUnlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === 'yes'; } catch (e) { return false; }
  }
  function rememberUnlocked() {
    try { localStorage.setItem(UNLOCK_KEY, 'yes'); } catch (e) { /* private window */ }
  }

  function applyLockState() {
    document.body.classList.toggle('is-unlocked', unlocked);
    modeBtns.forEach(function (b) {
      if (b.dataset.mode === 'native') return;
      b.classList.toggle('locked', !unlocked);
    });
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

  function openDoor(pendingMode) {
    var door = $('studio-door');
    door.hidden = false;
    door.dataset.pending = pendingMode || '';
    $('door-error').textContent = '';
    $('door-password').focus();
  }

  function closeDoor() {
    var door = $('studio-door');
    door.hidden = true;
    $('door-password').value = '';
    $('door-error').textContent = '';
  }

  function tryUnlock() {
    var input = $('door-password');
    var err = $('door-error');
    var btn = $('door-submit');
    var pass = input.value.trim();
    if (!pass) { err.textContent = 'Enter the password.'; return; }

    btn.disabled = true;
    err.textContent = 'Checking…';
    checkPassword(pass)
      .then(function (res) {
        btn.disabled = false;
        if (res.ok) {
          unlocked = true;
          rememberUnlocked();
          applyLockState();
          var pending = $('studio-door').dataset.pending;
          closeDoor();
          if (pending) setMode(pending);
          return;
        }
        err.textContent = res.error || "That's not it. Ask in the chat.";
        input.select();
      })
      .catch(function () {
        btn.disabled = false;
        err.textContent = 'Could not reach the door. Try again.';
      });
  }

  function setMode(m) {
    if (m !== 'native' && !unlocked) { openDoor(m); return; }
    mode = m;
    updateModeButtons();
    draw(current);
  }

  function download() {
    var name = 'emi-' + current + (mode === 'native' ? '' : '-' + mode) + '.png';
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }, 'image/png');
  }

  /* ---------- grid ---------- */

  function motifsOf(n) {
    if (!manifest || !manifest.motifs) return '';
    var out = [];
    Object.keys(manifest.motifs).forEach(function (name) {
      if (manifest.motifs[name].indexOf(n) !== -1) out.push(name);
    });
    return out.join(' ');
  }

  function renderGrid() {
    var grid = $('grid');
    if (!grid) return;
    var html = '';
    for (var i = 1; i <= TOTAL; i++) {
      var pad = i < 10 ? '00' + i : i < 100 ? '0' + i : '' + i;
      html += '<button class="tile has-art" type="button" data-n="' + i +
        '" data-ground="' + (isGreen(i) ? 'green' : 'black') + '"' +
        ' data-motifs="' + motifsOf(i) + '"' +
        ' aria-label="Open EMI #' + i + ' in the studio">' +
        '<img src="' + ART + i + '.png" alt="" loading="lazy" width="400" height="400" />' +
        '<span class="tile-num">' + pad + '</span></button>';
    }
    grid.innerHTML = html;
    grid.addEventListener('click', function (e) {
      var t = e.target.closest('.tile');
      if (!t) return;
      show(parseInt(t.dataset.n, 10));
      document.getElementById('studio').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }


  /* ---------- filters ----------
     Ground is measured from the artwork itself. Anything else comes from
     manifest.motifs, so new groupings are a data edit, never a code change. */

  function renderFilters() {
    var bar = $('grid-filters');
    if (!bar || !manifest) return;
    var groups = [{ kind: 'all', value: '', label: 'All', n: TOTAL }];
    groups.push({ kind: 'ground', value: 'green', label: 'Green ground', n: manifest.green.length });
    groups.push({ kind: 'ground', value: 'black', label: 'Black ground', n: manifest.black.length });
    var m = manifest.motifs || {};
    Object.keys(m).forEach(function (name) {
      groups.push({ kind: 'motif', value: name, label: name, n: m[name].length });
    });

    bar.innerHTML = groups.map(function (g, i) {
      return '<button class="chip" type="button" data-kind="' + g.kind + '" data-value="' + g.value +
        '" aria-pressed="' + (i === 0 ? 'true' : 'false') + '">' + g.label +
        ' <em>' + g.n + '</em></button>';
    }).join('');

    bar.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      Array.prototype.forEach.call(bar.querySelectorAll('.chip'), function (c) {
        c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
      });
      applyFilter(chip.dataset.kind, chip.dataset.value);
    });
  }

  function applyFilter(kind, value) {
    var grid = $('grid');
    if (!grid) return;
    var shown = 0;
    Array.prototype.forEach.call(grid.querySelectorAll('.tile'), function (t) {
      var ok = kind === 'all'
        || (kind === 'ground' && t.dataset.ground === value)
        || (kind === 'motif' && (' ' + t.dataset.motifs + ' ').indexOf(' ' + value + ' ') !== -1);
      t.hidden = !ok;
      if (ok) shown++;
    });
    var note = $('grid-count');
    if (note) note.textContent = shown === TOTAL ? '' : 'Showing ' + shown + ' of ' + TOTAL;
  }


  /* ---------- boot ---------- */

  function init() {
    canvas = $('studio-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    numInput = $('emi-number');
    ownerEl = $('emi-owner');
    statusEl = $('studio-status');
    dlBtn = $('emi-download');
    openseaLink = $('emi-opensea');
    modeBtns = Array.prototype.slice.call(document.querySelectorAll('[data-mode]'));

    modeBtns.forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.dataset.mode); });
    });

    unlocked = readUnlocked();
    applyLockState();
    $('door-submit').addEventListener('click', tryUnlock);
    $('door-cancel').addEventListener('click', closeDoor);
    $('door-password').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
      if (e.key === 'Escape') closeDoor();
    });
    dlBtn.addEventListener('click', download);
    $('emi-prev').addEventListener('click', function () { show(current === 1 ? TOTAL : current - 1); });
    $('emi-next').addEventListener('click', function () { show(current === TOTAL ? 1 : current + 1); });
    $('emi-random').addEventListener('click', function () { show(Math.floor(Math.random() * TOTAL) + 1); });

    numInput.addEventListener('change', function () { show(numInput.value); });
    numInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); show(numInput.value); numInput.blur(); }
    });

    fetch('data/emi.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        if (m && m.green) { manifest = m; greenSet = new Set(m.green); }
      })
      .catch(function () {})
      .then(function () {
        renderGrid();
        renderFilters();
        var hash = (location.hash.match(/^#emi-(\d+)$/) || [])[1];
        show(hash ? parseInt(hash, 10) : Math.floor(Math.random() * TOTAL) + 1);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

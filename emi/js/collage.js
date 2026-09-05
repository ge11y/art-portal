/* ============================================================
   EMI COLLAGE
   Paste a wallet, get the pieces it holds, arrange them, take the
   picture away. Ownership is read straight off Robinhood Chain, so
   nothing is stored and nothing needs connecting.
   ============================================================ */
(function () {
  'use strict';

  var CONTRACT = '0x9a08c037e631e901ed205a26e7632148f48e3d9c';
  var RPC = 'https://rpc.mainnet.chain.robinhood.com';
  var TOTAL = 222;
  var BATCH = 50;                 // the node refuses much larger bundles
  var ART = 'art/';
  var $ = function (id) { return document.getElementById(id); };

  var GREEN = [204, 255, 1], BLACK = [6, 3, 3], WHITE = [255, 255, 255];

  var manifest = null, greenSet = null;
  var owned = [];                 // token ids, in display order
  var picked = -1;                // first half of a swap
  var ground = 'native';

  /* ---------- chain ---------- */

  function ownerOfBatch(ids) {
    var body = ids.map(function (id) {
      return {
        jsonrpc: '2.0', id: id, method: 'eth_call',
        params: [{ to: CONTRACT, data: '0x6352211e' + id.toString(16).padStart(64, '0') }, 'latest']
      };
    });
    return fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('rpc ' + r.status);
      return r.json();
    });
  }

  function scan(address) {
    var want = address.toLowerCase();
    var found = [];
    var chunks = [];
    for (var s = 1; s <= TOTAL; s += BATCH) {
      var ids = [];
      for (var i = s; i < s + BATCH && i <= TOTAL; i++) ids.push(i);
      chunks.push(ids);
    }
    var done = 0;
    function step(i) {
      if (i >= chunks.length) return Promise.resolve(found);
      return ownerOfBatch(chunks[i]).then(function (rows) {
        rows.forEach(function (row) {
          if (!row.result) return;
          if ('0x' + row.result.slice(-40).toLowerCase() === want) found.push(row.id);
        });
        done += chunks[i].length;
        setStatus('Reading the chain… ' + done + ' of ' + TOTAL);
        return new Promise(function (r) { setTimeout(r, 120); }).then(function () { return step(i + 1); });
      });
    }
    return step(0);
  }

  /* ---------- the pieces ---------- */

  function isGreen(n) { return greenSet ? greenSet.has(n) : false; }

  function load(n) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error(n)); };
      img.src = ART + n + '.png';
    });
  }

  /* Marks invert with the ground, the same rule the studio uses. A mark is
     anything that is not the ground: green pieces carry black ink, and many
     of the black pieces carry green, so both directions are considered. */
  function recolour(data, from, toGround, toMark, marks) {
    var d = data.data;
    for (var i = 0; i < d.length; i += 4) {
      var dr = d[i] - from[0], dg = d[i + 1] - from[1], db = d[i + 2] - from[2];
      var best = 0;
      for (var k = 0; k < marks.length; k++) {
        var m = marks[k];
        var ur = m[0] - from[0], ug = m[1] - from[1], ub = m[2] - from[2];
        var len = ur * ur + ug * ug + ub * ub;
        if (len < 1) continue;
        var t = (dr * ur + dg * ug + db * ub) / len;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (t > best) best = t;
      }
      d[i]     = toGround[0] + (toMark[0] - toGround[0]) * best;
      d[i + 1] = toGround[1] + (toMark[1] - toGround[1]) * best;
      d[i + 2] = toGround[2] + (toMark[2] - toGround[2]) * best;
    }
    return data;
  }

  function drawPiece(cx, img, n, x, y, size) {
    var native = isGreen(n) ? 'green' : 'black';
    var want = ground === 'native' ? native : ground;
    cx.drawImage(img, x, y, size, size);
    if (want === native) return;
    var data = cx.getImageData(x, y, size, size);
    recolour(data, isGreen(n) ? GREEN : BLACK,
             want === 'green' ? GREEN : BLACK,
             want === 'green' ? BLACK : WHITE,
             isGreen(n) ? [WHITE, BLACK] : [WHITE, GREEN]);
    cx.putImageData(data, x, y);
  }

  /* ---------- rendering ---------- */

  function cols() { return parseInt($('collage-cols').value, 10) || 4; }
  function gap() { return parseInt($('collage-gap').value, 10) || 0; }

  function renderGrid() {
    var box = $('collage-grid');
    box.style.gridTemplateColumns = 'repeat(' + cols() + ', 1fr)';
    box.innerHTML = owned.map(function (n, i) {
      return '<button class="cell' + (i === picked ? ' picked' : '') + '" type="button" data-i="' + i +
        '" aria-label="EMI #' + n + '"><img src="' + ART + n + '.png" alt="" loading="lazy" />' +
        '<span class="cell-num">' + n + '</span></button>';
    }).join('');
    box.dataset.ground = ground;
    $('collage-count').textContent = owned.length
      ? owned.length + (owned.length === 1 ? ' piece' : ' pieces')
      : '';
  }

  function buildCanvas(size) {
    var c = cols(), g = gap();
    var rows = Math.ceil(owned.length / c);
    var cv = document.createElement('canvas');
    cv.width = c * size + (c + 1) * g;
    cv.height = rows * size + (rows + 1) * g;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    var bg = ground === 'black' ? BLACK : ground === 'green' ? GREEN : [255, 255, 255];
    cx.fillStyle = 'rgb(' + bg.join(',') + ')';
    cx.fillRect(0, 0, cv.width, cv.height);
    return Promise.all(owned.map(load)).then(function (imgs) {
      imgs.forEach(function (img, i) {
        var x = g + (i % c) * (size + g);
        var y = g + Math.floor(i / c) * (size + g);
        drawPiece(cx, img, owned[i], x, y, size);
      });
      return cv;
    });
  }

  function download() {
    if (!owned.length) return;
    var btn = $('collage-download');
    btn.disabled = true;
    setStatus('Drawing the collage…');
    buildCanvas(500).then(function (cv) {
      cv.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'emi-collage-' + owned.length + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        btn.disabled = false;
        setStatus('Saved a ' + cv.width + ' by ' + cv.height + ' collage.');
      }, 'image/png');
    }).catch(function () {
      btn.disabled = false;
      setStatus('Could not draw the collage.');
    });
  }

  function setStatus(msg) {
    $('collage-status').textContent = msg || '';
  }

  /* ---------- ui ---------- */

  function look() {
    var a = ($('collage-address').value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      setStatus('That does not look like a wallet address.');
      return;
    }
    $('collage-go').disabled = true;
    owned = []; picked = -1;
    renderGrid();
    setStatus('Reading the chain…');
    scan(a).then(function (ids) {
      $('collage-go').disabled = false;
      owned = ids.sort(function (x, y) { return x - y; });
      renderGrid();
      $('collage-tools').hidden = owned.length === 0;
      setStatus(owned.length
        ? 'Found ' + owned.length + '. Tap two to swap them around.'
        : 'That wallet does not hold an Emi.');
    }).catch(function () {
      $('collage-go').disabled = false;
      setStatus('Could not reach the chain. Try again in a moment.');
    });
  }

  function init() {
    if (!$('collage-grid')) return;

    fetch('data/emi.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { if (m && m.green) { manifest = m; greenSet = new Set(m.green); } })
      .catch(function () {});

    $('collage-go').addEventListener('click', look);
    $('collage-address').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); look(); }
    });

    // tap one, tap another, they trade places
    $('collage-grid').addEventListener('click', function (e) {
      var cell = e.target.closest('.cell'); if (!cell) return;
      var i = +cell.dataset.i;
      if (picked === -1) { picked = i; renderGrid(); return; }
      if (picked === i) { picked = -1; renderGrid(); return; }
      var tmp = owned[picked]; owned[picked] = owned[i]; owned[i] = tmp;
      picked = -1;
      renderGrid();
    });

    $('collage-cols').addEventListener('input', function () {
      $('collage-cols-val').textContent = cols();
      renderGrid();
    });
    $('collage-gap').addEventListener('input', function () {
      $('collage-gap-val').textContent = gap();
      $('collage-grid').style.gap = gap() + 'px';
    });
    document.querySelectorAll('[data-ground]').forEach(function (b) {
      b.addEventListener('click', function () {
        ground = b.dataset.ground;
        document.querySelectorAll('[data-ground]').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x.dataset.ground === ground));
        });
        renderGrid();
      });
    });
    $('collage-sort').addEventListener('click', function () {
      owned.sort(function (a, b) { return a - b; });
      picked = -1; renderGrid();
      setStatus('Back in number order.');
    });
    $('collage-download').addEventListener('click', download);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ============================================================
   EMI BEATS — an MPC-style pad machine
   Sixteen pads, sixteen steps, one bar. Everything is synthesised
   in the browser, so it works with nothing to download.

   The voices are placeholders for OgBe's own hits: KIT below is the
   only thing that needs to change. Give an entry a `sample` url and
   it plays that instead of the synth.
   ============================================================ */
(function () {
  'use strict';

  var STEPS = 16;
  var UNLOCK_KEY = 'emi-studio-unlocked';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- the kit ---------- */

  var KIT = [
    { name: 'Kick',     type: 'kick',  f: 52 },
    { name: 'Sub',      type: 'kick',  f: 38, long: true },
    { name: 'Snare',    type: 'snare', f: 190 },
    { name: 'Rim',      type: 'rim',   f: 420 },
    { name: 'Clap',     type: 'clap' },
    { name: 'Hat',      type: 'hat',   d: 0.045 },
    { name: 'Open hat', type: 'hat',   d: 0.32 },
    { name: 'Shaker',   type: 'shaker' },
    { name: 'Tom lo',   type: 'tom',   f: 110 },
    { name: 'Tom mid',  type: 'tom',   f: 165 },
    { name: 'Tom hi',   type: 'tom',   f: 240 },
    { name: 'Bell',     type: 'bell' },
    { name: 'Bass',     type: 'bass',  f: 65 },
    { name: 'Blip',     type: 'blip',  f: 880 },
    { name: 'Sweep',    type: 'sweep' },
    { name: 'Zap',      type: 'zap' }
  ];

  var ctx = null, master = null;
  var noiseCache = new WeakMap();

  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = buildOut(ctx);
    return ctx;
  }

  /* Sixteen voices landing together overshoot full scale easily, so the mix
     runs into a limiter before it reaches the output. The offline render uses
     the same chain, which is why the file sounds like the machine. */
  function buildOut(ac) {
    var g = ac.createGain();
    g.gain.value = 0.7;
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 6;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    g.connect(comp); comp.connect(ac.destination);
    return g;
  }

  /* Every voice takes the context it should build in, so the same code drives
     the live machine and the offline render that becomes the WAV. */

  function noiseBuffer(ac) {
    var cached = noiseCache.get(ac);
    if (cached) return cached;
    var n = Math.floor(ac.sampleRate * 1.2);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ac, buf);
    return buf;
  }

  function env(node, t, peak, decay, hold) {
    var g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + 0.004);
    g.exponentialRampToValueAtTime(0.0001, t + (hold || 0) + decay);
  }

  function noise(ac, dest, t, decay, hp, lp, peak) {
    var s = ac.createBufferSource(); s.buffer = noiseBuffer(ac);
    var f = ac.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass';
    f.frequency.value = hp || lp || 8000;
    var g = ac.createGain();
    env(g, t, peak == null ? 0.6 : peak, decay);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t); s.stop(t + decay + 0.1);
  }

  function tone(ac, dest, t, type, from, to, decay, peak) {
    var o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + decay);
    var g = ac.createGain();
    env(g, t, peak == null ? 0.8 : peak, decay);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + decay + 0.05);
  }

  function voice(ac, dest, i, t) {
    var v = KIT[i];
    if (!v) return;
    if (v.buffer) {                       // OgBe's hits, once they exist
      var s = ac.createBufferSource(); s.buffer = v.buffer;
      var g = ac.createGain(); g.gain.value = 0.9;
      s.connect(g); g.connect(dest); s.start(t);
      return;
    }
    switch (v.type) {
      case 'kick':   tone(ac, dest, t, 'sine', v.f * 2.6, v.f * 0.5, v.long ? 0.55 : 0.34, 0.95); break;
      case 'snare':  tone(ac, dest, t, 'triangle', v.f, v.f * 0.6, 0.13, 0.35); noise(ac, dest, t, 0.17, 1400, 0, 0.5); break;
      case 'rim':    tone(ac, dest, t, 'square', v.f, v.f * 0.7, 0.045, 0.32); noise(ac, dest, t, 0.03, 2500, 0, 0.25); break;
      case 'clap':
        [0, 0.012, 0.024].forEach(function (o) { noise(ac, dest, t + o, 0.05, 1100, 0, 0.32); });
        noise(ac, dest, t + 0.036, 0.16, 900, 0, 0.28);
        break;
      case 'hat':    noise(ac, dest, t, v.d, 7200, 0, 0.28); break;
      case 'shaker': noise(ac, dest, t, 0.09, 5200, 0, 0.2); break;
      case 'tom':    tone(ac, dest, t, 'sine', v.f * 1.6, v.f * 0.7, 0.28, 0.6); break;
      case 'bell':   tone(ac, dest, t, 'square', 800, 795, 0.28, 0.14); tone(ac, dest, t, 'square', 1200, 1195, 0.28, 0.12); break;
      case 'bass':   tone(ac, dest, t, 'sawtooth', v.f, v.f, 0.30, 0.32); break;
      case 'blip':   tone(ac, dest, t, 'square', v.f, v.f * 2, 0.07, 0.22); break;
      case 'sweep':  noise(ac, dest, t, 0.4, 300, 0, 0.22); tone(ac, dest, t, 'sine', 200, 2000, 0.4, 0.12); break;
      case 'zap':    tone(ac, dest, t, 'sawtooth', 1400, 90, 0.16, 0.3); break;
    }
  }

  function play(i, t) {
    if (!ctx) return;
    voice(ctx, master, i, t);
  }

  /* ---------- pattern ---------- */

  var pattern = KIT.map(function () { return new Array(STEPS).fill(false); });
  var selected = 0, tempo = 92, swing = 0.12, playing = false, current = -1;

  /* a bar is 256 on/off cells, which packs into 32 bytes and then into a
     link short enough to paste into a chat */
  function encode() {
    var bytes = new Uint8Array(KIT.length * STEPS / 8);
    var bit = 0;
    for (var r = 0; r < KIT.length; r++)
      for (var s = 0; s < STEPS; s++, bit++)
        if (pattern[r][s]) bytes[bit >> 3] |= (1 << (bit & 7));
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(str) {
    try {
      var bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
      var bit = 0;
      for (var r = 0; r < KIT.length; r++)
        for (var s = 0; s < STEPS; s++, bit++) {
          var byte = bin.charCodeAt(bit >> 3) || 0;
          pattern[r][s] = !!(byte & (1 << (bit & 7)));
        }
      return true;
    } catch (e) { return false; }
  }

  function readHash() {
    var m = location.hash.match(/p=([A-Za-z0-9\-_]+)/);
    var t = location.hash.match(/t=(\d+)/);
    if (t) tempo = Math.min(200, Math.max(50, parseInt(t[1], 10)));
    return m ? decode(m[1]) : false;
  }


  /* ---------- randomise ----------
     Straight coin-flips across sixteen voices give a wall of noise. Each voice
     instead has the steps it usually lands on and a small chance elsewhere, and
     only a handful of voices are picked per roll, so a bar has room in it. */

  var PROFILE = [
    { anchor: [0, 8],                        p: 0.08, core: true  },  // Kick
    { anchor: [0],                           p: 0.05 },               // Sub
    { anchor: [4, 12],                       p: 0.04, core: true  },  // Snare
    { anchor: [7],                           p: 0.07 },               // Rim
    { anchor: [12],                          p: 0.04 },               // Clap
    { anchor: [0, 2, 4, 6, 8, 10, 12, 14],   p: 0.16, core: true  },  // Hat
    { anchor: [14],                          p: 0.05 },               // Open hat
    { anchor: [],                            p: 0.18 },               // Shaker
    { anchor: [],                            p: 0.05 },               // Tom lo
    { anchor: [],                            p: 0.05 },               // Tom mid
    { anchor: [],                            p: 0.05 },               // Tom hi
    { anchor: [],                            p: 0.06 },               // Bell
    { anchor: [0, 6],                        p: 0.07 },               // Bass
    { anchor: [],                            p: 0.08 },               // Blip
    { anchor: [],                            p: 0.03 },               // Sweep
    { anchor: [],                            p: 0.04 }                // Zap
  ];

  function randomize() {
    var density = 0.7 + Math.random() * 0.8;
    var extras = [];
    for (var i = 0; i < KIT.length; i++) if (!PROFILE[i].core) extras.push(i);
    // shuffle, then keep two to four of the non-core voices
    for (var k = extras.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = extras[k]; extras[k] = extras[j]; extras[j] = tmp;
    }
    var keep = {};
    extras.slice(0, 2 + Math.floor(Math.random() * 3)).forEach(function (i) { keep[i] = true; });

    for (var r = 0; r < KIT.length; r++) {
      var prof = PROFILE[r];
      var playing = prof.core || keep[r];
      for (var s = 0; s < STEPS; s++) {
        if (!playing) { pattern[r][s] = false; continue; }
        var onAnchor = prof.anchor.indexOf(s) !== -1;
        var chance = onAnchor ? 0.88 : prof.p * density;
        pattern[r][s] = Math.random() < chance;
      }
    }
    renderSteps(); markPads();
    $('beat-share-out').textContent = '';
  }

  function clearAll() {
    pattern = KIT.map(function () { return new Array(STEPS).fill(false); });
    renderSteps(); markPads();
    $('beat-share-out').textContent = '';
  }

  function clearTrack() {
    pattern[selected] = new Array(STEPS).fill(false);
    renderSteps(); markPads();
  }

  /* ---------- transport ---------- */

  var nextTime = 0, nextStep = 0, timer = null;
  var LOOKAHEAD = 0.12;

  function stepDur() { return 60 / tempo / 4; }

  function schedule() {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      var s = nextStep;
      var t = nextTime + ((s % 2) ? stepDur() * swing : 0);
      for (var r = 0; r < KIT.length; r++) if (pattern[r][s]) play(r, t);
      paintStep(s, nextTime);
      nextTime += stepDur();
      nextStep = (nextStep + 1) % STEPS;
    }
    timer = setTimeout(schedule, 25);
  }

  var painted = [];
  function paintStep(s, when) {
    painted.push({ s: s, when: when });
  }

  function frame() {
    if (!playing) return;
    var now = ctx ? ctx.currentTime : 0;
    while (painted.length && painted[0].when <= now) { current = painted.shift().s; }
    var cells = document.querySelectorAll('#beat-steps .step');
    for (var i = 0; i < cells.length; i++) cells[i].classList.toggle('now', i === current);
    var pads = document.querySelectorAll('#beat-pads .pad');
    for (var r = 0; r < pads.length; r++) {
      pads[r].classList.toggle('hit', current >= 0 && pattern[r][current]);
    }
    requestAnimationFrame(frame);
  }

  function start() {
    if (!ensureCtx()) return;
    playing = true;
    nextStep = 0; painted = [];
    nextTime = ctx.currentTime + 0.05;
    schedule();
    requestAnimationFrame(frame);
    $('beat-play').textContent = 'Stop';
    $('beat-play').setAttribute('aria-pressed', 'true');
  }

  function stop() {
    playing = false;
    clearTimeout(timer);
    current = -1;
    document.querySelectorAll('#beat-steps .step').forEach(function (c) { c.classList.remove('now'); });
    document.querySelectorAll('#beat-pads .pad').forEach(function (c) { c.classList.remove('hit'); });
    $('beat-play').textContent = 'Play';
    $('beat-play').setAttribute('aria-pressed', 'false');
  }


  /* ---------- saved beats ----------
     Kept in this browser only. Nothing is uploaded, so a saved beat is private
     until its owner copies the link and posts it. */

  var SAVE_KEY = 'emi-beats-saved';

  function readSaves() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; }
    catch (e) { return []; }
  }

  function writeSaves(list) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }   // private window, or the box is full
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  function renderSaves() {
    var list = readSaves();
    var box = $('beat-saved');
    var empty = $('beat-saved-empty');
    if (!box) return;
    empty.hidden = list.length > 0;
    box.innerHTML = list.map(function (b, i) {
      return '<li class="saved-row">' +
        '<span class="saved-name">' + esc(b.name) + '</span>' +
        '<span class="saved-meta">' + b.tempo + ' bpm</span>' +
        '<button class="linky" type="button" data-load="' + i + '">Load</button>' +
        '<button class="linky" type="button" data-del="' + i + '">Delete</button>' +
        '</li>';
    }).join('');
  }

  function saveCurrent() {
    var input = $('beat-name');
    var out = $('beat-save-out');
    var name = (input.value || '').trim().slice(0, 40);
    if (!name) name = 'Untitled ' + (readSaves().length + 1);
    if (!pattern.some(function (r) { return r.some(Boolean); })) {
      out.textContent = 'Nothing to save yet.';
      return;
    }
    var list = readSaves();
    var existing = list.findIndex(function (b) { return b.name === name; });
    var entry = { name: name, p: encode(), tempo: tempo, at: Date.now() };
    if (existing >= 0) list[existing] = entry; else list.unshift(entry);
    if (list.length > 24) list.length = 24;
    if (!writeSaves(list)) { out.textContent = 'This browser will not let the page save.'; return; }
    input.value = '';
    out.textContent = existing >= 0 ? 'Replaced "' + name + '".' : 'Saved as "' + name + '".';
    renderSaves();
  }

  function loadSave(i) {
    var b = readSaves()[i];
    if (!b) return;
    decode(b.p);
    tempo = b.tempo || tempo;
    $('beat-tempo').value = tempo;
    $('beat-tempo-val').textContent = tempo;
    renderSteps(); markPads();
    $('beat-save-out').textContent = 'Loaded "' + b.name + '".';
  }

  function deleteSave(i) {
    var list = readSaves();
    var gone = list.splice(i, 1)[0];
    writeSaves(list);
    renderSaves();
    $('beat-save-out').textContent = gone ? 'Deleted "' + gone.name + '".' : '';
  }


  /* ---------- render to WAV ----------
     The bar is played once more into an OfflineAudioContext, which runs as
     fast as it can rather than in real time, then the samples are wrapped in
     a WAV header. Nothing leaves the browser. */

  function encodeWav(buf, rate) {
    var n = buf.length;
    var out = new ArrayBuffer(44 + n * 2);
    var v = new DataView(out);
    function str(off, s) { for (var i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
    str(0, 'RIFF');  v.setUint32(4, 36 + n * 2, true);
    str(8, 'WAVE');  str(12, 'fmt ');
    v.setUint32(16, 16, true);          // PCM chunk size
    v.setUint16(20, 1, true);           // PCM
    v.setUint16(22, 1, true);           // mono
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);    // byte rate
    v.setUint16(32, 2, true);           // block align
    v.setUint16(34, 16, true);          // bits
    str(36, 'data'); v.setUint32(40, n * 2, true);
    var o = 44;
    for (var i = 0; i < n; i++, o += 2) {
      var x = buf[i];
      x = x < -1 ? -1 : x > 1 ? 1 : x;
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7FFF, true);
    }
    return new Blob([out], { type: 'audio/wav' });
  }

  function renderWav(bars) {
    var RATE = 44100;
    var dur = stepDur() * STEPS * bars;
    var tail = 0.6;                       // let the last hit ring out
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('no offline audio'));
    var oac = new OAC(1, Math.ceil((dur + tail) * RATE), RATE);
    var out = buildOut(oac);

    for (var bar = 0; bar < bars; bar++) {
      for (var s = 0; s < STEPS; s++) {
        var t = (bar * STEPS + s) * stepDur() + ((s % 2) ? stepDur() * swing : 0);
        for (var r = 0; r < KIT.length; r++) if (pattern[r][s]) voice(oac, out, r, t);
      }
    }
    return oac.startRendering().then(function (rendered) {
      var data = rendered.getChannelData(0);
      // leave a decibel of headroom rather than shipping a file that clips
      var peak = 0;
      for (var i = 0; i < data.length; i++) { var a = Math.abs(data[i]); if (a > peak) peak = a; }
      if (peak > 0.891) {
        var k = 0.891 / peak;
        for (var j = 0; j < data.length; j++) data[j] *= k;
      }
      return encodeWav(data, RATE);
    });
  }

  function download() {
    if (!pattern.some(function (r) { return r.some(Boolean); })) {
      $('beat-dl-out').textContent = 'Nothing to render yet.';
      return;
    }
    var btn = $('beat-download');
    var bars = parseInt($('beat-bars').value, 10) || 4;
    btn.disabled = true;
    $('beat-dl-out').textContent = 'Rendering ' + bars + ' bars…';
    renderWav(bars).then(function (blob) {
      var name = ($('beat-name').value || '').trim().replace(/[^a-z0-9\-_ ]/gi, '').slice(0, 40) || 'emi-beat';
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name.replace(/\s+/g, '-').toLowerCase() + '.wav';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      btn.disabled = false;
      $('beat-dl-out').textContent = 'Saved ' + name.replace(/\s+/g, '-').toLowerCase() + '.wav (' +
        Math.round(blob.size / 1024) + ' KB).';
    }).catch(function () {
      btn.disabled = false;
      $('beat-dl-out').textContent = 'This browser could not render the audio.';
    });
  }

  /* ---------- ui ---------- */

  function renderPads() {
    $('beat-pads').innerHTML = KIT.map(function (v, i) {
      return '<button class="pad" type="button" data-i="' + i + '" aria-pressed="' + (i === 0) + '">' +
        '<span class="pad-name">' + v.name + '</span></button>';
    }).join('');
  }

  function renderSteps() {
    $('beat-steps').innerHTML = pattern[selected].map(function (on, s) {
      return '<button class="step' + (on ? ' on' : '') + (s % 4 === 0 ? ' downbeat' : '') +
        '" type="button" data-s="' + s + '" aria-label="Step ' + (s + 1) + '" aria-pressed="' + on + '"></button>';
    }).join('');
    $('beat-track').textContent = KIT[selected].name;
  }

  function markPads() {
    document.querySelectorAll('#beat-pads .pad').forEach(function (p, i) {
      p.classList.toggle('has-steps', pattern[i].some(Boolean));
      p.setAttribute('aria-pressed', String(i === selected));
      p.classList.toggle('sel', i === selected);
    });
  }

  function share() {
    var url = location.origin + location.pathname + '#p=' + encode() + '&t=' + tempo;
    var out = $('beat-share-out');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        function () { out.textContent = 'Link copied. Paste it anywhere.'; },
        function () { out.textContent = url; }
      );
    } else { out.textContent = url; }
    history.replaceState(null, '', '#p=' + encode() + '&t=' + tempo);
  }

  function init() {
    if (!$('beat-pads')) return;

    renderPads();
    if (readHash()) { /* arrived on someone else's beat */ }
    renderSteps();
    markPads();
    $('beat-tempo').value = tempo;
    $('beat-tempo-val').textContent = tempo;

    $('beat-pads').addEventListener('click', function (e) {
      var p = e.target.closest('.pad'); if (!p) return;
      var i = +p.dataset.i;
      ensureCtx();
      if (ctx) play(i, ctx.currentTime);
      selected = i;
      renderSteps(); markPads();
    });

    $('beat-steps').addEventListener('click', function (e) {
      var c = e.target.closest('.step'); if (!c) return;
      var s = +c.dataset.s;
      pattern[selected][s] = !pattern[selected][s];
      c.classList.toggle('on', pattern[selected][s]);
      c.setAttribute('aria-pressed', String(pattern[selected][s]));
      markPads();
      ensureCtx();
      if (ctx && pattern[selected][s] && !playing) play(selected, ctx.currentTime);
    });

    $('beat-play').addEventListener('click', function () { playing ? stop() : start(); });
    $('beat-clear').addEventListener('click', clearAll);
    $('beat-random').addEventListener('click', randomize);
    $('beat-clear-track').addEventListener('click', clearTrack);

    $('beat-download').addEventListener('click', download);
    $('beat-save').addEventListener('click', saveCurrent);
    $('beat-name').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); saveCurrent(); }
    });
    $('beat-saved').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.load != null) loadSave(+b.dataset.load);
      if (b.dataset.del != null) deleteSave(+b.dataset.del);
    });
    renderSaves();
    $('beat-share').addEventListener('click', share);
    $('beat-tempo').addEventListener('input', function () {
      tempo = +this.value;
      $('beat-tempo-val').textContent = tempo;
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input,textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); playing ? stop() : start(); }
      if (e.key === 'r' || e.key === 'R') randomize();
      if (e.key === 'c' || e.key === 'C') clearAll();
    });
  }

  /* ---------- the door ---------- */

  function unlocked() {
    try { return localStorage.getItem(UNLOCK_KEY) === 'yes'; } catch (e) { return false; }
  }

  function reveal() {
    document.body.classList.add('is-unlocked');
    $('beat-locked').hidden = true;
    $('beat-machine').hidden = false;
    init();
  }

  function boot() {
    if (!$('beat-machine')) return;
    if (unlocked()) return reveal();

    var btn = $('beat-unlock'), input = $('beat-password'), err = $('beat-door-error');
    function go() {
      var pass = input.value.trim();
      if (!pass) { err.textContent = 'Enter the password.'; return; }
      btn.disabled = true; err.textContent = 'Checking…';
      fetch('api/unlock', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pass })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j && j.ok, error: j && j.error }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (res.ok) {
            try { localStorage.setItem(UNLOCK_KEY, 'yes'); } catch (e) {}
            reveal();
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
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

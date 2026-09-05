/* ============================================================
   EMI BEATS — a pad machine that chains into songs
   Sixteen pads and sixteen steps to a bar, eight patterns, and a
   chain of those patterns that plays as a song. Everything is
   synthesised in the browser, so it works with nothing to download.

   The voices are placeholders for OgBe's own hits: KIT below is the
   only thing that needs to change. Give an entry a decoded `buffer`
   and it plays that instead of the synth.
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

  /* ---------- patterns and the chain ---------- */

  var PATTERNS = 8;
  var LETTERS = 'ABCDEFGH';

  function emptyBar() { return KIT.map(function () { return new Array(STEPS).fill(false); }); }

  var patterns = [];
  for (var pi = 0; pi < PATTERNS; pi++) patterns.push(emptyBar());
  var chain = [];               // pattern indices, in order
  var selected = 0;             // the pattern the step grid edits
  var playIndex = 0;            // the pattern currently sounding
  var songPos = 0;
  var mode = 'pattern';         // pattern | song
  var tempo = 92, swing = 0.12, playing = false, current = -1;

  function bar() { return patterns[selected]; }
  function hasNotes(p) { return p.some(function (r) { return r.some(Boolean); }); }
  function anyNotes() { return patterns.some(hasNotes); }
  function usedCount() {
    var n = 0;
    for (var i = 0; i < PATTERNS; i++) if (hasNotes(patterns[i])) n = i + 1;
    chain.forEach(function (c) { if (c + 1 > n) n = c + 1; });
    return n;
  }

  /* ---------- share link ----------
     A bar is 32 bytes. The link carries only the patterns actually in use,
     then the chain, so a two-pattern song stays short enough to paste. */

  function encode() {
    var used = usedCount();
    var out = [used];
    for (var p = 0; p < used; p++) {
      var bytes = new Uint8Array(KIT.length * STEPS / 8);
      var bit = 0;
      for (var r = 0; r < KIT.length; r++)
        for (var s = 0; s < STEPS; s++, bit++)
          if (patterns[p][r][s]) bytes[bit >> 3] |= (1 << (bit & 7));
      for (var i = 0; i < bytes.length; i++) out.push(bytes[i]);
    }
    out.push(chain.length);
    chain.forEach(function (c) { out.push(c); });
    var bin = '';
    for (var k = 0; k < out.length; k++) bin += String.fromCharCode(out[k] & 255);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(str) {
    try {
      var bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
      var BAR = KIT.length * STEPS / 8;
      patterns = [];
      for (var e = 0; e < PATTERNS; e++) patterns.push(emptyBar());
      chain = [];

      // links made before chaining existed were a bare single bar
      var legacy = bin.length === BAR;
      var used = legacy ? 1 : (bin.charCodeAt(0) || 0);
      var at = legacy ? 0 : 1;
      if (used > PATTERNS) used = PATTERNS;

      for (var p = 0; p < used; p++) {
        var bit = 0;
        for (var r = 0; r < KIT.length; r++)
          for (var s = 0; s < STEPS; s++, bit++) {
            var byte = bin.charCodeAt(at + (bit >> 3)) || 0;
            patterns[p][r][s] = !!(byte & (1 << (bit & 7)));
          }
        at += BAR;
      }
      if (!legacy) {
        var len = bin.charCodeAt(at++) || 0;
        for (var c = 0; c < len; c++) {
          var v = bin.charCodeAt(at++) || 0;
          if (v < PATTERNS) chain.push(v);
        }
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
     only a handful of voices join any roll, so a bar has room in it. */

  var PROFILE = [
    { anchor: [0, 8],                      p: 0.08, core: true },  // Kick
    { anchor: [0],                         p: 0.05 },              // Sub
    { anchor: [4, 12],                     p: 0.04, core: true },  // Snare
    { anchor: [7],                         p: 0.07 },              // Rim
    { anchor: [12],                        p: 0.04 },              // Clap
    { anchor: [0, 2, 4, 6, 8, 10, 12, 14], p: 0.16, core: true },  // Hat
    { anchor: [14],                        p: 0.05 },              // Open hat
    { anchor: [],                          p: 0.18 },              // Shaker
    { anchor: [],                          p: 0.05 },              // Tom lo
    { anchor: [],                          p: 0.05 },              // Tom mid
    { anchor: [],                          p: 0.05 },              // Tom hi
    { anchor: [],                          p: 0.06 },              // Bell
    { anchor: [0, 6],                      p: 0.07 },              // Bass
    { anchor: [],                          p: 0.08 },              // Blip
    { anchor: [],                          p: 0.03 },              // Sweep
    { anchor: [],                          p: 0.04 }               // Zap
  ];

  function randomize() {
    var density = 0.7 + Math.random() * 0.8;
    var extras = [];
    for (var i = 0; i < KIT.length; i++) if (!PROFILE[i].core) extras.push(i);
    for (var k = extras.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = extras[k]; extras[k] = extras[j]; extras[j] = tmp;
    }
    var keep = {};
    extras.slice(0, 2 + Math.floor(Math.random() * 3)).forEach(function (x) { keep[x] = true; });
    var p = bar();
    for (var r = 0; r < KIT.length; r++) {
      var prof = PROFILE[r];
      var on = prof.core || keep[r];
      for (var s = 0; s < STEPS; s++) {
        if (!on) { p[r][s] = false; continue; }
        var anchored = prof.anchor.indexOf(s) !== -1;
        p[r][s] = Math.random() < (anchored ? 0.88 : prof.p * density);
      }
    }
    paintAll();
  }

  function clearAll() { patterns[selected] = emptyBar(); paintAll(); }
  function clearTrack() { bar()[selectedTrack] = new Array(STEPS).fill(false); paintAll(); }

  function duplicate() {
    var to = -1;
    for (var i = 0; i < PATTERNS; i++) if (!hasNotes(patterns[i])) { to = i; break; }
    if (to < 0) { say('All eight patterns are in use.'); return; }
    patterns[to] = bar().map(function (r) { return r.slice(); });
    selected = to;
    paintAll();
    say('Copied into ' + LETTERS[to] + '.');
  }

  /* ---------- transport ---------- */

  var nextTime = 0, nextStep = 0, timer = null, painted = [];
  var LOOKAHEAD = 0.12;

  function stepDur() { return 60 / tempo / 4; }
  function songMode() { return mode === 'song' && chain.length > 0; }

  function schedule() {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      if (nextStep === 0) playIndex = songMode() ? chain[songPos % chain.length] : selected;
      var p = patterns[playIndex];
      var s = nextStep;
      var t = nextTime + ((s % 2) ? stepDur() * swing : 0);
      for (var r = 0; r < KIT.length; r++) if (p[r][s]) voice(ctx, master, r, t);
      painted.push({ s: s, at: nextTime, pat: playIndex, pos: songPos });
      nextTime += stepDur();
      nextStep = (nextStep + 1) % STEPS;
      if (nextStep === 0 && songMode()) songPos = (songPos + 1) % chain.length;
    }
    timer = setTimeout(schedule, 25);
  }

  var nowPat = 0, nowPos = 0;
  function frame() {
    if (!playing) return;
    var t = ctx ? ctx.currentTime : 0;
    while (painted.length && painted[0].at <= t) {
      var f = painted.shift();
      current = f.s; nowPat = f.pat; nowPos = f.pos;
    }
    var cells = document.querySelectorAll('#beat-steps .step');
    var showing = (mode === 'pattern') || nowPat === selected;
    for (var i = 0; i < cells.length; i++) cells[i].classList.toggle('now', showing && i === current);
    var pads = document.querySelectorAll('#beat-pads .pad');
    var live = patterns[nowPat];
    for (var r = 0; r < pads.length; r++) pads[r].classList.toggle('hit', current >= 0 && live[r][current]);
    document.querySelectorAll('#beat-chain .link').forEach(function (el, i) {
      el.classList.toggle('now', songMode() && i === nowPos);
    });
    document.querySelectorAll('#beat-patterns .pat').forEach(function (el, i) {
      el.classList.toggle('sounding', i === nowPat);
    });
    requestAnimationFrame(frame);
  }

  function start() {
    if (!ensureCtx()) return;
    playing = true; nextStep = 0; songPos = 0; painted = [];
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
    document.querySelectorAll('.step.now, .pad.hit, .link.now, .pat.sounding')
      .forEach(function (e) { e.classList.remove('now', 'hit', 'sounding'); });
    $('beat-play').textContent = 'Play';
    $('beat-play').setAttribute('aria-pressed', 'false');
  }

  /* ---------- render to WAV ---------- */

  function encodeWav(buf, rate) {
    var n = buf.length;
    var out = new ArrayBuffer(44 + n * 2);
    var v = new DataView(out);
    function str(off, x) { for (var i = 0; i < x.length; i++) v.setUint8(off + i, x.charCodeAt(i)); }
    str(0, 'RIFF');  v.setUint32(4, 36 + n * 2, true);
    str(8, 'WAVE');  str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    var o = 44;
    for (var i = 0; i < n; i++, o += 2) {
      var x = buf[i]; x = x < -1 ? -1 : x > 1 ? 1 : x;
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7FFF, true);
    }
    return new Blob([out], { type: 'audio/wav' });
  }

  /* the order of bars to render: the chain if there is one, else this pattern */
  function renderList(reps) {
    var seq = [];
    for (var n = 0; n < reps; n++) {
      if (chain.length) chain.forEach(function (c) { seq.push(c); });
      else seq.push(selected);
    }
    return seq;
  }

  function renderWav(reps) {
    var RATE = 44100;
    var seq = renderList(reps);
    var tail = 0.6;
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('no offline audio'));
    var dur = stepDur() * STEPS * seq.length;
    var oac = new OAC(1, Math.ceil((dur + tail) * RATE), RATE);
    var out = buildOut(oac);

    seq.forEach(function (patIdx, barNo) {
      var p = patterns[patIdx];
      for (var s = 0; s < STEPS; s++) {
        var t = (barNo * STEPS + s) * stepDur() + ((s % 2) ? stepDur() * swing : 0);
        for (var r = 0; r < KIT.length; r++) if (p[r][s]) voice(oac, out, r, t);
      }
    });

    return oac.startRendering().then(function (rendered) {
      var d = rendered.getChannelData(0);
      var peak = 0;
      for (var i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > peak) peak = a; }
      if (peak > 0.891) { var k = 0.891 / peak; for (var j = 0; j < d.length; j++) d[j] *= k; }
      return encodeWav(d, RATE);
    });
  }

  function download() {
    if (!anyNotes()) { $('beat-dl-out').textContent = 'Nothing to render yet.'; return; }
    var btn = $('beat-download');
    var reps = parseInt($('beat-bars').value, 10) || 1;
    var bars = renderList(reps).length;
    btn.disabled = true;
    $('beat-dl-out').textContent = 'Rendering ' + bars + (bars === 1 ? ' bar…' : ' bars…');
    renderWav(reps).then(function (blob) {
      var name = ($('beat-name').value || '').trim().replace(/[^a-z0-9\-_ ]/gi, '').slice(0, 40) || 'emi-beat';
      name = name.replace(/\s+/g, '-').toLowerCase() + '.wav';
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      btn.disabled = false;
      $('beat-dl-out').textContent = 'Saved ' + name + ' (' + Math.round(blob.size / 1024) + ' KB).';
    }).catch(function () {
      btn.disabled = false;
      $('beat-dl-out').textContent = 'This browser could not render the audio.';
    });
  }

  /* ---------- saved songs ---------- */

  var SAVE_KEY = 'emi-beats-saved';

  function readSaves() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; } catch (e) { return []; } }
  function writeSaves(l) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(l)); return true; } catch (e) { return false; } }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderSaves() {
    var list = readSaves(), box = $('beat-saved');
    if (!box) return;
    $('beat-saved-empty').hidden = list.length > 0;
    box.innerHTML = list.map(function (b, i) {
      return '<li class="saved-row">' +
        '<span class="saved-name">' + esc(b.name) + '</span>' +
        '<span class="saved-meta">' + b.tempo + ' bpm' + (b.bars ? ' &middot; ' + b.bars + ' bars' : '') + '</span>' +
        '<button class="linky" type="button" data-load="' + i + '">Load</button>' +
        '<button class="linky" type="button" data-del="' + i + '">Delete</button></li>';
    }).join('');
  }

  function saveCurrent() {
    var input = $('beat-name');
    var name = (input.value || '').trim().slice(0, 40) || 'Untitled ' + (readSaves().length + 1);
    if (!anyNotes()) { $('beat-save-out').textContent = 'Nothing to save yet.'; return; }
    var list = readSaves();
    var at = list.findIndex(function (b) { return b.name === name; });
    var entry = { name: name, p: encode(), tempo: tempo, bars: chain.length || 1, at: Date.now() };
    if (at >= 0) list[at] = entry; else list.unshift(entry);
    if (list.length > 24) list.length = 24;
    if (!writeSaves(list)) { $('beat-save-out').textContent = 'This browser will not let the page save.'; return; }
    input.value = '';
    $('beat-save-out').textContent = (at >= 0 ? 'Replaced "' : 'Saved as "') + name + '".';
    renderSaves();
  }

  function loadSave(i) {
    var b = readSaves()[i];
    if (!b) return;
    decode(b.p);
    tempo = b.tempo || tempo;
    selected = 0; songPos = 0;
    $('beat-tempo').value = tempo; $('beat-tempo-val').textContent = tempo;
    setMode(chain.length ? 'song' : 'pattern');
    paintAll();
    $('beat-save-out').textContent = 'Loaded "' + b.name + '".';
  }

  function deleteSave(i) {
    var list = readSaves();
    var gone = list.splice(i, 1)[0];
    writeSaves(list); renderSaves();
    $('beat-save-out').textContent = gone ? 'Deleted "' + gone.name + '".' : '';
  }

  /* ---------- ui ---------- */

  var selectedTrack = 0;

  function say(msg) { $('beat-share-out').textContent = msg || ''; }

  function renderPads() {
    $('beat-pads').innerHTML = KIT.map(function (v, i) {
      return '<button class="pad" type="button" data-i="' + i + '"><span class="pad-name">' + v.name + '</span></button>';
    }).join('');
  }

  function renderPatterns() {
    $('beat-patterns').innerHTML = LETTERS.split('').map(function (L, i) {
      return '<button class="pat' + (i === selected ? ' sel' : '') + (hasNotes(patterns[i]) ? ' filled' : '') +
        '" type="button" data-p="' + i + '" aria-pressed="' + (i === selected) + '">' + L + '</button>';
    }).join('');
  }

  function renderChain() {
    var box = $('beat-chain');
    box.innerHTML = chain.length
      ? chain.map(function (c, i) {
          return '<span class="link" data-i="' + i + '">' + LETTERS[c] +
            '<button class="link-x" type="button" data-drop="' + i + '" aria-label="Remove">&times;</button></span>';
        }).join('')
      : '<span class="chain-empty">Empty. Add patterns to build a song.</span>';
    $('beat-song-len').textContent = chain.length
      ? chain.length + (chain.length === 1 ? ' bar' : ' bars')
      : '';
    updateLengthOptions();
  }

  var lastLengthKind = null;
  function updateLengthOptions() {
    var sel = $('beat-bars');
    var songy = chain.length > 0;
    var kind = songy ? 'song' : 'pattern';
    var opts = songy
      ? [[1, 'Song once'], [2, 'Song twice'], [4, 'Song ×4']]
      : [[2, '2 bars'], [4, '4 bars'], [8, '8 bars'], [16, '16 bars']];
    // the same number means different things in the two lists, so a choice is
    // only carried over while the list still means what it did before
    var keep = kind === lastLengthKind ? sel.value : null;
    sel.innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
    if (keep && opts.some(function (o) { return String(o[0]) === keep; })) sel.value = keep;
    else sel.value = songy ? '1' : '4';
    lastLengthKind = kind;
  }

  function renderSteps() {
    var row = bar()[selectedTrack];
    $('beat-steps').innerHTML = row.map(function (on, s) {
      return '<button class="step' + (on ? ' on' : '') + (s % 4 === 0 ? ' downbeat' : '') +
        '" type="button" data-s="' + s + '" aria-label="Step ' + (s + 1) + '" aria-pressed="' + on + '"></button>';
    }).join('');
    $('beat-track').textContent = KIT[selectedTrack].name;
    $('beat-which').textContent = LETTERS[selected];
  }

  function markPads() {
    var p = bar();
    document.querySelectorAll('#beat-pads .pad').forEach(function (el, i) {
      el.classList.toggle('has-steps', p[i].some(Boolean));
      el.classList.toggle('sel', i === selectedTrack);
      el.setAttribute('aria-pressed', String(i === selectedTrack));
    });
  }

  function paintAll() { renderPatterns(); renderChain(); renderSteps(); markPads(); }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
    songPos = 0;
  }

  function share() {
    var url = location.origin + location.pathname + '#p=' + encode() + '&t=' + tempo;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { say('Link copied. Paste it anywhere.'); },
                                              function () { say(url); });
    } else say(url);
    history.replaceState(null, '', '#p=' + encode() + '&t=' + tempo);
  }

  function init() {
    if (!$('beat-pads')) return;
    renderPads();
    readHash();
    setMode(chain.length ? 'song' : 'pattern');
    paintAll();
    renderSaves();
    $('beat-tempo').value = tempo;
    $('beat-tempo-val').textContent = tempo;

    $('beat-pads').addEventListener('click', function (e) {
      var el = e.target.closest('.pad'); if (!el) return;
      selectedTrack = +el.dataset.i;
      ensureCtx(); if (ctx) voice(ctx, master, selectedTrack, ctx.currentTime);
      renderSteps(); markPads();
    });

    $('beat-steps').addEventListener('click', function (e) {
      var c = e.target.closest('.step'); if (!c) return;
      var s = +c.dataset.s;
      var row = bar()[selectedTrack];
      row[s] = !row[s];
      c.classList.toggle('on', row[s]);
      c.setAttribute('aria-pressed', String(row[s]));
      renderPatterns(); markPads();
      ensureCtx();
      if (ctx && row[s] && !playing) voice(ctx, master, selectedTrack, ctx.currentTime);
    });

    $('beat-patterns').addEventListener('click', function (e) {
      var el = e.target.closest('.pat'); if (!el) return;
      selected = +el.dataset.p;
      paintAll();
    });

    $('beat-add').addEventListener('click', function () {
      if (chain.length >= 64) { say('A song can be 64 bars.'); return; }
      chain.push(selected);
      renderChain();
      if (mode === 'pattern') setMode('song');
    });

    $('beat-chain').addEventListener('click', function (e) {
      var x = e.target.closest('[data-drop]'); if (!x) return;
      chain.splice(+x.dataset.drop, 1);
      if (!chain.length) setMode('pattern');
      renderChain();
    });

    $('beat-song-clear').addEventListener('click', function () {
      chain = []; setMode('pattern'); renderChain();
    });

    document.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.dataset.mode); });
    });

    $('beat-play').addEventListener('click', function () { playing ? stop() : start(); });
    $('beat-random').addEventListener('click', randomize);
    $('beat-clear').addEventListener('click', clearAll);
    $('beat-clear-track').addEventListener('click', clearTrack);
    $('beat-dup').addEventListener('click', duplicate);
    $('beat-share').addEventListener('click', share);
    $('beat-download').addEventListener('click', download);
    $('beat-save').addEventListener('click', saveCurrent);
    $('beat-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveCurrent(); } });
    $('beat-saved').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.load != null) loadSave(+b.dataset.load);
      if (b.dataset.del != null) deleteSave(+b.dataset.del);
    });
    $('beat-tempo').addEventListener('input', function () {
      tempo = +this.value; $('beat-tempo-val').textContent = tempo;
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input,textarea,select')) return;
      if (e.code === 'Space') { e.preventDefault(); playing ? stop() : start(); }
      if (e.key === 'r' || e.key === 'R') randomize();
      if (e.key === 'c' || e.key === 'C') clearAll();
      var n = LETTERS.indexOf((e.key || '').toUpperCase());
      if (n >= 0) { selected = n; paintAll(); }
    });
  }

  /* ---------- the door ---------- */

  function unlocked() { try { return localStorage.getItem(UNLOCK_KEY) === 'yes'; } catch (e) { return false; } }

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
      fetch('api/unlock', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pass }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j && j.ok, error: j && j.error }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (res.ok) { try { localStorage.setItem(UNLOCK_KEY, 'yes'); } catch (e) {} reveal(); return; }
          err.textContent = res.error || "That's not it. Ask in the chat.";
          input.select();
        }).catch(function () { btn.disabled = false; err.textContent = 'Could not reach the door. Try again.'; });
    }
    btn.addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

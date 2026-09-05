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

  var ctx = null, master = null, buffers = {};

  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer() {
    if (buffers.noise) return buffers.noise;
    var n = ctx.sampleRate * 1.2;
    var b = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    buffers.noise = b;
    return b;
  }

  function env(node, t, peak, decay, hold) {
    var g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + 0.004);
    g.exponentialRampToValueAtTime(0.0001, t + (hold || 0) + decay);
  }

  function noise(t, decay, hp, lp, peak) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuffer();
    var f = ctx.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass';
    f.frequency.value = hp || lp || 8000;
    var g = ctx.createGain();
    env(g, t, peak == null ? 0.6 : peak, decay);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + decay + 0.1);
  }

  function tone(t, type, from, to, decay, peak) {
    var o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + decay);
    var g = ctx.createGain();
    env(g, t, peak == null ? 0.8 : peak, decay);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + decay + 0.05);
  }

  function play(i, t) {
    if (!ctx) return;
    var v = KIT[i];
    if (!v) return;
    if (v.sample && buffers[v.sample]) {          // OgBe's hits, once they exist
      var s = ctx.createBufferSource(); s.buffer = buffers[v.sample];
      var g = ctx.createGain(); g.gain.value = 0.9;
      s.connect(g); g.connect(master); s.start(t);
      return;
    }
    switch (v.type) {
      case 'kick':   tone(t, 'sine', v.f * 2.6, v.f * 0.5, v.long ? 0.55 : 0.34, 0.95); break;
      case 'snare':  tone(t, 'triangle', v.f, v.f * 0.6, 0.13, 0.35); noise(t, 0.17, 1400, 0, 0.5); break;
      case 'rim':    tone(t, 'square', v.f, v.f * 0.7, 0.045, 0.32); noise(t, 0.03, 2500, 0, 0.25); break;
      case 'clap':
        [0, 0.012, 0.024].forEach(function (o) { noise(t + o, 0.05, 1100, 0, 0.32); });
        noise(t + 0.036, 0.16, 900, 0, 0.28);
        break;
      case 'hat':    noise(t, v.d, 7200, 0, 0.28); break;
      case 'shaker': noise(t, 0.09, 5200, 0, 0.2); break;
      case 'tom':    tone(t, 'sine', v.f * 1.6, v.f * 0.7, 0.28, 0.6); break;
      case 'bell':   tone(t, 'square', 800, 795, 0.28, 0.14); tone(t, 'square', 1200, 1195, 0.28, 0.12); break;
      case 'bass':   tone(t, 'sawtooth', v.f, v.f, 0.30, 0.32); break;
      case 'blip':   tone(t, 'square', v.f, v.f * 2, 0.07, 0.22); break;
      case 'sweep':  noise(t, 0.4, 300, 0, 0.22); tone(t, 'sine', 200, 2000, 0.4, 0.12); break;
      case 'zap':    tone(t, 'sawtooth', 1400, 90, 0.16, 0.3); break;
    }
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

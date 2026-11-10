/* Starships: a calm side-scrolling pixel-art space shooter on the profile card, drawn in Player
   One's style (same pixel grid, sprites, pixel text, intro and HUD). Load it after the effect
   runner (runtime.js in the open playground): it registers itself as 'starships'. It never talks
   to a server and keeps its high score in this browser only (it has no site leaderboard yet).

   One thing to learn: fly. The guns fire by themselves; arrows / WASD steer, or hold and drag on
   the card. P pauses (so does switching away), M mutes, Esc leaves.

   Demo: a little starship patrols just above the card's stats row: it weaves, speeds up, does
   barrel rolls, blasts the rocks, saucers and saucer trios that come by every few seconds and
   collects their coins, hops over the odd comet, and comes over to the cursor for a roll. Press
   P or tap the card to play: the card hides behind a scrolling starfield (a bright sky with
   clouds in light mode).

   A game brings in one new thing at a time: saucer waves (shoot a whole wave for a bonus), then
   rocks (big ones split), gunships that stop and fire slow aimed shots, darts that dash across
   after a "!" warning (they can't be shot down: get out of their line), and later saucers that shoot back. Enemies come in groups with a quiet
   stretch of starfield between them, and stop getting busier after a few levels. Wrecks drop
   coins, gems, P chips (more guns: a second beside the first, then a pair fanning out on top; each
   level is kept until a hit costs one) and, rarely, a shield that takes one hit. Enemies can't be hit until
   they're on the card. Every 750 points is an extra heart (1UP); wrecks don't drop hearts, bosses do. Score and level are one
   count: level 2 at 100 points, each level after needs 10 more, every five levels a new sector.
   Every 10 levels a boss arrives after a WARNING (the Mothership, Dreadnought and Leviathan, then
   round again): almost the play area's height, wings reaching up and down, each its own shape
   with its own move (swoops, lunges, a weave). Shots glance off its armour. Its core, at the
   front, takes damage only while its hatch is open, when it attacks (each attack charges up
   first, the core flashing white). The two turrets on its wing tips can be shot off: that stops
   their aimed bursts and takes 15% of its health with each. Its attacks keep you moving, and
   each tier knows one more: aimed bursts and walls of shots with a moving gap, then a sweeping
   stream, then weaving shots, then a spiral, aimed at you; with its turrets gone, its core fires
   their bursts. Stay in line with its core and it fires a beam down that row. Its nose stops you, and hang about in front of it and
   it crackles, then lashes that space (lightning, flame or a roar). It smokes when hurt and burns
   when nearly down.
   Three hearts.
   Sound effects made in code, no music. Reduced motion turns off shake and flashing. */
(function () {
  'use strict';
  var FX = window.MDBCosmetics;
  if (!FX || !FX.registerEffect) return;
  var TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v) { return Math.max(0, Math.min(1, v)); }
  function seeded(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function isDark() { return document.documentElement.classList.contains('dark'); }
  // Reduced motion (the viewer's system setting): no screen shake, flashes or colour cycling.
  var CALM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Sounds: little chiptune blips made in code with Web Audio (no audio files, no music). Only
  // during a game: the audio starts on the key press or tap that starts it, as browsers require,
  // and sleeps again when the game ends. M mutes; the choice is shared with Player One.
  var SFX = { ctx: null, out: null, noise: null, pulse: null, muted: false, live: false, seen: 0, watch: 0 };
  try { SFX.muted = window.localStorage.getItem('mdb-arcade-mute') === '1'; } catch (e) { /* storage blocked */ }
  function sfxInit() {
    if (!SFX.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        SFX.ctx = new AC(); SFX.out = SFX.ctx.createGain(); SFX.out.gain.value = 0.3; SFX.out.connect(SFX.ctx.destination);
        var len = Math.round(SFX.ctx.sampleRate * 0.5), buf = SFX.ctx.createBuffer(1, len, SFX.ctx.sampleRate), d = buf.getChannelData(0);
        for (var k = 0; k < len; k++) d[k] = Math.random() * 2 - 1;
        SFX.noise = buf;
        // 'pulse': a thin 25% square, the reedy tone of old console chips (a plain square is 50%).
        var re = new Float32Array(32), im = new Float32Array(32);
        for (k = 1; k < 32; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * 0.25);
        SFX.pulse = SFX.ctx.createPeriodicWave(re, im);
      } catch (e) { SFX.ctx = null; return; }
    }
    sfxWake();
  }
  // Every frame of a game keeps the audio awake. When the frames stop (the card scrolled off
  // screen, the tab went hidden, a resize rebuilt the card), a check once a second puts it to
  // sleep; the next frame of a game wakes it again. No check runs outside a game.
  function sfxWake() {
    SFX.live = true; SFX.seen = performance.now();
    if (SFX.ctx && SFX.ctx.state === 'suspended') SFX.ctx.resume();
    if (!SFX.watch) SFX.watch = setTimeout(sfxWatch, 1000);
  }
  function sfxWatch() {
    SFX.watch = 0;
    if (!SFX.live) return;
    if (performance.now() - SFX.seen > 1500) { SFX.live = false; if (SFX.ctx && SFX.ctx.state === 'running') SFX.ctx.suspend(); return; }
    SFX.watch = setTimeout(sfxWatch, 1000);
  }
  // The game is over: let the last jingle ring out, then put the audio to sleep (saves battery).
  function sfxSleep(after) {
    SFX.live = false;
    setTimeout(function () { if (SFX.ctx && !SFX.live && SFX.ctx.state === 'running') SFX.ctx.suspend(); }, after);
  }
  // Sounds made while a resume is still pending just wait for it, so this checks live, not 'running'.
  function sfxReady() { return SFX.ctx && !SFX.muted && SFX.live; }
  // One note: a wave sliding from f0 to f1 Hz over dur seconds, starting `at` seconds from now.
  // vib: a wobble on the pitch (0.02 = 2% either way), for held notes.
  function tone(type, f0, f1, dur, vol, at, vib) {
    if (!sfxReady()) return;
    var c = SFX.ctx, t0 = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    if (type === 'pulse') o.setPeriodicWave(SFX.pulse); else o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    if (vib) {
      var lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = 7; depth.gain.value = f0 * vib; lfo.connect(depth); depth.connect(o.frequency);
      lfo.start(t0); lfo.stop(t0 + dur + 0.02);
    }
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(SFX.out); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // A burst of noise through a sliding low-pass filter: thuds, blasts and whooshes.
  function hiss(dur, vol, f0, f1, at) {
    if (!sfxReady()) return;
    var c = SFX.ctx, t0 = c.currentTime + (at || 0), src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    src.buffer = SFX.noise; flt.type = 'lowpass'; flt.frequency.setValueAtTime(f0, t0); flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(SFX.out); src.start(t0); src.stop(t0 + dur + 0.02);
  }
  function notes(type, freqs, step, dur, vol, at) { freqs.forEach(function (f, k) { tone(type, f, f, dur, vol, (at || 0) + k * step); }); }
  // Blasts keep their thump above ~70 Hz (with a square for overtones) so small speakers play it.
  var SOUNDS = {
    go: function () { notes('square', [392, 523, 659, 784, 1047], 0.06, 0.12, 0.22); hiss(0.6, 0.25, 500, 4000); },
    shoot: function () { tone('pulse', rnd(1400, 1700), 450, 0.06, 0.03); },
    hit: function () { tone('square', 260, 160, 0.05, 0.08); },
    tink: function () { tone('pulse', 2600, 1900, 0.035, 0.05); },  // a shot glancing off armour
    zap: function () { tone('sawtooth', 900, 260, 0.14, 0.06); },
    boom: function () { hiss(0.3, 0.45, 2500, 150); tone('sine', 170, 75, 0.25, 0.3); },
    bigboom: function () { hiss(0.6, 0.6, 3000, 80); tone('sine', 150, 70, 0.5, 0.45); tone('square', 220, 85, 0.3, 0.1); },
    coin: function () { tone('pulse', 1047, 1047, 0.06, 0.22); tone('pulse', 1568, 1568, 0.2, 0.22, 0.06); },
    gem: function () { notes('triangle', [1047, 1319, 1568, 2093], 0.045, 0.12, 0.35); },
    heart: function () { notes('square', [659, 880], 0.05, 0.08, 0.18); tone('square', 1109, 1109, 0.4, 0.18, 0.1, 0.02); },
    life: function () { notes('pulse', [784, 1047, 1319, 1568], 0.06, 0.09, 0.2); tone('pulse', 2093, 2093, 0.45, 0.18, 0.24, 0.02); },
    power: function () { notes('square', [523, 784, 1047, 1568], 0.05, 0.1, 0.2); tone('sawtooth', 200, 1200, 0.3, 0.06); },
    wave: function () { notes('triangle', [784, 988, 1175, 1568], 0.05, 0.12, 0.3); },
    hurt: function () { tone('sawtooth', 440, 110, 0.35, 0.25); hiss(0.2, 0.3, 2000, 300); },
    level: function () {
      notes('square', [587, 740, 880, 1175], 0.06, 0.09, 0.2);
      tone('square', 1175, 1175, 0.45, 0.2, 0.26, 0.015); tone('triangle', 740, 740, 0.45, 0.3, 0.26); tone('triangle', 440, 440, 0.45, 0.3, 0.26);
    },
    powerdown: function () { notes('square', [784, 587, 440], 0.06, 0.1, 0.16); },
    pause: function () { tone('square', 660, 660, 0.06, 0.12); tone('square', 440, 440, 0.08, 0.12, 0.07); },
    charge: function () { tone('sawtooth', 220, 880, 0.55, 0.06); },
    beamup: function () { tone('sawtooth', 160, 640, 0.8, 0.07); tone('square', 320, 1280, 0.8, 0.03); },
    beam: function () { tone('sawtooth', 420, 90, 0.6, 0.14); hiss(0.6, 0.35, 6000, 600); },
    crackle: function () { hiss(0.7, 0.14, 7000, 2500); tone('sawtooth', 110, 260, 0.7, 0.05); },
    lash: function () { hiss(0.35, 0.5, 9000, 500); tone('square', 1800, 180, 0.3, 0.12); },
    shield: function () { notes('triangle', [784, 1175, 1568, 2349], 0.05, 0.14, 0.3); },
    shieldbreak: function () { hiss(0.3, 0.4, 6000, 800); tone('triangle', 1568, 392, 0.3, 0.25); },
    alarm: function () { tone('sawtooth', 440, 880, 0.25, 0.1); tone('sawtooth', 880, 440, 0.25, 0.1, 0.25); },
    warn: function () { tone('square', 880, 880, 0.08, 0.15); tone('square', 880, 880, 0.08, 0.15, 0.14); },
    over: function () { notes('triangle', [392, 330, 262, 196], 0.22, 0.3, 0.35); }
  };
  function sfx(name) { if (SOUNDS[name]) SOUNDS[name](); }

  // Controls: one set of page listeners, bound on first use. Input goes to the game that drew
  // most recently (the live card), and only when it's playable.
  var SHIPS = { inst: null, keys: {}, pointer: null, hover: null, down: {}, bound: false };
  function live() { var g = SHIPS.inst; return g && performance.now() - g.seen < 300 ? g : null; }
  function bind() {
    if (SHIPS.bound) return;
    SHIPS.bound = true;
    function typing(e) { var el = e.target; return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); }
    function local(g, e) {
      var r = g.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
    }
    document.addEventListener('keydown', function (e) {
      var g = live(), k = e.key;
      if (!g || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (g.mode() !== 'play') { if (k === 'p' || k === 'P') { e.preventDefault(); g.start(); } return; }
      if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown| |a|d|w|s|A|D|W|S|Escape)$/.test(k)) e.preventDefault();  // no page scrolling mid-game
      if (k === 'Escape') { g.quit(); return; }
      if (k === 'm' || k === 'M') { e.preventDefault(); if (!e.repeat) g.toggleMute(); return; }
      if (k === 'p' || k === 'P') { e.preventDefault(); if (!e.repeat) g.pause(); return; }
      SHIPS.keys[k.toLowerCase()] = true;
    });
    document.addEventListener('keyup', function (e) { if (e.key) SHIPS.keys[e.key.toLowerCase()] = false; });  // (autofill sends keyups with no key)
    window.addEventListener('blur', function () {  // switching away pauses a game
      SHIPS.keys = {}; SHIPS.pointer = null; SHIPS.down = {};
      var g = live(); if (g && g.mode() === 'play') g.pause(true);
    });
    document.addEventListener('pointerdown', function (e) {
      var g = live();
      if (!g) return;
      var p = local(g, e);
      if (!p.inside) return;
      if (e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,label,[role=button],[contenteditable]')) return;  // real controls still work
      if (g.mode() !== 'play') { g.start(); return; }
      if (g.muteHit(p.x, p.y)) { g.toggleMute(); return; }
      if (g.pauseHit(p.x, p.y) || g.paused()) { g.pause(); return; }   // the pause button, or a tap to carry on
      SHIPS.down[e.pointerId] = 1;
      SHIPS.pointer = { x: p.x, y: p.y };
    });
    document.addEventListener('pointermove', function (e) {
      var g = live();
      if (!g) return;
      var p = local(g, e);
      if (SHIPS.pointer) SHIPS.pointer = { x: p.x, y: p.y };
      if (p.inside) SHIPS.hover = { x: p.x, y: p.y, t: performance.now() };  // the demo ship looks at it
    });
    ['pointerup', 'pointercancel'].forEach(function (t) {
      document.addEventListener(t, function (e) { delete SHIPS.down[e.pointerId]; if (!Object.keys(SHIPS.down).length) SHIPS.pointer = null; });
    });
    // Dragging the ship on a phone shouldn't scroll the page, but only while a game is on.
    document.addEventListener('touchmove', function (e) { var g = live(); if (g && g.mode() === 'play' && SHIPS.pointer) e.preventDefault(); }, { passive: false });
  }

  function starships(w, h, scene, resumed) {
    scene = scene || {};
    var px = Math.max(2, Math.round(Math.min(h, 300) / 75)), i;
    // The demo flies just above the card's busy bottom (scene.ground: on the profile, the top of
    // the stats row). In a game the ship (and everything else) has the whole card but a thin edge:
    // the HUD is drawn over the play, with a soft backing so it stays readable.
    var floorY = scene.ground != null ? Math.min(scene.ground, h - px * 9) : h - px * 9;
    var demoY = floorY - px * 5, TOP = px * 5, BOTTOM = h - px * 5;
    var SPEED = 70 * px, BULLET = 200 * px;
    // Difficulty, all in one place (the first, easier numbers in brackets).
    var HARD = {
      paceStep: 0.07, paceMax: 1.6,        // game speed-up per level, and its cap (reached about level 10): a long game settles into a groove
      bossPace: [1.5, 0.05, 1.75],         // a boss fight's own speed: first boss, more per boss after, most (not the level's)
      rampTo: 8,                           // regular enemies stop getting busier after this level; bosses bring the challenge after that
      firstSpawn: 1.0,                     // seconds before the first enemies
      spawnGap: [1.4, 2.4], spawnFaster: 0.09, spawnMin: 0.9,  // gap between spawns (spawnFaster less per level, never under spawnMin)
      calmEvery: 8, calmFor: 3,            // after every calmEvery spawns, calmFor quiet seconds of starfield
      maxEnemies: 12,                      // on screen at once
      droneSpeed: 26, rockSpeed: [14, 24], // px per pixel-size per second
      // One new thing at a time: the level each enemy starts at.
      rocksFrom: 2,
      droneHpFrom: 8,                      // saucers take two hits from this level (one before)
      gunsFrom: 3, gunHp: 6, gunFire: [1.8, 0.05, 0.9], gunShot: 46,  // gunships: hits, fire gap (start, less per level, min) and shot speed
      dartsFrom: 5, dartChance: 0.12,      // darts: share of spawns
      dronesShootFrom: 6, droneShots: 0.14,// saucers shoot back, shots per second each
      fireGap: 0.24,                       // seconds between volleys: the guns fire by themselves
      powerTime: [0, 0, 0, 0],             // seconds at each power level (0: kept until a hit, as players expect)
      shieldTime: 0,                       // seconds a shield lasts if nothing hits it (0: until something does)
      bonusDrop: 0.6, chipChance: 0.25,    // chance a whole wave or a gunship drops something, and that it's a P chip (else a gem)
      lootDrop: 0.2, powerDrop: 0.01,      // chance any other wreck drops a coin or gem, or a P chip
      maxShots: [7, 11, 19],               // most of your bullets on screen at once at each power level (1, 2, 4 shots a volley)
      spread: 0.12,                        // how wide the top level's outer pair fans out
      invincible: 1.1,                     // blink time after a hit
      heartDrop: 0, maxHearts: 5,          // chance a wreck drops a heart (0: hearts come from points and bosses), most you can hold
      lifeEvery: 750,                      // an extra heart (1UP) every this many points: steady, never luck (about as often
                                           // as random drops and the old 1500-point 1UP gave them together)
      heartEveryLevels: 0,                 // and one every this many levels (0: none)
      magnet: 22                           // how close loot is pulled in, in pixel-sizes
    };
    // Score and level progress are one number: every point fills the level bar. The first level
    // is LEVEL_POINTS points and each one after needs LEVEL_STEP more (100, 110, 120...), so the
    // busier later levels don't rush by.
    var LEVEL_POINTS = 100, LEVEL_STEP = 10;
    function ramp() { return Math.min(level, HARD.rampTo); }  // the level that enemy numbers go by
    function xpNeed() { return LEVEL_POINTS + LEVEL_STEP * (level - 1); }

    // Sprites: rows of palette letters, '.' is empty. Ships and loot are drawn centred.
    var SHIP = { rows: ['.hh........', '.hbh.......', 'hbbbbbhcc..', 'rbbbbbbbbbh', 'hbbbbbhcc..', '.hbh.......', '.hh........'],
      pal: { h: '#e8ecf5', b: '#4f7cff', c: '#9ff3ff', r: '#ff3b5c' } };
    var DRONE = [
      { rows: ['..cccc..', '.cWccWc.', 'pppppppp', 'YpYpYpYp', '.pppppp.'], pal: { c: '#9ff3ff', W: '#ffffff', p: '#a04cff', Y: '#ffe14d' } },
      { rows: ['..cccc..', '.cWccWc.', 'pppppppp', 'pYpYpYpY', '.pppppp.'], pal: { c: '#9ff3ff', W: '#ffffff', p: '#a04cff', Y: '#ffe14d' } }
    ];
    var ROCK_PAL = { r: '#7a4a2a', R: '#b8743f', d: '#4a2a16' };
    var ROCK = { rows: ['..rrrr...', '.rRRrrr..', 'rRrrdRrr.', 'rrRrrrrdr', 'rrdrrrRrr', '.rrrrRrr.', '..rrdrr..', '...rr....'], pal: ROCK_PAL };
    var PEBBLE = { rows: ['.rrr.', 'rRrdr', 'rrrRr', '.rrr.'], pal: ROCK_PAL };
    var GUNSHIP = { rows: ['....RRRR..', '..RRrrrrR.', '.RrrWkrrrR', 'KKrrrrrrrR', '.RrrrrrrrR', '..RRrrrrR.', '....RRRR..'],
      pal: { r: '#ff3b5c', R: '#8a1830', W: '#ffffff', k: '#15151a', K: '#c3c9d4' } };
    var DART = { rows: ['....ooyW.', '.ooooyyWW', 'oooyyyWWW', '.ooooyyWW', '....ooyW.'], pal: { o: '#ff3b6b', y: '#ffb03b', W: '#ffffff' } };  // drawn flipped: head first, flying left
    // Bosses are drawn from shapes (in 0..1 of their width and height) onto a pixel grid sized to
    // the card, so a boss is big (over half the play area's height) at the same pixel size as
    // everything else. Each kind: its look (build: fills; detail: panels and lights after the
    // outline), its core (its weak point, behind a hatch: x, y, width, height), its two turrets
    // (centres), its colours and its way of moving. Order: tier 1, 2, 3, then repeat.
    function pixelGrid(cols, rows) {
      var g = [], y, x;
      for (y = 0; y < rows; y++) { g.push([]); for (x = 0; x < cols; x++) g[y].push('.'); }
      function put(x, y, ch, only) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return;
        if (only && (g[y][x] === '.' || g[y][x] === 'R')) return;  // detail: only on the hull, never the outline
        g[y][x] = ch;
      }
      function each(test, ch, only) {
        for (var yy = 0; yy < rows; yy++) for (var xx = 0; xx < cols; xx++) if (test((xx + 0.5) / cols, (yy + 0.5) / rows)) put(xx, yy, ch, only);
      }
      return {
        ell: function (cx, cy, rx, ry, ch, only) { each(function (u, v) { var a = (u - cx) / rx, b = (v - cy) / ry; return a * a + b * b <= 1; }, ch, only); },
        rect: function (x0, y0, x1, y1, ch, only) { each(function (u, v) { return u >= x0 && u <= x1 && v >= y0 && v <= y1; }, ch, only); },
        // a shape and its mirror image top to bottom (wings, fins)
        pair: function (pts, ch, only) { this.poly(pts, ch, only); this.poly(pts.map(function (q) { return [q[0], 1 - q[1]]; }), ch, only); },
        poly: function (pts, ch, only) {
          each(function (u, v) {
            for (var k = 0, j = pts.length - 1, inside = false; k < pts.length; j = k++) {
              if ((pts[k][1] > v) !== (pts[j][1] > v) && u < (pts[j][0] - pts[k][0]) * (v - pts[k][1]) / (pts[j][1] - pts[k][1]) + pts[k][0]) inside = !inside;
            }
            return inside;
          }, ch, only);
        },
        // a row of lights (or rivets): every `step` cells along y, on the hull only
        dots: function (x0, x1, y, step, ch) { var yy = Math.floor(y * rows); for (var xx = Math.round(x0 * cols); xx <= x1 * cols; xx += step) put(xx, yy, ch, true); },
        // panel seams: every `step` cells across, between y0 and y1, on the hull only
        seams: function (x0, x1, y0, y1, step, ch) { for (var xx = Math.round(x0 * cols); xx <= x1 * cols; xx += step) for (var yy = Math.floor(y0 * rows); yy <= y1 * rows; yy++) put(xx, yy, ch, true); },
        outline: function () {
          var o = g.map(function (r) { return r.slice(); });
          for (var yy = 0; yy < rows; yy++) for (var xx = 0; xx < cols; xx++) {
            if (o[yy][xx] === '.') continue;
            var edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { var r = o[yy + d[1]]; return !r || r[xx + d[0]] == null || r[xx + d[0]] === '.'; });
            if (edge) g[yy][xx] = 'R';
          }
        },
        rows: function () { return g.map(function (r) { return r.join(''); }); }
      };
    }
    var BOSS_KINDS = [
      { name: 'MOTHERSHIP', glow: '255,90,110', move: 'swoop', zap: 'bolt', aspect: 1.25,
        pal: { r: '#3a3f58', R: '#1c1f2e', D: '#262a3d', K: '#c3c9d4', W: '#ffffff', h: '#ffb03b', g: '#ffe14d' },
        build: function (g) {
          g.pair([[0.3, 0.44], [0.4, 0.12], [0.58, 0.06], [0.72, 0.42]], 'r');      // the pylons, up and down
          g.ell(0.5, 0.09, 0.15, 0.07, 'K'); g.ell(0.5, 0.91, 0.15, 0.07, 'K');     // a pod at the end of each
          g.ell(0.5, 0.5, 0.48, 0.17, 'r');                                        // the saucer
          g.ell(0.58, 0.4, 0.18, 0.12, 'K');                                       // its dome
          g.ell(0.95, 0.5, 0.04, 0.08, 'h');                                       // the engine
          g.rect(0, 0.45, 0.07, 0.55, '.');                                        // the bay its core sits in
        },
        detail: function (g) {
          g.ell(0.53, 0.35, 0.05, 0.04, 'W', true);
          g.rect(0.04, 0.53, 0.98, 0.57, 'D', true); g.dots(0.1, 0.94, 0.55, 4, 'g');  // the rim and its lights
          g.seams(0.34, 0.68, 0.14, 0.38, 5, 'D'); g.seams(0.34, 0.68, 0.62, 0.86, 5, 'D');
          g.dots(0.42, 0.6, 0.09, 3, 'g'); g.dots(0.42, 0.6, 0.91, 3, 'g');
        },
        core: [0.07, 0.44, 0.08, 0.12], turrets: [[0.38, 0.09], [0.38, 0.91]] },
      { name: 'DREADNOUGHT', glow: '110,224,90', move: 'lunge', zap: 'flame', aspect: 1.4,
        pal: { r: '#4a2a6a', R: '#1e1030', D: '#2e1a44', K: '#d0b8ff', W: '#ffffff', h: '#9ff3ff', g: '#9ff3ff' },
        build: function (g) {
          g.pair([[0.3, 0.42], [0.46, 0.07], [0.86, 0.07], [0.76, 0.42]], 'r');     // swept wings
          g.rect(0.56, 0.03, 0.9, 0.13, 'K'); g.rect(0.56, 0.87, 0.9, 0.97, 'K');  // engine pods on the wing tips
          g.rect(0.9, 0.04, 0.97, 0.12, 'h'); g.rect(0.9, 0.88, 0.97, 0.96, 'h');
          g.poly([[0, 0.5], [0.14, 0.37], [0.9, 0.37], [0.98, 0.44], [0.98, 0.56], [0.9, 0.63], [0.14, 0.63]], 'r');  // the hull, prow first
          g.rect(0.48, 0.28, 0.64, 0.38, 'K');                                     // the bridge
          g.rect(0.97, 0.43, 1, 0.57, 'h');
          g.rect(0, 0.45, 0.09, 0.55, '.');                                        // the bay its core sits in
        },
        detail: function (g) {
          g.dots(0.5, 0.62, 0.32, 3, 'g');
          g.rect(0.1, 0.49, 0.96, 0.51, 'D', true); g.seams(0.2, 0.9, 0.39, 0.61, 6, 'D');  // armour plates
          g.seams(0.45, 0.75, 0.12, 0.38, 6, 'D'); g.seams(0.45, 0.75, 0.62, 0.88, 6, 'D');
          g.dots(0.6, 0.88, 0.08, 4, 'g'); g.dots(0.6, 0.88, 0.92, 4, 'g');
        },
        core: [0.09, 0.44, 0.07, 0.12], turrets: [[0.56, 0.08], [0.56, 0.92]] },
      { name: 'LEVIATHAN', glow: '62,224,255', move: 'weave', zap: 'roar', tail: true, aspect: 1.15,
        pal: { r: '#6a5420', R: '#2a200a', D: '#4a3a14', K: '#ffe9a8', W: '#ffffff', h: '#ff6a1f', g: '#ffe9a8' },
        build: function (g) {
          g.pair([[0.32, 0.42], [0.5, 0.06], [0.66, 0.02], [0.78, 0.14], [0.72, 0.42]], 'r');  // great fins, up and down
          g.ell(0.55, 0.5, 0.42, 0.2, 'r');                                        // the body
          g.ell(0.22, 0.5, 0.2, 0.13, 'r');                                        // the snout
          g.rect(0, 0.44, 0.07, 0.56, '.');                                        // its open mouth: the core is in there
        },
        detail: function (g) {
          g.seams(0.42, 0.72, 0.08, 0.4, 4, 'D'); g.seams(0.42, 0.72, 0.6, 0.92, 4, 'D');  // the fins' ribs
          g.dots(0.5, 0.76, 0.14, 4, 'g'); g.dots(0.5, 0.76, 0.86, 4, 'g');
          g.dots(0.12, 0.42, 0.42, 3, 'K'); g.dots(0.12, 0.42, 0.58, 3, 'K');     // teeth
          g.ell(0.27, 0.42, 0.03, 0.035, 'h', true);                               // a glowing eye
          g.dots(0.5, 0.88, 0.5, 4, 'g'); g.seams(0.5, 0.92, 0.36, 0.64, 6, 'D');  // gills and scales
        },
        core: [0.07, 0.44, 0.08, 0.12], turrets: [[0.5, 0.1], [0.5, 0.9]] }
    ];
    var LOOT = {
      coin: { rows: ['.####.', '#yyyy#', '#yWyy#', '#yWyy#', '#yyyy#', '.####.'], pal: { '#': '#9a6400', y: '#ffc928', W: '#fff6b0' }, pts: 12, label: '+12', c: '#ffe14d' },
      gem: { rows: ['..c..', '.cWc.', 'cccCc', '.cCc.', '..c..'], pal: { c: '#3ee0ff', C: '#1a7fd6', W: '#ffffff' }, pts: 36, label: '+36', c: '#3ee0ff' },
      heart: { rows: ['.hh.hh.', 'hWhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'], pal: { h: '#ff3b5c', W: '#ffd0da' }, pts: 24, label: '1UP', c: '#ff6b85' },
      power: { rows: ['.gggg.', 'gPPPgg', 'gPggPg', 'gPPPgg', 'gPgggg', '.gggg.'], pal: { g: '#6ee05a', P: '#15151a' }, pts: 24, label: 'POWER UP', c: '#6ee05a' },
      shield: { rows: ['.cccc.', 'cWWccc', 'cWcccc', 'cccccc', '.cccc.', '..cc..'], pal: { c: '#3ee0ff', W: '#ffffff' }, pts: 24, label: 'SHIELD', c: '#3ee0ff' }
    };
    var SPEAKER_ON = { rows: ['...w.....', '..ww...w.', 'wwww.w..w', 'wwww.w..w', 'wwww.w..w', '..ww...w.', '...w.....'], pal: { w: '#ffffff' } };
    var SPEAKER_OFF = { rows: ['...w.....', '..ww.....', 'wwww.r.r.', 'wwww..r..', 'wwww.r.r.', '..ww.....', '...w.....'], pal: { w: '#ffffff', r: '#ff3b5c' } };
    var RAINBOW = ['#ff3b5c', '#ff9a1f', '#ffe14d', '#6ee05a', '#3ee0ff', '#7a5cff', '#ff5cd6'];
    var WRECK = { drone: ['#a04cff', '#9ff3ff', '#ffe14d'], rock: ['#7a4a2a', '#b8743f', '#ffd23f'], pebble: ['#7a4a2a', '#b8743f'],
      gun: ['#ff3b5c', '#8a1830', '#ffffff', '#ffd23f'], dart: ['#ff3b6b', '#ffb03b', '#ffffff'] };
    var POINTS = { drone: 8, rock: 12, pebble: 6, gun: 28 };  // per wreck (darts can't be shot: dodge them); WAVE_BONUS for a whole saucer wave
    var WAVE_BONUS = 30;
    // Bosses: one every BOSS_EVERY levels. Each tier (level / 10) is bigger, tougher and worth
    // more: BOSS_HP hits plus BOSS_HP_STEP per tier, BOSS_POINTS times the tier.
    var BOSS_EVERY = 10, BOSS_HP = 70, BOSS_HP_STEP = 15, BOSS_POINTS = 400;
    var TURRET_HP = 8, TURRET_HP_STEP = 3, TURRET_POINTS = 60;  // each turret's hits (plus a step per tier) and its points
    var TURRET_DAMAGE = 0.15;  // share of the boss's health a destroyed turret takes with it
    // Its close-range defence: stay within ZAP_ZONE (share of the card's width) of its nose for
    // ZAP_WAIT seconds and it charges for ZAP_CHARGE (core open: a greedy moment), then lashes
    // the zone for ZAP_TIME; then it rests ZAP_REST. Lightning, flame or a roar, by kind.
    var ZAP_ZONE = 0.13, ZAP_WAIT = 0.8, ZAP_CHARGE = 1.1, ZAP_TIME = 0.35, ZAP_REST = 3;
    // Its beam: stay in line with its core for BEAM_WAIT seconds and it charges for BEAM_CHARGE (a
    // thin line shows the row; the core is open: a greedy moment), then fires a beam along that
    // row for BEAM_TIME; then it rests BEAM_REST. Sitting in front of the weak point isn't safe.
    var BEAM_WAIT = 1.5, BEAM_CHARGE = 0.8, BEAM_TIME = 0.6, BEAM_REST = 3.5;
    var SHIELD_DROP = 0.012;  // chance a wreck drops a shield (it takes one hit for you)

    // Sectors: a new sky every five levels.
    var STAGES = [
      { name: 'NEAR ORBIT', night: ['#0b1030', '#2a2a6a'], day: ['#5fb6ff', '#cdeeff'], planet: ['#4fae55', '#2f7a3a', '#9fe08a'] },
      { name: 'ASTEROID BELT', night: ['#1a1220', '#4a2e3a'], day: ['#c98a6a', '#f3d2b0'], planet: ['#b8743f', '#7a4a2a', '#efad65'], ring: true },
      { name: 'NEBULA', night: ['#1e0f33', '#7a2b6b'], day: ['#d07ab8', '#f6c9e6'], planet: ['#ff5cd6', '#9a2a8a', '#ffc2f0'] },
      { name: 'DEEP SPACE', night: ['#03040c', '#141a3a'], day: ['#3a4a8a', '#9aa8e0'], planet: ['#82edee', '#2f8a9a', '#e0ffff'], ring: true }
    ];
    function stageIndex(atLevel) {
      var lv = atLevel == null ? level : atLevel;
      return lv >= 15 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0;
    }
    function stage() { return STAGES[stageIndex()]; }
    function snap(v) { return Math.round(v / px) * px; }

    var S = { x: w * 0.3, y: demoY, vx: 0, vy: 0, dir: 1, inv: 0, hearts: 3, power: 1, powerT: 0, fireT: 0, roll: 0, boost: 0, shield: false, shieldT: 0 };
    var mode = 'demo', bullets = [], shots = [], enemies = [], loot = [], sparks = [], pops = [];
    var score = 0, hi = 0, xp = 0, level = 1, levelT = 0, goT = 0, overT = 0, playT = 0, frameT = 0, spawnT = 0, shake = 0, host = null;
    var waves = {}, waveId = 0, hitSoundT = 0, spawns = 0;
    var boss = null, bossWarn = 0, nextBoss = BOSS_EVERY, bossTier = 1, bossBannerT = 0, alarmT = 0;
    var paused = false, newBest = false, nextLife = HARD.lifeEvery;
    // What a game was made of, for the GAME OVER screen.
    var stats = { kills: 0, bosses: 0, sector: 0 };
    // Scores beyond this browser are optional, as in Player One: a site can plug in
    // MDBCosmetics.arcadeScores (.start(cardEl, 'starships') -> a session or null), and at GAME
    // OVER gets the score and what it's made of (so it can check it adds up): wrecks by kind,
    // whole saucer waves, pickups by kind, turrets and bosses. Points: drone 8, rock 12, pebble
    // 6, gun 28, wave 30, coin 12, gem 36, heart / power / shield 24, turret 60, boss 400 x tier.
    var tally = null, session = null;
    function beginScoring() {
      tally = { drones: 0, rocks: 0, pebbles: 0, guns: 0, waves: 0, coins: 0, gems: 0, hearts: 0, powers: 0, shields: 0, turrets: 0, bosses: 0 };
      var hooks = FX.arcadeScores;
      session = hooks && hooks.start ? hooks.start(host, 'starships') : null;
    }
    function finishScoring() {
      if (!session) return;
      var result = { score: score, level: level, duration: playT.toFixed(2) };
      Object.keys(tally).forEach(function (k) { result[k] = tally[k]; });
      session.finish(result);
    }
    function savedBest() { var b = session && session.best(); return b == null ? null : b; }
    function bossKind(tier) { return BOSS_KINDS[(tier - 1) % BOSS_KINDS.length]; }
    // The demo's own little show: a target (a rock or a saucer) every few seconds, the coin it
    // leaves, and the ship's barrel rolls (S.roll counts down one) and speed bursts (S.boost).
    var demoFoes = [], demoFoeT = rnd(1, 2), demoCoins = [], demoComet = null, demoCometT = rnd(10, 16), rollT = rnd(5, 8), ROLL = 0.6, hvSeen = false;
    try { hi = parseInt(window.localStorage.getItem('mdb-starships-best'), 10) || 0; } catch (e) { /* storage blocked */ }

    // The backdrop behind a game, built once per sector and theme: sky and a big pixel planet.
    // Stars (night) or clouds (day) scroll past on top of it, in three layers of depth.
    var backdrop = null, stars = [], clouds = [];
    var starSeed = seeded(5);
    // Stars stay in the background: fewer, dim, one pixel, white or pale blue (nothing yellow or
    // orange, so nothing back there looks like a bullet).
    for (i = 0; i < Math.round(w * h / 2400); i++) stars.push({ x: starSeed() * w, y: starSeed() * h, layer: Math.floor(starSeed() * 3), blue: starSeed() < 0.3 });
    for (i = 0; i < Math.max(4, Math.round(w / 160)); i++) clouds.push({ x: starSeed() * w, y: starSeed() * (h - px * 20) + px * 6, layer: Math.floor(starSeed() * 3) });
    var LAYER_SPEED = [10, 22, 45], STAR_ALPHA = [0.18, 0.3, 0.45];
    function buildBackdrop(dark) {
      var st = stage(), c = document.createElement('canvas'), g = c.getContext('2d'), seed = seeded(11 + stageIndex() * 17);
      c.width = Math.ceil(w); c.height = Math.ceil(h);
      var gr = g.createLinearGradient(0, 0, 0, h), sky = dark ? st.night : st.day;
      gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // The planet: lit from the top left, with a few bands and craters.
      var r = Math.min(h * 0.38, px * 24), cx = snap(w * 0.8), cy = snap(h * 0.72), x, y;
      g.globalAlpha = dark ? 1 : 0.55;
      if (st.ring) {  // a ring behind it
        g.fillStyle = st.planet[2];
        for (x = -r * 1.8; x <= r * 1.8; x += px) { y = Math.sqrt(Math.max(0, 1 - (x * x) / (r * r * 3.24))) * r * 0.35; g.fillRect(snap(cx + x), snap(cy - y), px, px); }
      }
      for (y = -r; y <= r; y += px) for (x = -r; x <= r; x += px) {
        if (x * x + y * y > r * r) continue;
        var shade = (x + y) / r;
        g.fillStyle = shade > 0.45 ? st.planet[1] : shade < -0.9 ? st.planet[2] : st.planet[0];
        if (Math.floor((y + r) / px) % 6 === 0 && shade > -0.9) g.fillStyle = st.planet[1];
        g.fillRect(cx + x, cy + y, px, px);
      }
      g.fillStyle = st.planet[1];
      for (var k = 0; k < 5; k++) { var a = seed() * TAU, d = seed() * r * 0.6; g.fillRect(snap(cx + Math.cos(a) * d), snap(cy + Math.sin(a) * d), px * 2, px * 2); }
      if (st.ring) {  // and in front of it
        g.fillStyle = st.planet[2];
        for (x = -r * 1.8; x <= r * 1.8; x += px) { y = Math.sqrt(Math.max(0, 1 - (x * x) / (r * r * 3.24))) * r * 0.35; g.fillRect(snap(cx + x), snap(cy + y), px, px); }
      }
      g.globalAlpha = 1;
      backdrop = { c: c, dark: dark, stage: stageIndex() };
    }
    function drawBackdrop(ctx, dark, a, dt) {
      if (!backdrop || backdrop.dark !== dark || backdrop.stage !== stageIndex()) buildBackdrop(dark);
      ctx.save(); ctx.globalAlpha = a; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(backdrop.c, 0, 0);
      var fast = mode === 'play' ? 1 + 0.08 * (Math.min(level, 5) - 1) : 0.3;  // speeds up to level 5, then stays put
      if (dark) {
        stars.forEach(function (s) {
          s.x -= LAYER_SPEED[s.layer] * px / 3 * fast * dt; if (s.x < 0) { s.x += w; s.y = Math.random() * h; }
          ctx.fillStyle = s.blue ? '#b8d4ff' : '#ffffff'; ctx.globalAlpha = a * STAR_ALPHA[s.layer];
          ctx.fillRect(snap(s.x), snap(s.y), px, px);
        });
      } else {
        ctx.fillStyle = '#ffffff';
        clouds.forEach(function (c) {
          c.x -= LAYER_SPEED[c.layer] * px / 3 * fast * dt; if (c.x < -px * 20) { c.x = w + px * 10; c.y = Math.random() * (h - px * 20) + px * 6; }
          ctx.globalAlpha = a * (0.3 + c.layer * 0.15);  // soft, so they stay behind the action
          var s = 0.6 + c.layer * 0.3;
          [[0, 0, 14, 4], [3, -3, 8, 3], [-4, 1, 6, 3], [8, 1, 7, 3]].forEach(function (b) { ctx.fillRect(snap(c.x + b[0] * px * s), snap(c.y + b[1] * px * s), snap(b[2] * px * s), snap(b[3] * px * s)); });
        });
      }
      ctx.restore();
    }

    // Pixel text: drawn tiny on its own canvas, then scaled up unsmoothed so it stays chunky.
    var textCache = {}, textCount = 0;
    function textCanvas(str, color) {
      var key = str + color;
      if (!textCache[key]) {
        if (++textCount > 300) { textCache = {}; textCount = 1; }  // the score makes new text all game: start over now and then
        var c = document.createElement('canvas'), g = c.getContext('2d');
        g.font = '700 8px monospace'; var tw = Math.ceil(g.measureText(str).width) + 2;
        c.width = tw; c.height = 10; g.font = '700 8px monospace'; g.textBaseline = 'top'; g.fillStyle = color; g.fillText(str, 1, 1);
        textCache[key] = c;
      }
      return textCache[key];
    }
    function pixelText(ctx, str, x, y, scale, color, shadow, alpha, align) {
      var c = textCanvas(str, color), s = textCanvas(str, shadow);
      scale = Math.min(scale, Math.max(1, w - px * 8) / c.width);
      var cw = c.width * scale, ch = c.height * scale;
      var left = align === 'left' ? x : align === 'right' ? x - cw : x - cw / 2;
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.drawImage(s, left + scale, y - ch / 2 + scale, cw, ch);
      ctx.drawImage(c, left, y - ch / 2, cw, ch);
      ctx.restore();
    }
    // A sprite from its rows, painted pixel by pixel once into its own little canvas, then
    // stamped centred on x, y; sx/sy flip or squash it, rot turns it (radians).
    function spriteCanvas(sp) {
      if (!sp.img || sp.imgPx !== px) {
        var rows = sp.rows, cols = rows[0].length, c = document.createElement('canvas'), g = c.getContext('2d');
        c.width = cols * px; c.height = rows.length * px;
        for (var r = 0; r < rows.length; r++) for (var k = 0; k < cols; k++) {
          var ch = rows[r][k]; if (ch === '.') continue;
          g.fillStyle = sp.pal[ch]; g.fillRect(k * px, r * px, px, px);
        }
        sp.img = c; sp.imgPx = px;
      }
      return sp.img;
    }
    function sprite(ctx, sp, x, y, sx, sy, rot) {
      var img = spriteCanvas(sp);
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); if (rot) ctx.rotate(rot); ctx.scale(sx || 1, sy || 1); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
    function burst(x, y, count, colors, speed) {
      for (var k = 0; k < count; k++) {
        var a = rnd(0, TAU), v = rnd(0.3, 1) * speed;
        sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.4, 0.9), c: colors[k % colors.length] });
      }
    }
    function pop(x, y, label, color) { pops.push({ x: x, y: y, life: 1, label: label, c: color }); }
    var intro = [], cs = px * 8;
    for (var by = 0; by < h; by += cs) for (var bx = 0; bx < w; bx += cs) intro.push([bx, by, rnd(0.25, 1.2)]);

    function setPlaying(on) {
      if (!host) return;
      host.classList.toggle('cos-fx-playing', on);
      host.style.touchAction = on ? 'none' : '';  // a drag flies the ship instead of scrolling
    }
    function start() {
      if (mode === 'over' && overT < 1.2) return;  // let GAME OVER sink in first
      mode = 'play'; score = 0; level = 1; xp = 0; levelT = 0; goT = 1; playT = 0; spawnT = HARD.firstSpawn; shake = 0;
      S.x = w * 0.15; S.y = (TOP + BOTTOM) / 2; S.vx = S.vy = 0; S.dir = 1; S.inv = 1; S.hearts = 3; S.power = 1; S.fireT = 0;
      bullets = []; shots = []; enemies = []; loot = []; sparks = []; pops = []; waves = {}; boss = null; bossWarn = 0; nextBoss = BOSS_EVERY; bossBannerT = 0; demoFoes = []; demoCoins = []; demoComet = null; S.roll = S.boost = 0;
      S.powerT = 0; S.shield = false; S.shieldT = 0; paused = false; newBest = false; nextLife = HARD.lifeEvery; spawns = 0;
      stats = { kills: 0, bosses: 0, sector: 0 };
      beginScoring();
      SHIPS.keys = {}; SHIPS.pointer = null; SHIPS.down = {};
      setPlaying(true); sfxInit(); sfx('go');
    }
    function quit() {
      if (mode === 'play') sfxSleep(400);
      mode = 'demo'; bullets = []; shots = []; enemies = []; loot = []; boss = null; bossWarn = 0; paused = false; setPlaying(false);
      levelT = goT = bossBannerT = shake = 0; pops = []; S.inv = 0;  // no banners, shake or blinking left over in the demo demoFoeT = rnd(1, 2); demoCometT = rnd(10, 16);
    }
    function toggleMute() {
      SFX.muted = !SFX.muted;
      try { window.localStorage.setItem('mdb-arcade-mute', SFX.muted ? '1' : '0'); } catch (e) { /* storage blocked */ }
      if (!SFX.muted) { sfxInit(); sfx('coin'); }
      pop(S.x, S.y - px * 8, SFX.muted ? 'SOUND OFF' : 'SOUND ON', '#ffffff');
    }
    // Pause: P, the pause button, or switching away. force: pause (never un-pause).
    function pause(force) {
      if (mode !== 'play') return;
      paused = force === true ? true : !paused;
      SHIPS.pointer = null; SHIPS.down = {}; sfx('pause');
    }
    // On screen during a game: a small pause button (top right, under the score). Sound is on the
    // PAUSED screen (and the M key), so play has one small control, not a row of boxes.
    function pauseBox() { return { x0: w - px * 12, x1: w - px * 2, y0: px * 10, y1: px * 19 }; }
    function pauseHit(x, y) { var b = pauseBox(); return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1; }
    function muteBox() { return { x0: w / 2 - px * 26, x1: w / 2 + px * 26, y0: h * 0.76 - px * 5, y1: h * 0.76 + px * 5 }; }
    function muteHit(x, y) { var b = muteBox(); return paused && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1; }

    function levelUp() {
      var before = stageIndex();
      xp -= xpNeed(); level++; levelT = 1.6;
      burst(w / 2, h * 0.3, 36, RAINBOW, 220 * px / 3); sfx('level'); stats.sector = Math.max(stats.sector, stageIndex());
      if (HARD.heartEveryLevels && level % HARD.heartEveryLevels === 0 && S.hearts < HARD.maxHearts) { S.hearts++; pop(S.x, S.y - px * 12, '1UP', '#ff6b85'); sfx('life'); }  // a sure heart
      if (stageIndex() !== before) { enemies = []; shots = []; S.inv = Math.max(S.inv, 1.2); spawnT = 1.5; }  // a fresh sector
      if (level >= nextBoss && !boss && !bossWarn) { bossTier = Math.round(nextBoss / BOSS_EVERY); bossWarn = 2.5; alarmT = 0; enemies = []; shots = []; }  // here it comes
    }
    function gain(points) {
      score += points; xp += points;
      while (HARD.lifeEvery && score >= nextLife) {  // every HARD.lifeEvery points: an extra heart
        nextLife += HARD.lifeEvery;
        if (S.hearts < HARD.maxHearts) { S.hearts++; pop(S.x, S.y - px * 12, '1UP', '#ff6b85'); sfx('life'); }
      }
      if (boss || bossWarn > 0) return;  // no level-ups mid boss fight: they come once it's down
      while (xp >= xpNeed()) levelUp();
    }
    function dropLoot(kind, x, y) { loot.push({ kind: kind, x: x, y: Math.max(TOP, Math.min(BOTTOM, y)), t: rnd(0, TAU) }); }
    function kill(e) {
      stats.kills++; tally[e.kind + 's']++;
      var pt = POINTS[e.kind], big = e.kind === 'rock' || e.kind === 'gun';
      gain(pt); pop(e.x, e.y - px * 6, '+' + pt, '#ffe14d');
      burst(e.x, e.y, big ? 26 : 14, WRECK[e.kind], (big ? 200 : 140) * px / 3); sfx(big ? 'bigboom' : 'boom');
      if (big) shake = Math.max(shake, 0.15);
      if (e.kind === 'rock') { addRock(false, e.x, e.y, e.vx * 1.2, -px * 14); addRock(false, e.x, e.y, e.vx * 1.2, px * 14); }
      var wv = e.wave && waves[e.wave];
      if (wv && ++wv.killed === wv.n) {  // the whole wave: a bonus, and often something good
        gain(WAVE_BONUS); tally.waves++; pop(e.x, e.y - px * 12, 'WAVE BONUS +' + WAVE_BONUS, '#6ee05a'); sfx('wave');
        if (Math.random() < HARD.bonusDrop) dropLoot(S.power < 3 && Math.random() < HARD.chipChance ? 'power' : 'gem', e.x, e.y);
      } else if (e.kind === 'gun') { if (Math.random() < HARD.bonusDrop) dropLoot(S.power < 3 && Math.random() < HARD.chipChance ? 'power' : 'gem', e.x, e.y); }
      else {  // anything else: now and then a heart, a P chip, a shield, or a coin or gem
        var r = Math.random(), heart = HARD.heartDrop, chip = heart + HARD.powerDrop, shield = chip + SHIELD_DROP;
        if (r < heart && S.hearts < HARD.maxHearts) dropLoot('heart', e.x, e.y);
        else if (r < chip && S.power < 3) dropLoot('power', e.x, e.y);
        else if (r < shield && !S.shield) dropLoot('shield', e.x, e.y);
        else if (r < shield + HARD.lootDrop) dropLoot(Math.random() < 0.8 ? 'coin' : 'gem', e.x, e.y);
      }
    }
    function hurt(fromX, fromY) {
      if (S.inv > 0 || mode !== 'play') return;
      if (S.shield) {  // the shield pops instead
        S.shield = false; S.inv = 1; pop(S.x, S.y - px * 8, 'SHIELD DOWN', '#3ee0ff');
        burst(S.x, S.y, 18, ['#3ee0ff', '#ffffff'], 160 * px / 3); sfx('shieldbreak'); return;
      }
      S.hearts--; S.inv = HARD.invincible; S.power = Math.max(1, S.power - 1); if (S.power === 1) S.powerT = 0; shake = 0.3;
      S.vx = (S.x < fromX ? -1 : 1) * SPEED * 1.2; S.vy = (S.y < fromY ? -1 : 1) * SPEED * 0.6;
      pop(S.x, S.y - px * 8, '-1', '#ff3b5c'); burst(S.x, S.y, 14, ['#ff3b5c', '#ffffff', '#4f7cff'], 150 * px / 3);
      if (S.hearts > 0) { sfx('hurt'); return; }
      if (savedBest() != null) hi = savedBest();  // on a site that keeps scores, its best is the one to beat
      mode = 'over'; overT = 0; enemies = []; shots = []; bullets = []; loot = []; boss = null; bossWarn = 0; newBest = score > hi;
      burst(S.x, S.y, 40, ['#ff6a1f', '#ffd23f', '#ffffff', '#4f7cff'], 260 * px / 3); sfx('bigboom'); sfx('over'); sfxSleep(1500);
      if (score > hi) { hi = score; try { window.localStorage.setItem('mdb-starships-best', String(hi)); } catch (e) { /* storage blocked */ } }
      finishScoring();
    }

    // Spawning: saucer waves, then rocks, gunships and darts as each one's level comes up.
    function addRock(big, x, y, vx, vy) {
      enemies.push({ kind: big ? 'rock' : 'pebble', x: x, y: y, vx: vx, vy: vy, hp: big ? 3 : 1, r: big ? px * 4.5 : px * 2.5, rot: rnd(0, TAU), spin: rnd(-2.5, 2.5), t: 0 });
    }
    function addWave() {
      var n = Math.min(5, 3 + Math.floor(ramp() / 3)), id = ++waveId, room = (BOTTOM - TOP) / 2;
      var amp = Math.max(0, Math.min(px * rnd(6, 14), room - px * 6)), y0 = rnd(TOP + amp + px * 4, BOTTOM - amp - px * 4);
      waves[id] = { n: n, killed: 0 };
      for (var k = 0; k < n; k++) enemies.push({ kind: 'drone', x: w + px * 8 + k * px * 13, y: y0, y0: y0, amp: amp, ph: k * 0.7, vx: -HARD.droneSpeed * px, hp: level >= HARD.droneHpFrom ? 2 : 1, r: px * 4, t: 0, wave: id });
    }
    function addGunship() {
      enemies.push({ kind: 'gun', x: w + px * 8, y: rnd(TOP + px * 8, BOTTOM - px * 8), vx: -20 * px, vy: rnd(-1, 1) * 6 * px, hold: w * rnd(0.68, 0.85), hp: HARD.gunHp, r: px * 5, fireT: 1, life: 8, t: 0 });
    }
    function addDart() {
      enemies.push({ kind: 'dart', warn: 0.9, x: w + px * 8, y: Math.max(TOP, Math.min(BOTTOM, S.y)), vx: -95 * px, hp: 1, r: px * 3, t: 0 });
      sfx('warn');
    }
    function spawn() {
      spawns++;
      var belt = stageIndex() === 1, r = Math.random();
      var guns = enemies.filter(function (e) { return e.kind === 'gun'; }).length;
      if (level >= HARD.dartsFrom && r < HARD.dartChance) addDart();
      else if (level >= HARD.gunsFrom && r < HARD.dartChance + 0.18 && guns < Math.min(2, 1 + Math.floor(ramp() / 6))) addGunship();
      else if (level >= HARD.rocksFrom && r < (belt ? 0.7 : 0.5)) addRock(Math.random() < 0.5, w + px * 8, rnd(TOP, BOTTOM), -rnd(HARD.rockSpeed[0], HARD.rockSpeed[1]) * px, rnd(-8, 8) * px);
      else addWave();
    }

    // The boss fight. After the WARNING the boss flies in and holds on the right, drifting and
    // making its own move: the Mothership swoops to new heights, the Dreadnought lunges forward
    // (its engines flare first), the Leviathan weaves a figure eight, its tail waving. It picks
    // attacks in a shuffled order, each charged up first, all made to keep you moving; each tier
    // knows one more: aimed bursts (from its turrets) and walls of shots with a gap that moves,
    // then a stream that sweeps up and down (tier 2), weaving shots (tier 3), a spinning spiral
    // (tier 4 and up). Its core opens while an attack charges and for a moment after: the only
    // time it can be hurt. Below half health it's angrier (quicker, more shots) and smokes, and
    // burns below a quarter. Each tier adds size (as far as the card allows), health, shots and
    // speed. Brought down, it blows up in a chain of blasts and drops a heart, a P chip and gems.
    // A boss's pixel maps, built to fit this card: almost the play area's whole height (its wings
    // reach up and down), no wider than half the card. Its turrets, its tail's segments and
    // white copies (the flash when hit) are built to match.
    function buildBoss(kind, tr) {
      var tall = Math.min((BOTTOM - TOP) * 0.88, w * 0.45 / kind.aspect);
      var rows = Math.max(14, Math.round(tall / px)), cols = Math.round(rows * kind.aspect), g = pixelGrid(cols, rows), white = {};
      kind.build(g); g.outline(); kind.detail(g);
      Object.keys(kind.pal).forEach(function (ch) { white[ch] = '#ffffff'; });
      var tW = Math.max(7, Math.round(rows * 0.26)), tH = Math.max(5, Math.round(rows * 0.13)), seg = Math.max(4, Math.round(rows * 0.2));
      var tg = pixelGrid(tW, tH);  // a gun pod: a round housing, a long barrel to the left, a light
      tg.ell(0.68, 0.55, 0.3, 0.45, 'K'); tg.rect(0, 0.38, 0.55, 0.62, 'K'); tg.rect(0, 0.32, 0.08, 0.68, 'K'); tg.outline();
      tg.rect(0.1, 0.48, 0.5, 0.52, 'D', true); tg.ell(0.7, 0.5, 0.12, 0.2, 'h', true);
      var wg = pixelGrid(tW, tH); wg.ell(0.66, 0.65, 0.3, 0.35, 'D'); wg.outline();  // what's left of one
      var sg = pixelGrid(seg, seg); sg.ell(0.5, 0.5, 0.5, 0.5, 'r'); sg.outline(); sg.seams(0.3, 0.7, 0.2, 0.8, 3, 'D');
      var map = g.rows(), tmap = tg.rows(), c = kind.core;
      return { cols: cols, rows: rows, tW: tW, tH: tH, segN: seg,
        sp: { rows: map, pal: kind.pal }, white: { rows: map, pal: white },
        turretSp: { rows: tmap, pal: kind.pal }, turretWhite: { rows: tmap, pal: white }, wreck: { rows: wg.rows(), pal: kind.pal }, seg: { rows: sg.rows(), pal: kind.pal },
        edge: map.map(function (r) { return r.search(/[^.]/); }),  // where each row's armour starts, for shots to hit
        core: { x: Math.round(c[0] * cols), y: Math.round(c[1] * rows), w: Math.max(2, Math.round(c[2] * cols)), h: Math.max(2, Math.round(c[3] * rows)) },
        spots: kind.turrets.map(function (t) { return [t[0] * cols, t[1] * rows]; }) };
    }
    function makeBoss(tier) {
      var kind = bossKind(tier), tr = tier - 1, mid = (TOP + BOTTOM) / 2, m = buildBoss(kind, tr);
      var hp = BOSS_HP + BOSS_HP_STEP * tr, thp = TURRET_HP + TURRET_HP_STEP * tr;
      var b = { kind: kind, tier: tier, tr: tr, scale: 1, W: m.cols * px, H: m.rows * px, hp: hp, maxHp: hp,
        x: w + m.cols * px, y: mid, t: 0, state: 'enter', fireT: 1.2, last: -1, charge: 0, pending: 0, volley: 0, volleyT: 0, spiral: 0, spiralA: 0, spiralT: 0, walls: 0, wallT: 0, gapY: 0, stream: 0, streamT: 0, flash: 0, dieT: 0,
        open: 0, openT: 0, near: 0, zapC: 0, zapT: 0, zapCd: 0, lined: 0, beamC: 0, beamT: 0, beamCd: 0, ty: mid, moveT: 3, lungeT: 6, lunge: 0, lx: 0,
        turrets: m.spots.map(function (c) { return { cx: c[0], cy: c[1], hp: thp, flash: 0 }; }) };
      for (var key in m) if (key !== 'spots') b[key] = m[key];
      return b;
    }
    // Where a spot on the boss's map (in cells, from its top left) is on the card.
    function bossAt(b, cx, cy) { var c = px * b.scale; return { x: b.x - b.W / 2 + cx * c, y: b.y - b.H / 2 + cy * c }; }
    function coreAt(b) { var k = b.core; return bossAt(b, k.x + k.w / 2, k.y + k.h / 2); }
    function turretsUp(b) { return b.turrets.filter(function (t) { return t.hp > 0; }); }
    function bossShots(b, n, spread, aim, speed, from) {
      var o = from || coreAt(b), a = aim ? Math.atan2(S.y - o.y, S.x - o.x) : Math.PI;
      for (var k = 0; k < n; k++) {
        var aa = a + (n > 1 ? (k / (n - 1) - 0.5) * spread : 0);
        shots.push({ x: o.x, y: o.y, vx: Math.cos(aa) * speed * px, vy: Math.sin(aa) * speed * px });
      }
      sfx('zap');
    }
    function hitSound(name) { if (hitSoundT <= 0) { hitSoundT = 0.06; sfx(name); } }
    // One of your shots at (x, y), inside the boss's box: true when it hits something (it's used
    // up). A shot in line with a turret hits the turret; in line with the core, the core (or its
    // shut hatch); anything else flies on until it meets that row's armour and glances off.
    function bossHit(x, y) {
      var b = boss, c = px * b.scale, k;
      for (k = 0; k < b.turrets.length; k++) {
        var t = b.turrets[k]; if (t.hp <= 0) continue;
        var tp = bossAt(b, t.cx, t.cy);
        if (Math.abs(y - tp.y) > b.tH * c / 2 + px * 0.5 || x < tp.x - b.tW * c / 2) continue;
        t.flash = 0.06;
        if (--t.hp > 0) { hitSound('hit'); return true; }
        burst(tp.x, tp.y, 22, ['#ff6a1f', '#ffd23f', '#ffffff', b.kind.pal.K], 180 * px / 3); sfx('bigboom'); shake = Math.max(shake, 0.2);
        gain(TURRET_POINTS); tally.turrets++; pop(tp.x, tp.y - px * 6, 'TURRET +' + TURRET_POINTS, '#ffe14d'); dropLoot('power', tp.x, tp.y);
        b.hp = Math.max(0, b.hp - Math.ceil(b.maxHp * TURRET_DAMAGE)); b.flash = 0.12;  // losing a turret hurts the boss too
        if (b.hp <= 0) { b.state = 'dying'; b.dieT = 1.6; shots = []; }
        return true;
      }
      var core = b.core, cp = coreAt(b);
      if (Math.abs(y - cp.y) < core.h * c / 2 + px * 1.5) {  // a little wider than it looks: forgiving
        if (x < bossAt(b, core.x, 0).x) return false;
        if (b.open < 0.6) { sparks.push({ x: x, y: y, vx: -rnd(40, 90) * px / 3, vy: rnd(-40, 40) * px / 3, life: rnd(0.1, 0.2), c: '#ffffff', flame: true }); hitSound('tink'); return true; }
        b.hp--; b.flash = 0.05;
        if (b.hp <= 0) { b.hp = 0; b.state = 'dying'; b.dieT = 1.6; shots = []; }
        else hitSound('hit');
        return true;
      }
      var row = Math.floor((y - (b.y - b.H / 2)) / c), edge = b.edge[row];
      if (edge == null || edge < 0 || x < bossAt(b, edge, 0).x) return false;
      sparks.push({ x: x, y: y, vx: -rnd(40, 90) * px / 3, vy: rnd(-40, 40) * px / 3, life: rnd(0.1, 0.2), c: '#ffffff', flame: true });
      hitSound('tink');
      return true;
    }
    function bossUpdate(wdt, dt) {
      if (bossWarn > 0) {
        bossWarn -= dt; alarmT -= dt;
        if (alarmT <= 0) { alarmT = 0.5; sfx('alarm'); }
        if (bossWarn <= 0) { bossWarn = 0; boss = makeBoss(bossTier); }
        return;
      }
      if (!boss) return;
      var b = boss, tr = b.tr, hold = Math.max(w * 0.5 + b.W / 2, w - b.W / 2 - px * 6 - (b.kind.tail ? b.segN * px * 2.4 : 0)), range = Math.max(0, (BOTTOM - TOP - b.H) / 2), mid = (TOP + BOTTOM) / 2;
      if (b.flash > 0) b.flash -= dt;
      b.turrets.forEach(function (t) { if (t.flash > 0) t.flash -= dt; });
      if (b.state === 'enter') { b.x -= 30 * px * dt; if (b.x <= hold) { b.x = hold; b.state = 'fight'; } return; }
      if (b.state === 'dying') {
        b.dieT -= dt; shake = Math.max(shake, 0.2);
        if (Math.random() < dt * 14) { burst(b.x + rnd(-0.5, 0.5) * b.W, b.y + rnd(-0.5, 0.5) * b.H, 12, ['#ff6a1f', '#ffd23f', '#ffffff', 'rgb(' + b.kind.glow + ')'], 160 * px / 3); sfx('boom'); }
        if (b.dieT <= 0) {
          var pts = BOSS_POINTS * b.tier;
          burst(b.x, b.y, 60, RAINBOW, 280 * px / 3); sfx('bigboom'); shake = 0.5;
          gain(pts); pop(b.x, b.y - b.H / 2 - px * 4, 'BOSS +' + pts, '#ffe14d');
          dropLoot('heart', b.x - px * 8, b.y - px * 8); dropLoot('power', b.x - px * 8, b.y + px * 8);
          for (var g = 0; g < 3 + tr; g++) dropLoot('gem', b.x + rnd(-px * 10, px * 10), b.y + rnd(-px * 12, px * 12));
          stats.bosses++; tally.bosses++;
          bossBannerT = 2.5; bossTier = b.tier; boss = null; nextBoss += BOSS_EVERY; spawnT = 3; gain(0);  // any level-ups earned during the fight
        }
        return;
      }
      var angry = b.hp < b.maxHp / 2, still = 1 - 0.9 * b.open, mdt = wdt * still;  // it all but stops while its core is open: your window
      b.t += mdt;
      // Moving: each boss its own way, slow enough that shots across the card still land.
      if (b.kind.move === 'swoop') {  // every few seconds, a swoop to a new height
        if ((b.moveT -= mdt) <= 0) { b.moveT = rnd(3, 5) - (angry ? 1 : 0); b.ty = mid + rnd(-1, 1) * range; }
        b.y += (b.ty - b.y) * Math.min(1, mdt * 1.6);
      } else if (b.kind.move === 'weave') {  // a slow figure eight, edging forward and back
        b.y = mid + Math.sin(b.t * (angry ? 0.75 : 0.6)) * range; b.lx = (Math.sin(b.t * (angry ? 1.5 : 1.2)) + 1) * px * 7;
      } else {  // lunge: drifts, and now and then rams forward and pulls back, its engines flaring first
        b.y = mid + Math.sin(b.t * ((angry ? 0.55 : 0.4) + 0.05 * tr)) * range;
        if (b.lunge > 0) { b.lunge = Math.max(0, b.lunge - wdt); b.lx = Math.sin((1 - b.lunge / 1.8) * Math.PI) * w * 0.18; }
        else if (b.charge <= 0 && b.spiral <= 0 && (b.lungeT -= wdt) <= 0) { b.lungeT = rnd(6, 8) - (angry ? 1.5 : 0); b.lunge = 1.8; b.warned = false; }
        else if (b.lungeT < 0.7 && b.lungeT > 0) {
          if (!b.warned) { b.warned = true; sfx('charge'); }
          var ep = bossAt(b, b.cols, b.rows / 2);
          if (Math.random() < 0.7) sparks.push({ x: ep.x, y: ep.y + rnd(-px * 3, px * 3), vx: rnd(30, 70) * px / 3, vy: rnd(-10, 10), life: rnd(0.15, 0.3), c: Math.random() < 0.5 ? '#ffffff' : b.kind.pal.h, flame: true });
        }
      }
      b.x = hold - b.lx;
      // Too long in line with its core: it charges (a thin line along the row), then fires its beam down it.
      var bc = coreAt(b), beamHalf = b.core.h * px / 2 + px * 2, inLine = Math.abs(S.y - bc.y) < beamHalf + px * 2;
      if (b.beamCd > 0) b.beamCd -= wdt;
      if (b.beamT > 0) { b.beamT -= wdt; if (Math.abs(S.y - bc.y) < beamHalf + px * 2.5 && S.x < bc.x) hurt(S.x + px * 10, bc.y); if (b.beamT <= 0) b.beamCd = BEAM_REST; }
      else if (b.beamC > 0) { if ((b.beamC -= wdt) <= 0) { b.beamT = BEAM_TIME; sfx('beam'); shake = Math.max(shake, 0.1); } }
      else {
        b.lined = inLine ? b.lined + wdt : 0;
        if (b.lined > BEAM_WAIT && b.beamCd <= 0 && b.zapC <= 0 && b.zapT <= 0) { b.beamC = BEAM_CHARGE; b.lined = 0; sfx('beamup'); }
      }
      // Too close for too long: it charges (crackling, the zone hazed) and lashes the zone in front of it.
      var nose = b.x - b.W / 2, inZone = S.x > nose - w * ZAP_ZONE;
      if (b.zapCd > 0) b.zapCd -= wdt;
      if (b.zapT > 0) { b.zapT -= wdt; if (inZone) hurt(nose, S.y); if (b.zapT <= 0) b.zapCd = ZAP_REST; }
      else if (b.zapC > 0) {
        if ((b.zapC -= wdt) <= 0) { b.zapT = ZAP_TIME; sfx('lash'); shake = Math.max(shake, 0.15); }
        else if (Math.random() < 0.5) { var zs = bossAt(b, 0, rnd(0.3, 0.7) * b.rows); sparks.push({ x: zs.x, y: zs.y, vx: -rnd(20, 60) * px / 3, vy: rnd(-40, 40) * px / 3, life: rnd(0.1, 0.25), c: Math.random() < 0.5 ? '#ffffff' : 'rgb(' + b.kind.glow + ')', flame: true }); }
      } else {
        b.near = inZone ? b.near + wdt : 0;
        if (b.near > ZAP_WAIT && b.zapCd <= 0) { b.zapC = ZAP_CHARGE; b.near = 0; sfx('crackle'); }
      }
      // The core's hatch: open while an attack (or its close-range lash) charges and for a moment after it fires.
      b.openT -= wdt;
      b.open += ((b.charge > 0 || b.openT > 0 || b.zapC > 0 || b.beamC > 0 ? 1 : 0) - b.open) * Math.min(1, dt * 8);
      // Hurt: smoke from the hull below half health, fire below a quarter.
      if (angry && Math.random() < dt * (b.hp < b.maxHp / 4 ? 14 : 6)) {
        var sp = bossAt(b, rnd(0.25, 0.85) * b.cols, rnd(0.38, 0.62) * b.rows), fire = b.hp < b.maxHp / 4 && Math.random() < 0.5;
        sparks.push({ x: sp.x, y: sp.y, vx: rnd(10, 30) * px / 3, vy: -rnd(15, 35) * px / 3, life: rnd(0.3, 0.7), c: fire ? (Math.random() < 0.5 ? '#ff9a1f' : '#ffd23f') : (Math.random() < 0.5 ? '#8a8f99' : '#5a5f6e'), flame: true });
      }
      if (b.volley > 0) {  // aimed bursts, one from each turret still standing
        b.volleyT -= wdt;
        if (b.volleyT <= 0) {
          b.volley--; b.volleyT = 0.22;
          var guns = turretsUp(b), per = (angry ? 3 : 2) + Math.floor(tr / 2);
          if (guns.length) guns.forEach(function (t) { bossShots(b, per, 0.25 + 0.05 * tr, true, 50 + 5 * tr, bossAt(b, t.cx - b.tW / 2, t.cy)); });
          else bossShots(b, per + 1, 0.3 + 0.05 * tr, true, 50 + 5 * tr);  // no turrets left: the core fires them itself
        }
      }
      if (b.spiral > 0) {  // a stream of shots, turning as it goes
        b.spiral -= wdt; b.spiralT -= wdt;
        if (b.spiralT <= 0) {
          var cp = coreAt(b);
          b.spiralT = angry ? 0.06 : 0.09; b.spiralA += 0.45;
          shots.push({ x: cp.x, y: cp.y, vx: Math.cos(b.spiralA) * 34 * px, vy: Math.sin(b.spiralA) * 34 * px });
          if (Math.floor(b.spiralA / 0.45) % 4 === 0) sfx('zap');
        }
      }
      if (b.walls > 0) {  // a wall of shots across the whole height, with one gap; the gap moves wall to wall
        b.wallT -= wdt;
        if (b.wallT <= 0) {
          var gap = Math.max(px * 16, px * (24 - 2 * tr)), wx = b.x - b.W / 2;
          b.walls--; b.wallT = angry ? 0.6 : 0.75;
          for (var wy = TOP + px * 2; wy <= BOTTOM; wy += px * 6) if (Math.abs(wy - b.gapY) > gap / 2) shots.push({ x: wx, y: wy, vx: -(34 + 3 * tr) * px, vy: 0 });
          b.gapY = Math.max(TOP + gap / 2, Math.min(BOTTOM - gap / 2, b.gapY + rnd(0.5, 1) * (Math.random() < 0.5 ? -1 : 1) * px * 16));
          sfx('zap');
        }
      }
      if (b.stream > 0) {  // a stream of shots that sweeps up and down: a snake to slip through
        b.stream -= wdt; b.streamT -= wdt;
        if (b.streamT <= 0) {
          var so = coreAt(b), sa = Math.atan2(S.y - so.y, S.x - so.x) + Math.sin(b.stream * (3 + 0.3 * tr)) * 0.6;  // sweeping across you
          b.streamT = angry ? 0.06 : 0.08;
          shots.push({ x: so.x, y: so.y, vx: Math.cos(sa) * 40 * px, vy: Math.sin(sa) * 40 * px });
          if (Math.random() < 0.3) sfx('zap');
        }
      }
      b.fireT -= wdt;
      var busy = b.volley > 0 || b.walls > 0 || b.stream > 0 || b.spiral > 0;  // one attack at a time
      if (b.fireT <= 0 && b.lunge <= 0 && !busy) {  // pick the next attack and charge it up: the core opens and flashes, so you see it coming
        b.fireT = Math.max(1.8, (angry ? 2.6 : 3.4) - 0.15 * tr);
        var pool = [0, 1, 2, 4, 3].slice(0, Math.min(5, b.tier + 1));
        if (pool.length > 1) pool = pool.filter(function (p) { return p !== b.last; });  // never the same twice in a row
        var pat = pool[Math.floor(Math.random() * pool.length)];
        b.last = pat; b.pending = pat; b.charge = 0.6; sfx('charge');
      }
      if (b.charge > 0 && (b.charge -= wdt) <= 0) {
        var at = b.pending;
        b.openT = Math.max(1.2, 1.7 - 0.1 * tr);  // the core stays open a moment: your chance
        if (at === 0) { b.volley = Math.min(5, 3 + tr); b.volleyT = 0; }                      // aimed bursts from the turrets
        else if (at === 1) {                                                                   // walls with a gap, starting away from you
          var g0 = Math.max(px * 16, px * (24 - 2 * tr));
          for (var tries = 0; tries < 6; tries++) { b.gapY = rnd(TOP + g0 / 2, BOTTOM - g0 / 2); if (Math.abs(b.gapY - S.y) > (BOTTOM - TOP) * 0.3) break; }
          b.walls = angry ? 4 : 3; b.wallT = 0;
        } else if (at === 2) { b.stream = 2.4; b.streamT = 0; }                               // a sweeping stream
        else if (at === 4) {                                                                   // a fan of shots that weave as they fly
          var wo = coreAt(b), wn = (angry ? 7 : 5) + 2 * Math.floor(tr / 2), wAim = Math.atan2(S.y - wo.y, S.x - wo.x);  // odd: one comes straight at you
          for (var k = 0; k < wn; k++) {
            var wa = wAim + (k / (wn - 1) - 0.5) * 1.1;
            shots.push({ x: wo.x, y: wo.y, by: wo.y, vx: Math.cos(wa) * (32 + 3 * tr) * px, vy: Math.sin(wa) * (32 + 3 * tr) * px, amp: px * 6, f: 5, ph: k, t: 0 });
          }
          sfx('zap');
        } else { b.spiral = 2.2; b.spiralT = 0; }                                             // spinning spiral
      }
      var rr = b.edge[Math.floor((S.y - (b.y - b.H / 2)) / px)];  // rammed it: touching its armour in the ship's row
      if (S.inv <= 0 && rr != null && rr >= 0 && S.x + px * 5 >= bossAt(b, rr, 0).x && S.x - px * 5 <= b.x + b.W / 2) hurt(b.x, b.y);
    }

    var handle = { canvas: null, seen: 0, mode: function () { return mode; }, start: start, quit: quit, toggleMute: toggleMute, muteHit: muteHit,
      pause: pause, paused: function () { return paused; }, pauseHit: pauseHit };
    return { intro: 1.6, loop: 6, rest: 4, layered: true, poster: 3.2, draw: function (front, w, h, phase, t, dt, T, edge, back) {
      // Playable only on a single canvas whose card is marked for it (data-arcade-play).
      var hostEl = front.canvas && front.canvas.parentNode;
      var dark = isDark(), playable = front === back && !!(hostEl && hostEl.hasAttribute && hostEl.hasAttribute('data-arcade-play'));
      if (playable) {
        if (mode === 'play' && !paused && handle.seen && performance.now() - handle.seen > 500) pause(true);  // back from off screen: paused, not mid-fight
        bind(); handle.canvas = front.canvas; handle.seen = performance.now(); SHIPS.inst = handle; host = hostEl;
      }
      else if (mode !== 'demo') quit();  // a game only runs where it can be played
      if (mode !== 'play') paused = false;
      if (paused) dt = 0;  // frozen: nothing moves, timers hold
      var playing = mode === 'play' && !paused, mine = SHIPS.inst === handle;
      var pace = playing || mode === 'over' ? Math.min(HARD.paceMax, 1 + HARD.paceStep * (level - 1)) : 1;
      if (boss || bossWarn > 0) pace = Math.min(HARD.bossPace[2], HARD.bossPace[0] + HARD.bossPace[1] * (bossTier - 1));  // bosses go by their own tier
      var wdt = dt * pace;
      frameT += dt; if (mode !== 'demo') playT += dt;
      if (mode === 'play' && SFX.ctx) sfxWake();
      hitSoundT -= dt;

      // The ship: the player's controls in a game, its own patrol in the demo.
      var tx = 0, ty = 0;
      if (playing) {
        var k = SHIPS.keys;
        if (mine && (k.arrowleft || k.a)) tx = -1; else if (mine && (k.arrowright || k.d)) tx = 1;
        if (mine && (k.arrowup || k.w)) ty = -1; else if (mine && (k.arrowdown || k.s)) ty = 1;
        if (mine && SHIPS.pointer && !tx && !ty) {  // fly toward the finger, a little ahead of it so it stays in view
          var dx = SHIPS.pointer.x + px * 10 - S.x, dy = SHIPS.pointer.y - px * 6 - S.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > px * 2) { var f = Math.min(1, d / (px * 12)); tx = dx / d * f; ty = dy / d * f; }
        }
        S.dir = 1;
        S.vx += (tx * SPEED - S.vx) * Math.min(1, dt * (S.inv > 1.2 ? 3 : 12));
        S.vy += (ty * SPEED - S.vy) * Math.min(1, dt * (S.inv > 1.2 ? 3 : 12));
        S.x = Math.max(px * 8, Math.min(w - px * 8, S.x + S.vx * dt));  // the whole card: the right side is risky, not walled off
        if (boss && boss.state === 'fight' && S.x > boss.x - boss.W / 2 - px * 6) {  // no flying into a boss: its nose stops you, and a lunge hits
          S.x = Math.max(px * 8, boss.x - boss.W / 2 - px * 6);
          if (boss.lunge > 0) hurt(boss.x, boss.y);
        }
        S.y = Math.max(TOP, Math.min(BOTTOM, S.y + S.vy * dt));
        // Guns: they fire by themselves, with only so many bullets in the air at once.
        S.fireT -= dt;
        if (mine && S.fireT <= 0 && bullets.length < HARD.maxShots[S.power - 1]) {
          S.fireT = HARD.fireGap;
          var nose = S.x + px * 5;
          // One gun; two side by side; then those two plus a pair fanning out. Each level is the one
          // before and more, so the top one is never weaker against a boss's core.
          if (S.power === 1) bullets.push({ x: nose, y: S.y, vx: BULLET, vy: 0 });
          else { bullets.push({ x: nose, y: S.y - px * 2, vx: BULLET, vy: 0 }); bullets.push({ x: nose, y: S.y + px * 2, vx: BULLET, vy: 0 }); }
          if (S.power >= 3) { bullets.push({ x: nose, y: S.y, vx: BULLET, vy: -BULLET * HARD.spread }); bullets.push({ x: nose, y: S.y, vx: BULLET, vy: BULLET * HARD.spread }); }
          sfx('shoot');
        }
      } else if (mode === 'demo') {
        // Patrol the line above the stats, never far off it: weave a little, put on bursts of
        // speed, barrel-roll now and then. A rock or a saucer comes by every few seconds: turn to
        // face it, line up, blast it (a victory roll), then fly over and grab the coin it leaves.
        // With the cursor on the card, come over to it and do a roll.
        var hv = SHIPS.hover && mine && performance.now() - SHIPS.hover.t < 1200 ? SHIPS.hover : null, want;
        if (S.x > w - px * 12) S.dir = -1; else if (S.x < px * 12) S.dir = 1;
        want = S.dir;
        S.boost = Math.max(0, S.boost - dt); S.roll = Math.max(0, S.roll - dt); rollT -= dt;
        if (rollT <= 0) { rollT = rnd(6, 10); S.roll = ROLL; }
        if (!S.boost && Math.random() < dt * 0.15) S.boost = rnd(0.6, 1.2);
        if (hv) {
          S.dir = hv.x < S.x ? -1 : 1;
          var hd = Math.abs(hv.x - S.x);
          want = hd > px * 30 ? S.dir : 0;
          if (hd <= px * 30 && !hvSeen) { hvSeen = true; S.roll = ROLL; }
        } else hvSeen = false;
        // A target every few seconds (two about at most): a rock, a saucer, or, when the coast is
        // clear, a trio of saucers.
        demoFoeT -= dt;
        if (demoFoeT <= 0 && demoFoes.length < 2 && !hv) {
          demoFoeT = rnd(2, 3.5);
          var from = Math.random() < 0.5 ? 1 : -1, roll2 = Math.random(), n2 = roll2 < 0.3 && !demoFoes.length ? 3 : 1, saucer = roll2 < 0.65;
          for (var q = 0; q < n2; q++) demoFoes.push({ kind: saucer ? 'drone' : 'pebble', x: (from > 0 ? w + px * 6 : -px * 6) + from * q * px * 14,
            y: demoY, y0: demoY + rnd(-px * 2, px * 2), vx: -from * (saucer ? 20 : 12) * px, rot: 0, spin: rnd(-2.5, 2.5), t: q * 0.7 });
        }
        // Now and then a comet streaks along the line: hop over it.
        demoCometT -= dt;
        if (!demoComet && demoCometT <= 0) {
          var cdir = Math.random() < 0.5 ? 1 : -1;
          demoComet = { x: cdir > 0 ? -px * 10 : w + px * 10, dir: cdir, y: demoY };
        }
        var dodge = demoComet && Math.abs(demoComet.x - S.x) < px * 45 && (S.x - demoComet.x) * demoComet.dir > -px * 10;
        if (dodge && !S.roll) S.roll = ROLL;
        // Aim at the nearest target; with none about, go for the nearest coin.
        var foe = null, fd = 1e9;
        demoFoes.forEach(function (f) { var d = Math.abs(f.x - S.x); if (f.x > 0 && f.x < w && d < fd) { fd = d; foe = f; } });
        if (!foe && demoCoins.length && !hv) {
          var coin = demoCoins.reduce(function (c1, c2) { return Math.abs(c1.x - S.x) < Math.abs(c2.x - S.x) ? c1 : c2; });
          var cd = coin.x - S.x;
          S.dir = cd < 0 ? -1 : 1; want = Math.abs(cd) > px * 2 ? S.dir : 0;
        }
        if (foe && !hv) {  // face it, close in, fire
          S.dir = foe.x < S.x ? -1 : 1;
          want = fd > px * 45 ? S.dir : 0;
          if (fd < w * 0.6) {
            S.fireT -= dt;
            if (S.fireT <= 0) { S.fireT = 0.2; bullets.push({ x: S.x + S.dir * px * 5, y: S.y, vx: S.dir * BULLET * 0.7, vy: 0 }); }
          }
        }
        S.vx += (want * SPEED * (S.boost > 0 ? 0.9 : 0.45) - S.vx) * Math.min(1, dt * 4);
        S.x = Math.max(px * 8, Math.min(w - px * 8, S.x + S.vx * dt));  // chasing a coin by the edge, but never off the card
        var aimY = dodge ? demoY - px * 9 : foe ? foe.y : demoY + Math.sin(frameT * 1.3) * px * 2;  // hop a comet, line up with a target, else weave
        aimY = Math.max(demoY - px * (dodge ? 9 : 4), Math.min(demoY + px * 2, aimY));          // but stay near the line
        S.y += (aimY + Math.sin(frameT * 2) * px * 0.5 - S.y) * Math.min(1, dt * 4);  // and back down after a game
        S.vy = 0;
      }
      if (S.inv > 0) S.inv -= dt;
      if (playing && HARD.powerTime[S.power] && (S.powerT -= dt) <= 0) {  // an extra gun wears off
        S.power--; S.powerT = S.power > 1 ? HARD.powerTime[S.power] : 0;
        pop(S.x, S.y - px * 8, 'POWER DOWN', '#ff9a1f'); sfx('powerdown');
      }
      if (playing && S.shield && HARD.shieldTime && (S.shieldT -= dt) <= 0) { S.shield = false; pop(S.x, S.y - px * 8, 'SHIELD OFF', '#3ee0ff'); sfx('powerdown'); }
      if (shake > 0) shake -= dt;

      // Exhaust: a flicker of flame behind the ship.
      if (mode !== 'over' && dt > 0) for (i = 0; i < (S.boost > 0 ? 4 : 2); i++) sparks.push({ x: S.x - S.dir * px * 5.5, y: S.y + rnd(-px * 0.8, px * 0.8), vx: -S.dir * rnd(30, 70) * px / 3 + S.vx * 0.3, vy: rnd(-10, 10), life: rnd(0.1, 0.22), c: i ? '#ffd23f' : '#ff6a1f', flame: true });

      // Shots fly; the player's hit enemies (or the demo rock).
      bullets = bullets.filter(function (b) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < -px * 4 || b.x > w + px * 4 || b.y < 0 || b.y > h) return false;
        for (var df = 0; df < demoFoes.length; df++) {
          var f = demoFoes[df];
          if (Math.abs(b.x - f.x) > px * 4 || Math.abs(b.y - f.y) > px * 4) continue;
          burst(f.x, f.y, 18, WRECK[f.kind].concat(['#ffd23f']), 150 * px / 3); pop(f.x, f.y - px * 6, '+' + POINTS[f.kind], '#ffe14d');
          if (demoCoins.length < 3) demoCoins.push({ x: Math.max(px * 10, Math.min(w - px * 10, f.x)), y: demoY, t: 0 });  // a coin, within reach (three about at most)
          if (!S.roll) S.roll = ROLL;  // and a victory roll
          demoFoes.splice(df, 1); return false;
        }
        if (boss && boss.state === 'fight' && Math.abs(b.x - boss.x) < boss.W / 2 + px && Math.abs(b.y - boss.y) < boss.H / 2 + px && bossHit(b.x, b.y)) return false;
        for (var j = 0; j < enemies.length; j++) {
          var e = enemies[j];
          if (e.kind === 'dart' || e.x > w - px * 2 || Math.abs(b.x - e.x) > e.r + px * 1.5 || Math.abs(b.y - e.y) > e.r + px * 1.5) continue;
          e.hp--; e.flash = 0.08;
          if (e.hp <= 0) { enemies.splice(j, 1); kill(e); }
          else if (hitSoundT <= 0) { hitSoundT = 0.06; sfx('hit'); }
          return false;
        }
        return true;
      });
      if (mode !== 'demo') { demoFoes = []; demoCoins = []; demoComet = null; }
      demoFoes = demoFoes.filter(function (f) {
        f.t += dt; f.x += f.vx * dt; f.rot += f.spin * dt;
        if (f.kind === 'drone') f.y = f.y0 + Math.sin(f.t * 3) * px * 2;
        return f.vx < 0 ? f.x > -px * 10 - px * 30 : f.x < w + px * 10 + px * 30;  // (a trio starts further out)
      });
      demoCoins = demoCoins.filter(function (c) {
        c.t += dt;
        if (c.t > 6) return false;
        if (Math.abs(S.x - c.x) < px * 5 && Math.abs(S.y - c.y) < px * 6) {
          pop(c.x, c.y - px * 6, LOOT.coin.label, LOOT.coin.c); burst(c.x, c.y, 10, ['#ffc928', '#ffffff'], 110 * px / 3);
          return false;
        }
        return true;
      });
      if (demoComet) {
        demoComet.x += demoComet.dir * 70 * px * dt;
        if (Math.random() < 0.6) sparks.push({ x: demoComet.x - demoComet.dir * px * 4, y: demoComet.y + rnd(-px, px), vx: -demoComet.dir * 30, vy: rnd(-20, 20), life: 0.35, c: Math.random() < 0.5 ? '#ff3b6b' : '#ffb03b' });
        if (demoComet.x < -px * 12 || demoComet.x > w + px * 12) { demoComet = null; demoCometT = rnd(12, 20); }
      }

      if (playing) {
        spawnT -= wdt;
        if (spawnT <= 0) {
          var room = 0.4 + 0.6 * Math.min(1, w / 700);  // 1 on a wide card, less on a narrow one
          var spawned = !boss && !bossWarn && enemies.length < Math.round(HARD.maxEnemies * room);
          if (spawned) spawn();
          spawnT = Math.max(HARD.spawnMin, rnd(HARD.spawnGap[0], HARD.spawnGap[1]) - ramp() * HARD.spawnFaster) / room;
          if (spawned && spawns % HARD.calmEvery === 0) spawnT += HARD.calmFor;  // a quiet stretch after each group
        }
        enemies = enemies.filter(function (e) {
          e.t += wdt; if (e.flash > 0) e.flash -= dt;
          if (e.kind === 'dart') {
            if (e.warn > 0) { e.warn -= dt; return true; }  // the "!" shows first
            e.x += e.vx * wdt;
            if (wdt > 0 && Math.random() < 0.6) sparks.push({ x: e.x + px * 4, y: e.y + rnd(-px, px), vx: 30, vy: rnd(-20, 20), life: 0.35, c: Math.random() < 0.5 ? '#ff3b6b' : '#ffb03b' });
          } else if (e.kind === 'drone') {
            e.x += e.vx * wdt; e.y = e.y0 + Math.sin(e.t * 2.5 + e.ph) * e.amp;
            if (level >= HARD.dronesShootFrom && e.x < w * 0.9 && e.x > S.x + px * 20 && Math.random() < wdt * HARD.droneShots) {  // saucers shoot back
              shots.push({ x: e.x - px * 4, y: e.y, vx: -40 * px, vy: (S.y - e.y) * 0.3 }); sfx('zap');
            }
          } else if (e.kind === 'gun') {
            if (e.x > e.hold || e.t > e.life) e.x += e.vx * wdt;  // fly in, hold and fire, then leave
            e.y += e.vy * wdt; if (e.y < TOP + px * 4 || e.y > BOTTOM - px * 4) e.vy = -e.vy;
            e.fireT -= wdt;
            if (e.fireT <= 0 && e.x < w - px * 4) {
              e.fireT = Math.max(HARD.gunFire[2], HARD.gunFire[0] - ramp() * HARD.gunFire[1]);
              var ax = S.x - e.x, ay = S.y - e.y, ad = Math.sqrt(ax * ax + ay * ay) || 1;
              shots.push({ x: e.x - px * 5, y: e.y, vx: ax / ad * HARD.gunShot * px, vy: ay / ad * HARD.gunShot * px }); sfx('zap');
            }
          } else {  // rocks drift and tumble, bouncing off the top and bottom
            e.x += e.vx * wdt; e.y += e.vy * wdt; e.rot += e.spin * wdt;
            if ((e.y < TOP && e.vy < 0) || (e.y > BOTTOM && e.vy > 0)) e.vy = -e.vy;
          }
          if (Math.abs(S.x - e.x) < e.r + px * 3.5 && Math.abs(S.y - e.y) < e.r + px * 2.5 && S.inv <= 0) {  // rammed
            hurt(e.x, e.y);
            if (mode !== 'play') return false;
            if (e.kind !== 'rock' && e.kind !== 'gun') { burst(e.x, e.y, 12, WRECK[e.kind], 120 * px / 3); return false; }
          }
          return e.x > -px * 20;
        });
        shots = shots.filter(function (s) {
          s.x += s.vx * wdt;
          if (s.amp) { s.t += wdt; s.by += s.vy * wdt; s.y = s.by + Math.sin(s.t * s.f + s.ph) * s.amp; }  // a weaving shot
          else s.y += s.vy * wdt;
          if (Math.abs(s.x - S.x) < px * 3.5 && Math.abs(s.y - S.y) < px * 2.5) { hurt(s.x, s.y); return false; }
          return s.x > -px * 4 && s.x < w + px * 4 && s.y > -px * 4 && s.y < h + px * 4;
        });
        if (mode === 'play') bossUpdate(wdt, dt);
        if (mode === 'over') { enemies = []; shots = []; boss = null; }  // the ship blew up during the updates above
        // Loot drifts back; it's pulled in when the ship comes close.
        loot = loot.filter(function (l) {
          l.t += dt; l.x -= 12 * px * wdt;
          var lx = S.x - l.x, ly = S.y - l.y, ld = Math.sqrt(lx * lx + ly * ly);
          if (ld < px * HARD.magnet) { l.x += lx / ld * 60 * px * dt; l.y += ly / ld * 60 * px * dt; }
          if (ld < px * 6) {
            var sp = LOOT[l.kind];
            if (l.kind === 'heart') S.hearts = Math.min(HARD.maxHearts, S.hearts + 1);
            if (l.kind === 'power') { S.power = Math.min(3, S.power + 1); S.powerT = HARD.powerTime[S.power]; }
            if (l.kind === 'shield') { S.shield = true; S.shieldT = HARD.shieldTime; }
            pop(l.x, l.y - px * 8, l.kind === 'power' && S.power === 3 ? 'MAX POWER' : sp.label, sp.c);
            burst(l.x, l.y, 10, [sp.pal[Object.keys(sp.pal)[0]], '#ffffff'], 110 * px / 3);
            sfx(l.kind); gain(sp.pts); tally[l.kind + 's']++;
            return false;
          }
          return l.x > -px * 10;
        });
      }
      if (mode === 'over') { overT += dt; if (overT > 10) quit(); }

      // Backdrop canvas: the sector (in a game), loot, enemies, shots and the ship, shaken on a hit.
      back.save();
      if (shake > 0 && !CALM) back.translate(Math.round(rnd(-1, 1) * px * shake * 4), Math.round(rnd(-1, 1) * px * shake * 4));
      if (mode !== 'demo') drawBackdrop(back, dark, clamp(playT * 3), dt);
      loot.forEach(function (l) {
        var sx = l.kind === 'coin' ? Math.cos(l.t * 5) : 1;
        sprite(back, LOOT[l.kind], l.x, l.y + Math.sin(l.t * 3) * px * 0.6, Math.abs(sx) < 0.15 ? 0.15 : sx, 1);
      });
      enemies.forEach(function (e) {
        if (e.kind === 'dart' && e.warn > 0) {
          back.fillStyle = 'rgba(255,75,100,.16)'; back.fillRect(0, e.y - px * 3, w, px * 6);
          if (Math.floor(e.warn * 8) % 2) pixelText(back, '!', w - px * 4, e.y, px * 1.4, '#ff3b3b', '#15151a', 1, 'right');
          return;
        }
        if (e.flash > 0) { back.save(); back.globalAlpha = 0.5; }
        if (e.kind === 'drone') sprite(back, DRONE[Math.floor(frameT * 6) % 2], e.x, e.y);
        else if (e.kind === 'rock') sprite(back, ROCK, e.x, e.y, 1, 1, e.rot);
        else if (e.kind === 'pebble') sprite(back, PEBBLE, e.x, e.y, 1, 1, e.rot);
        else if (e.kind === 'gun') sprite(back, GUNSHIP, e.x, e.y);
        else if (e.kind === 'dart') sprite(back, DART, e.x, e.y, -1, 1);
        if (e.flash > 0) back.restore();
      });
      if (boss) {
        var bk = boss.kind, bc = px, sl = boss.segN * px;
        if (bk.tail) for (var sg = 4; sg >= 1; sg--) {  // the Leviathan's tail, behind it, waving
          var ss = 1 - sg * 0.12;
          sprite(back, boss.seg, boss.x + boss.W / 2 - sl * 0.3 + sg * sl * 0.6, boss.y + Math.sin(frameT * 3 - sg * 0.8) * sl * sg * 0.15, ss, ss);
        }
        sprite(back, boss.flash > 0 && !CALM ? boss.white : boss.sp, boss.x, boss.y);
        boss.turrets.forEach(function (tu) {
          var tp = bossAt(boss, tu.cx, tu.cy);
          sprite(back, tu.hp <= 0 ? boss.wreck : tu.flash > 0 && !CALM ? boss.turretWhite : boss.turretSp, tp.x, tp.y);
        });
        // The core: it throbs (faster when angry) and flashes white while charging, behind a hatch that slides open.
        var core = boss.core, c0 = bossAt(boss, core.x, core.y), cw = Math.round(core.w * bc), chh = Math.round(core.h * bc);
        var glow = 0.35 + 0.25 * Math.sin(frameT * (boss.hp < boss.maxHp / 2 ? 14 : 7));
        back.fillStyle = boss.charge > 0 ? 'rgba(255,255,255,' + (CALM ? 0.8 : 0.55 + 0.4 * Math.sin(frameT * 40)) + ')' : 'rgba(' + bk.glow + ',' + glow + ')';
        back.fillRect(Math.round(c0.x), Math.round(c0.y), cw, chh);
        var shut = Math.round((1 - boss.open) * chh / 2);
        if (shut > 0) {
          back.fillStyle = bk.pal.K; back.fillRect(Math.round(c0.x), Math.round(c0.y), cw, shut); back.fillRect(Math.round(c0.x), Math.round(c0.y) + chh - shut, cw, shut);
          back.fillStyle = bk.pal.R; back.fillRect(Math.round(c0.x), Math.round(c0.y) + shut - 1, cw, 1); back.fillRect(Math.round(c0.x), Math.round(c0.y) + chh - shut, cw, 1);
        }
        var bcp = coreAt(boss), bhalf = boss.core.h * px / 2 + px * 2;
        if (boss.beamC > 0 && (CALM || Math.floor(frameT * 12) % 2)) { back.fillStyle = 'rgba(' + bk.glow + ',.7)'; back.fillRect(0, Math.round(bcp.y), Math.round(bcp.x), px); }  // the row it will fire down
        if (boss.beamT > 0) {  // the beam: a glow around a white-hot middle, along the core's row
          var bk2 = boss.beamT / BEAM_TIME;
          back.save(); back.globalAlpha = Math.min(1, bk2 * 2.5);
          back.fillStyle = 'rgba(' + bk.glow + ',.55)'; back.fillRect(0, Math.round(bcp.y - bhalf), Math.round(bcp.x), Math.round(bhalf * 2));
          back.fillStyle = '#ffffff'; back.fillRect(0, Math.round(bcp.y - bhalf * 0.4), Math.round(bcp.x), Math.round(bhalf * 0.8));
          back.restore();
        }
        var zx = boss.x - boss.W / 2, zw = w * ZAP_ZONE;
        if (boss.zapC > 0) { back.fillStyle = 'rgba(' + bk.glow + ',' + (CALM ? 0.12 : 0.08 + 0.06 * Math.sin(frameT * 30)) + ')'; back.fillRect(zx - zw, TOP, zw, BOTTOM - TOP); }  // where it will hit
        if (boss.zapT > 0) {  // the lash: one zone, each kind its own look
          var zk = boss.zapT / ZAP_TIME, zc = coreAt(boss);
          back.save(); back.strokeStyle = 'rgb(' + bk.glow + ')'; back.lineWidth = px;
          if (bk.zap === 'roar') {  // rings rolling out of its mouth
            for (var zr = 0; zr < 3; zr++) { back.globalAlpha = zk; back.beginPath(); back.arc(zc.x, zc.y, (1 - zk + zr * 0.25) * zw, Math.PI * 0.6, Math.PI * 1.4); back.stroke(); }
          } else for (var zb = 0; zb < 5; zb++) {  // lightning: jagged bolts; flame: thick, straighter jets
            var flame = bk.zap === 'flame', zy = TOP + (zb + 0.5) / 5 * (BOTTOM - TOP), zxp = zx;
            back.strokeStyle = flame ? (zb % 2 ? '#ff9a1f' : '#ffd23f') : zb % 2 ? '#ffffff' : 'rgb(' + bk.glow + ')'; back.lineWidth = flame ? px * 3 : px;
            back.beginPath(); back.moveTo(zx, zy);
            while (zxp > zx - zw) { zxp -= zw / 6; zy += rnd(-1, 1) * px * (flame ? 1.5 : 6); back.lineTo(zxp, zy); }
            back.stroke();
          }
          back.restore();
        }
      }
      demoFoes.forEach(function (f) {
        if (f.kind === 'drone') sprite(back, DRONE[Math.floor(frameT * 6) % 2], f.x, f.y);
        else sprite(back, PEBBLE, f.x, f.y, 1, 1, f.rot);
      });
      demoCoins.forEach(function (c) {
        var dcs = Math.cos(c.t * 5);
        sprite(back, LOOT.coin, c.x, c.y + Math.sin(c.t * 3) * px * 0.6, Math.abs(dcs) < 0.15 ? 0.15 : dcs, 1);
      });
      if (demoComet) sprite(back, DART, demoComet.x, demoComet.y, demoComet.dir > 0 ? 1 : -1, 1);
      shots.forEach(function (s) {  // enemy shots: pink with a dark outline, nothing like your bullets or the coins
        back.fillStyle = '#15151a'; back.fillRect(Math.round(s.x - px * 1.5), Math.round(s.y - px * 1.5), px * 3, px * 3);
        back.fillStyle = Math.floor(frameT * 10) % 2 && !CALM ? '#ff9ec8' : '#ff2d7a';
        back.fillRect(Math.round(s.x - px), Math.round(s.y - px), px * 2, px * 2);
      });
      bullets.forEach(function (b) {
        back.fillStyle = '#ffe14d'; back.fillRect(Math.round(b.x - px * 2), Math.round(b.y - px * 0.5), px * 3, px);
        back.fillStyle = '#ffffff'; back.fillRect(Math.round(b.x + (b.vx > 0 ? px : -px * 2)), Math.round(b.y - px * 0.5), px, px);
      });
      if (mode !== 'over' && !(S.inv > 0 && Math.floor(S.inv * 10) % 2)) {  // blinks while hurt
        var tilt = playing ? Math.max(-0.25, Math.min(0.25, S.vy / SPEED * 0.25)) : 0;
        var rollY = S.roll > 0 ? Math.cos((1 - S.roll / ROLL) * TAU) : 1;  // a barrel roll squashes it flat, over and back
        sprite(back, SHIP, S.x, S.y, S.dir, Math.abs(rollY) < 0.15 ? 0.15 * (rollY < 0 ? -1 : 1) : rollY, tilt * S.dir);
        if (S.shield && mode === 'play' && !(HARD.shieldTime && S.shieldT < 2 && Math.floor(frameT * 8) % 2)) {  // a bubble of pixels around the ship; blinks before it wears off
          back.save(); back.globalAlpha = 0.55 + (CALM ? 0 : 0.25 * Math.sin(frameT * 6)); back.fillStyle = '#3ee0ff';
          for (var sa = 0; sa < 20; sa++) back.fillRect(snap(S.x + Math.cos(sa / 20 * TAU) * px * 8), snap(S.y + Math.sin(sa / 20 * TAU) * px * 6), px, px);
          back.restore();
        }
      }
      back.restore();

      // Front: sparks, pop-ups, HUD, banners.
      sparks = sparks.filter(function (s) { return (s.life -= dt) > 0; });
      sparks.forEach(function (s) {
        if (!s.flame) s.vy += 60 * px * dt * 0.2;
        s.x += s.vx * dt; s.y += s.vy * dt;
        front.globalAlpha = clamp(s.life * (s.flame ? 6 : 2)); front.fillStyle = s.c; front.fillRect(Math.round(s.x), Math.round(s.y), px, px);
      });
      front.globalAlpha = 1;
      pops = pops.filter(function (p) { return (p.life -= dt) > 0; });
      pops.forEach(function (p) { pixelText(front, p.label, p.x, p.y - (1 - p.life) * px * 10, px * 0.8, p.c, '#15151a', clamp(p.life * 2)); });
      var barW = Math.min(150, w * 0.3), bx0 = px * 14, by0 = h - px * 5;
      if (mode !== 'demo') {
        back.fillStyle = dark ? 'rgba(10,10,20,.75)' : 'rgba(20,20,40,.7)'; back.fillRect(bx0 - px, by0 - px, barW + px * 2, px * 4);
        var fill = back.createLinearGradient(bx0, 0, bx0 + barW, 0); fill.addColorStop(0, '#3ee0ff'); fill.addColorStop(1, '#ffe14d');
        back.fillStyle = fill; back.fillRect(bx0, by0, barW * clamp(xp / xpNeed()), px * 2);
        pixelText(back, 'LV' + level, bx0 - px * 7, by0 + px, px * 0.75, '#ffffff', '#15151a');
      }
      if (mode === 'play') {
        front.fillStyle = 'rgba(10,10,20,.35)'; front.fillRect(px, px, px * Math.max(24, 6 * S.hearts + 8), px * 14);  // behind hearts and guns
        for (i = 0; i < S.hearts; i++) sprite(front, LOOT.heart, px * 6 + i * px * 6, px * 6, 0.7, 0.7);
        if (S.shield) sprite(front, LOOT.shield, px * 6 + S.hearts * px * 6, px * 6, 0.7, 0.7);
        pixelText(front, 'GUNS', px * 3, px * 12, px * 0.5, '#ffffff', '#15151a', 1, 'left');
        for (i = 0; i < 3; i++) { front.fillStyle = i < S.power ? '#6ee05a' : 'rgba(255,255,255,.25)'; front.fillRect(px * 15 + i * px * 3, px * 11, px * 2, px * 2); }
        if (HARD.powerTime[S.power]) {  // what's left of the extra gun; blinks when nearly gone
          var left = clamp(S.powerT / HARD.powerTime[S.power]), low = left < 0.25;
          front.fillStyle = 'rgba(10,10,20,.55)'; front.fillRect(px * 3, px * 15, px * 21, px);
          if (!(low && Math.floor(frameT * 6) % 2)) { front.fillStyle = low ? '#ff9a1f' : '#6ee05a'; front.fillRect(px * 3, px * 15, px * 21 * left, px); }
        }
        pixelText(front, 'SCORE ' + score, w - px * 4, px * 6, px * 0.65, '#ffffff', '#15151a', 1, 'right');
        if (savedBest() != null && savedBest() > hi) hi = savedBest();
        if (!boss) pixelText(front, 'HI ' + Math.max(hi, score), w / 2, px * 6, px * 0.55, '#ffe14d', '#15151a');
        var pb = pauseBox();  // the pause button, faint so it stays out of the way: two bars
        front.save(); front.globalAlpha = 0.6;
        front.fillStyle = 'rgba(10,10,20,.55)'; front.fillRect(pb.x0, pb.y0, pb.x1 - pb.x0, pb.y1 - pb.y0);
        front.fillStyle = '#ffffff'; front.fillRect(pb.x0 + px * 3, pb.y0 + px * 1.5, px * 1.5, px * 6); front.fillRect(pb.x1 - px * 4.5, pb.y0 + px * 1.5, px * 1.5, px * 6);
        front.restore();
      } else if (mode === 'demo' && playable && scene.prompt !== false && phase !== 'intro' && Math.floor(frameT * 1.6) % 2) {
        pixelText(front, 'P / TAP TO PLAY', w - px * 4, by0 + px, px * 0.6, '#ffe14d', '#15151a', 0.9, 'right');
      }
      if (levelT > 0) {
        levelT -= dt;
        var lk = 1.6 - levelT, lp = lk < 0.2 ? lk / 0.2 * 1.25 : lk < 0.35 ? 1.25 - (lk - 0.2) / 0.15 * 0.25 : 1;
        pixelText(front, stageIndex() !== stageIndex(level - 1) ? stage().name : 'LEVEL ' + level, w / 2, h * 0.3, px * 1.4 * lp, CALM ? '#ffe14d' : RAINBOW[Math.floor(T * 12) % RAINBOW.length], '#15151a', clamp(levelT * 2.5));
      }
      if (playing && playT < 5) {
        pixelText(front, w < 420 ? 'ARROWS / WASD OR DRAG TO FLY' : 'FLY ARROWS / WASD   OR HOLD AND DRAG   P PAUSE   M MUTE   ESC EXIT', w / 2, h - px * 1.5, px * 0.45, '#ffffff', '#15151a', Math.min(1, 5 - playT));
      }
      if (boss && boss.state !== 'enter') {  // the boss's health, top centre
        var hbw = Math.min(w * 0.36, px * 80), hbx = w / 2 - hbw / 2, hby = px * 5;
        front.fillStyle = 'rgba(10,10,20,.7)'; front.fillRect(hbx - px, hby - px, hbw + px * 2, px * 4);
        front.fillStyle = boss.hp < boss.maxHp / 2 ? '#ff3b5c' : '#ff9a1f'; front.fillRect(hbx, hby, hbw * clamp(boss.hp / boss.maxHp), px * 2);
        pixelText(front, boss.kind.name, w / 2, hby + px * 6, px * 0.5, '#ffffff', '#15151a');
      }
      if (bossWarn > 0) {
        var wa = CALM || Math.floor(bossWarn * 4) % 2 ? 1 : 0.35;
        front.fillStyle = 'rgba(255,40,60,' + (0.12 * wa) + ')'; front.fillRect(0, 0, w, h);
        pixelText(front, 'WARNING', w / 2, h * 0.52, px * 1.6, '#ff3b3b', '#15151a', wa);
        pixelText(front, bossKind(bossTier).name + ' APPROACHING', w / 2, h * 0.66, px * 0.6, '#ffffff', '#15151a', wa);
      }
      if (bossBannerT > 0) {
        bossBannerT -= dt;
        pixelText(front, bossKind(bossTier).name + ' DOWN!', w / 2, h * 0.42, px * 1.2, CALM ? '#ffe14d' : RAINBOW[Math.floor(T * 12) % RAINBOW.length], '#15151a', clamp(bossBannerT * 2));
      }
      if (paused) {
        front.fillStyle = 'rgba(12,10,28,.6)'; front.fillRect(0, 0, w, h);
        pixelText(front, 'PAUSED', w / 2, h * 0.42, px * 1.5, '#ffffff', '#15151a');
        pixelText(front, 'P / TAP TO CONTINUE   ESC TO QUIT', w / 2, h * 0.6, px * 0.6, '#ffe14d', '#15151a');
        var mb = muteBox();  // sound, on the PAUSED screen: tap it (or press M)
        front.fillStyle = 'rgba(10,10,20,.7)'; front.fillRect(mb.x0, mb.y0, mb.x1 - mb.x0, mb.y1 - mb.y0);
        sprite(front, SFX.muted ? SPEAKER_OFF : SPEAKER_ON, mb.x0 + px * 7, (mb.y0 + mb.y1) / 2);
        pixelText(front, (SFX.muted ? 'SOUND OFF' : 'SOUND ON') + '  (M)', mb.x0 + px * 13, (mb.y0 + mb.y1) / 2, px * 0.55, '#ffffff', '#15151a', 1, 'left');
      }
      if (goT > 0) { goT -= dt; pixelText(front, 'LAUNCH!', w / 2, h * 0.4, px * 1.6, '#3ee0ff', '#15151a', clamp(goT * 2)); }
      if (mode === 'over') {
        front.fillStyle = 'rgba(12,10,28,' + (0.6 * clamp(overT * 3)) + ')'; front.fillRect(0, 0, w, h);
        var oa = clamp(overT * 3);
        pixelText(front, 'GAME OVER', w / 2, h * 0.2, px * 1.5, '#ff3b5c', '#15151a', oa);
        pixelText(front, 'SCORE ' + score + (newBest ? '   NEW BEST!' : '   BEST ' + Math.max(hi, score)), w / 2, h * 0.36, px * 0.8, newBest ? '#6ee05a' : '#ffffff', '#15151a', oa);
        pixelText(front, 'DESTROYED ' + stats.kills + '   BOSSES ' + stats.bosses + '   REACHED ' + STAGES[stats.sector].name, w / 2, h * 0.52, px * 0.55, '#ffffff', '#15151a', oa);
        var line = session && session.line();  // the site's word on the save: SAVING..., a rank, NEW BEST
        if (line) pixelText(front, line, w / 2, h * 0.64, px * 0.6, session.good() ? '#6ee05a' : '#ffe14d', '#15151a', oa);
        if (overT > 1.2 && Math.floor(overT * 1.6) % 2) pixelText(front, 'P / TAP TO RETRY', w / 2, h * 0.78, px * 0.7, '#ffe14d', '#15151a');
      }
      // Intro: dark pixel blocks break away behind STARSHIPS ... LAUNCH!
      if (phase === 'intro' && !resumed && mode === 'demo') {
        front.fillStyle = '#0b1030';
        intro.forEach(function (b) { if (t < b[2]) front.fillRect(b[0], b[1], cs + 0.5, cs + 0.5); });
        if (t < 0.85) pixelText(front, 'STARSHIPS', w / 2, h / 2, px * 1.3, Math.floor(t * 8) % 2 ? '#3ee0ff' : '#ffffff', '#4f7cff');
        else pixelText(front, 'LAUNCH!', w / 2, h / 2, px * 1.6 * (1 + 0.3 * clamp(1 - (t - 0.85) / 0.2)), '#3ee0ff', '#15151a', clamp((1.6 - t) * 3));
      }
    } };
  }

  FX.registerEffect('starships', starships);
})();

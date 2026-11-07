/* Player One: a playable pixel-art platformer profile effect. Load it after the effect runner
   (cosmetics_effects.js, or runtime.js in the open playground): it registers itself with
   MDBCosmetics.registerEffect. It never talks to a server: a site that keeps scores plugs in
   MDBCosmetics.arcadeScores (see beginScoring below; on mdblist.com that's arcade_scores.js). */
(function () {
  'use strict';
  var FX = window.MDBCosmetics;
  if (!FX || !FX.registerEffect) return;
  var TAU = Math.PI * 2;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v) { return Math.max(0, Math.min(1, v)); }
  function seeded(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function isDark() { return document.documentElement.classList.contains('dark'); }

  // Player One's controls: one set of page listeners for the whole page, bound on first use.
  // Input goes to the game that drew most recently (the live card, not a picker still) and
  // only when it's playable (drawn on a single canvas, so not under a list header's content).
  var ARCADE = { inst: null, keys: {}, pointer: null, bound: false };
  function arcadeLive() { var g = ARCADE.inst; return g && performance.now() - g.seen < 300 ? g : null; }
  function arcadeBind() {
    if (ARCADE.bound) return;
    ARCADE.bound = true;
    function typing(e) { var el = e.target; return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); }
    function inside(g, e) {
      var r = g.canvas.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }
    document.addEventListener('keydown', function (e) {
      var g = arcadeLive(), k = e.key;
      if (!g || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (g.mode() !== 'play') { if (k === 'p' || k === 'P') { e.preventDefault(); g.start(); } return; }
      if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown| |a|d|w|A|D|W|Escape)$/.test(k)) e.preventDefault();  // no page scrolling mid-game
      if (k === 'Escape') { g.quit(); return; }
      ARCADE.keys[k.toLowerCase()] = true;
      if (!e.repeat && (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W')) g.jump();
    });
    document.addEventListener('keyup', function (e) {
      ARCADE.keys[e.key.toLowerCase()] = false;
      var g = arcadeLive();
      if (g && /^( |ArrowUp|w|W)$/.test(e.key)) g.releaseJump();
    });
    window.addEventListener('blur', function () { ARCADE.keys = {}; ARCADE.pointer = null; });
    document.addEventListener('pointerdown', function (e) {
      var g = arcadeLive();
      if (!g || !inside(g, e)) return;
      if (e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,label,[role=button],[contenteditable]')) return;  // real controls still work
      if (g.mode() !== 'play') { g.start(); return; }
      ARCADE.pointer = e.clientX - g.canvas.getBoundingClientRect().left; g.jump();
    });
    document.addEventListener('pointermove', function (e) {
      var g = arcadeLive();
      if (!g) return;
      var r = g.canvas.getBoundingClientRect();
      if (ARCADE.pointer != null) ARCADE.pointer = e.clientX - r.left;
      if (inside(g, e)) ARCADE.hover = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };  // the demo buddy watches it
    });
    ['pointerup', 'pointercancel'].forEach(function (t) { document.addEventListener(t, function () { ARCADE.pointer = null; }); });
  }

  // Player One: a little pixel-art platformer on the card. Dark pixel blocks break apart behind
  // "PLAYER 1 ... GO!", then a blob buddy hops about on its own (the demo) while loot drops from
  // the sky: spinning coins, gems, hearts. Press P or tap the card to play (see arcadeBind): the
  // card's own content hides (cos-fx-playing) behind a pixel world (night sky or day sky,
  // mountains and hills with a little parallax, grass and dirt). Run and jump, grab loot for
  // score and XP, dodge spike traps, stomp purple beetles and fire wisps (from level 3; from
  // level 5 only fliers, swooping at all heights), and from level 4 watch for the rare comet,
  // flagged by a "!" at the edge just before it shoots across. Every level speeds the whole
  // game up. Three hearts; GAME OVER shows the score and the browser's high score. Chunky pixel
  // grid that scales with the card. Layered (list header): world behind, text in front, and
  // not playable there.
  function arcade(w, h, scene, resumed) {
    scene = scene || {};
    var px = Math.max(2, Math.round(Math.min(h, 300) / 75)), i, n;
    // The game's floor sits near the card's bottom. The demo can have its own (scene.ground): on the
    // profile that's the top of the stats row, so the buddy walks on it instead of over the numbers.
    var playGround = h - px * 9, demoGround = scene.ground != null ? Math.min(scene.ground, playGround) : playGround;
    var ground = demoGround;
    var G = 140 * px, RUN = 26 * px, JUMP = Math.sqrt(2 * G * px * 19);
    var BEETLE_RISE = px * 16, BEETLE_JUMP = Math.sqrt(2 * G * BEETLE_RISE);  // beetles reach the low platforms
    var SPRITES = {
      coin: { rows: ['.####.', '#yyyy#', '#yWyy#', '#yWyy#', '#yyyy#', '.####.'], pal: { '#': '#9a6400', y: '#ffc928', W: '#fff6b0' }, xp: 12, score: 10, label: '+10', c: '#ffe14d' },
      gem: { rows: ['..c..', '.cWc.', 'cccCc', '.cCc.', '..c..'], pal: { c: '#3ee0ff', C: '#1a7fd6', W: '#ffffff' }, xp: 30, score: 25, label: '+25', c: '#3ee0ff' },
      heart: { rows: ['.hh.hh.', 'hWhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'], pal: { h: '#ff3b5c', W: '#ffd0da' }, xp: 18, score: 15, label: '1UP', c: '#ff6b85' }
    };
    var BLOB_SLEEP = { rows: ['..gggg..', '.gggggg.', 'gggggggg', 'gkkggkkg', 'gggggggg', 'gggggggg', '.GGGGGG.'], pal: { g: '#6ee05a', G: '#3a9a32', k: '#15151a' } };
    var BLOB = { rows: ['..gggg..', '.gggggg.', 'gWkggWkg', 'gWkggWkg', 'gggggggg', 'gggggggg', '.GGGGGG.'], pal: { g: '#6ee05a', G: '#3a9a32', W: '#ffffff', k: '#15151a' } };
    var BEETLE = [
      { rows: ['..pppp..', '.pppppp.', 'pWkppWkp', 'pppppppp', 'pPPPPPPp', '.P.PP.P.'], pal: { p: '#a04cff', P: '#5e1fa8', W: '#ffffff', k: '#15151a' } },
      { rows: ['..pppp..', '.pppppp.', 'pWkppWkp', 'pppppppp', 'pPPPPPPp', 'P.P..P.P'], pal: { p: '#a04cff', P: '#5e1fa8', W: '#ffffff', k: '#15151a' } }
    ];
    var WISP = [
      { rows: ['..o..', '.oyo.', 'oyWyo', 'oyyyo', '.ooo.'], pal: { o: '#ff6a1f', y: '#ffd23f', W: '#ffffff' } },
      { rows: ['.o.o.', '.oyo.', 'oyWyo', 'oyyyo', '.ooo.'], pal: { o: '#ff6a1f', y: '#ffd23f', W: '#ffffff' } }
    ];
    // Spikes: two chunky stone spikes side by side, stepping in to their points, lit on the
    // left and dark on the right, with red-hot embers on the tips and along the edges.
    var SPIKE = { rows: ['..r....r..', '..L....Lr.', '.rLD..LMD.', '.LMD.rLMD.', 'rLMDr.LMMr', '.LMMDLLMMD', 'LLMMDLMMMD', 'LMMMDLMMMD', 'DDDDDDDDDD'],
      pal: { r: '#e0442a', L: '#8e939c', M: '#6b707a', D: '#3e424a' } };
    // Meteor: a craggy rock (its fire trail is sparks).
    var METEOR = { rows: ['..rrr.', '.rRRrr', 'rRrrRr', 'rrRrrr', '.rrrR.', '..rr..'], pal: { r: '#7a4a2a', R: '#b8743f' } };
    // Comet: a rare fast streak (head on the right; flipped when it flies left).
    var COMET = { rows: ['....ooyW.', '.ooooyyWW', 'oooyyyWWW', '.ooooyyWW', '....ooyW.'], pal: { o: '#ff3b6b', y: '#ffb03b', W: '#ffffff' } };
    var RAINBOW = ['#ff3b5c', '#ff9a1f', '#ffe14d', '#6ee05a', '#3ee0ff', '#7a5cff', '#ff5cd6'];
    var P = { x: w * 0.3, y: ground, vx: 0, vy: 0, onGround: true, dir: 1, inv: 0, hearts: 3, jumpBuf: 0, coyote: 0, squash: 0, chain: 0 };
    var mode = 'demo', loot = [], sparks = [], pops = [], enemies = [], spikes = [], xp = 0, level = 1, levelT = 0, XP_PER_LEVEL = 100;
    var plats = [], meteors = [], craters = [], lava = [], meteorT = 0, platT = 0;
    // The demo plays on the page itself: the card's real buttons, labels, badges and avatar
    // (measured about once a second) are one-way ledges the buddy hops onto and bonks from below.
    var pageSurf = [], measureT = 0, bonkT = rnd(3, 6), bumps = [];
    // Demo personality: watches the cursor, naps on a ledge, stomps the odd passing beetle.
    var sleepT = rnd(18, 30), hopT = 0, critter = null, critterT = rnd(20, 35);
    var LEDGES = 'button, .ui.button, a.button, [role=button], .ui.label, [class*="badge"], [class*="trophy"], [class*="avatar"], .cos-framed';
    function measurePage(hostEl, canvasEl) {
      if (!hostEl || !hostEl.querySelectorAll || !canvasEl || !canvasEl.getBoundingClientRect) return;
      var hr = canvasEl.getBoundingClientRect(), out = [];
      hostEl.querySelectorAll(LEDGES).forEach(function (el) {
        if (el === canvasEl) return;
        var r = el.getBoundingClientRect();
        if (r.width < 14 || r.height < 10 || r.width > hr.width * 0.6 || r.height > hr.height * 0.5) return;  // skip specks and big blocks
        var top = Math.round(r.top - hr.top);
        if (top < px * 9 || top > ground - px * 4) return;  // needs headroom above it, and to stand off the floor
        var sf = { x0: r.left - hr.left, x1: r.right - hr.left, y: top, bottom: Math.round(r.bottom - hr.top) };
        if (!out.some(function (o) { return Math.abs(o.x0 - sf.x0) < 3 && Math.abs(o.y - sf.y) < 3; })) out.push(sf);  // nested duplicates
      });
      pageSurf = out;
      // Anything left resting on a ledge that moved or went away falls again.
      loot.forEach(function (l) {
        if (l.landed && l.y < ground - 1 && !pageSurf.concat(plats).some(function (sf) { return Math.abs(sf.y - l.y) < 2 && l.x > sf.x0 && l.x < sf.x1; })) { l.landed = false; l.bounced = true; l.vy = 0; }
      });
    }
    function surfaces() { return mode === 'demo' ? pageSurf : plats; }
    var score = 0, hi = 0, overT = 0, goT = 0, enemyT = 2, frameT = 0, playT = 0, host = null;
    // The game world behind a game, built once per theme: sky, far mountains, near hills.
    var world = null;
    var STAGES = [
      { name: 'MEADOW', sky: ['#5fb6ff', '#cdeeff'], night: ['#120e2e', '#3a2a6a'], far: '#8fb0d8', near: '#4fae55', grass: '#7ee05a' },
      { name: 'TWILIGHT RUINS', sky: ['#322650', '#ce8a99'], night: ['#19152f', '#694268'], far: '#66517c', near: '#434963', grass: '#a6c0a0' },
      { name: 'VOLCANIC SKY', sky: ['#341c37', '#d47554'], night: ['#1e142a', '#813946'], far: '#754353', near: '#493344', grass: '#efad65' },
      { name: 'CRYSTAL COSMOS', sky: ['#171c4d', '#7866b3'], night: ['#090e29', '#40377d'], far: '#514d8c', near: '#302c61', grass: '#82edee' }
    ];
    function stageIndex(atLevel) {
      var lv = atLevel == null ? level : atLevel;
      return lv >= 15 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0;
    }
    function stage() { return STAGES[stageIndex()]; }
    function buildWorld(dark) {
      var theme = stage(), biome = stageIndex(), seed = seeded(7 + biome * 31), sky = document.createElement('canvas'), far = document.createElement('canvas'), near = document.createElement('canvas');
      sky.width = Math.ceil(w); sky.height = Math.ceil(h); far.width = Math.ceil(w + 60); far.height = Math.ceil(h); near.width = Math.ceil(w + 140); near.height = Math.ceil(h);
      var s = sky.getContext('2d'), g = s.createLinearGradient(0, 0, 0, ground);
      g.addColorStop(0, dark ? theme.night[0] : theme.sky[0]); g.addColorStop(1, dark ? theme.night[1] : theme.sky[1]);
      s.fillStyle = g; s.fillRect(0, 0, w, h);
      var k, x, y;
      if (dark) {  // pixel stars and a blocky moon
        for (k = 0; k < Math.round(w * ground / 2500); k++) { s.fillStyle = seed() < 0.2 ? '#ffe9a8' : '#ffffff'; s.globalAlpha = 0.4 + seed() * 0.6; s.fillRect(Math.round(seed() * w / px) * px, Math.round(seed() * ground * 0.7 / px) * px, px, px); }
        s.globalAlpha = 1; s.fillStyle = '#fff3c4';
        var mx = w * 0.82, my = ground * 0.22, mr = px * 6;
        for (y = -mr; y <= mr; y += px) for (x = -mr; x <= mr; x += px) if (x * x + y * y <= mr * mr && !((x - px * 2) * (x - px * 2) + (y + px) * (y + px) < px * px * 5)) s.fillRect(mx + x, my + y, px, px);
      } else {  // pixel clouds
        s.fillStyle = '#ffffff';
        for (k = 0; k < Math.max(3, Math.round(w / 220)); k++) {
          var cx = seed() * w, cy = seed() * ground * 0.45 + px * 6;
          [[0, 0, 14, 4], [3, -3, 8, 3], [-4, 1, 6, 3], [8, 1, 7, 3]].forEach(function (b) { s.fillRect(Math.round((cx + b[0] * px) / px) * px, Math.round((cy + b[1] * px) / px) * px, b[2] * px, b[3] * px); });
        }
      }
      // Mountains and hills as columns of pixels, stepped.
      function ridge(ctx, width, base, amp, step, col, cap) {
        var hgt = amp * 0.5, v = 0;
        for (x = 0; x < width; x += px) {
          if ((x / px) % step === 0) v = (seed() - 0.5) * amp * 0.5;
          hgt = Math.max(amp * 0.15, Math.min(amp, hgt + v * 0.25));
          var top = Math.round((base - hgt) / px) * px;
          ctx.fillStyle = col; ctx.fillRect(x, top, px, base - top + px);
          if (cap && hgt > amp * 0.7) { ctx.fillStyle = cap; ctx.fillRect(x, top, px, px * 2); }
        }
      }
      ridge(far.getContext('2d'), far.width, ground, Math.min(ground * 0.55, px * 40), 3, biome ? theme.far : dark ? '#2c2358' : theme.far, dark ? '#4a3f86' : '#ffffff');
      var nc = near.getContext('2d');
      ridge(nc, near.width, ground, Math.min(ground * 0.3, px * 18), 5, biome ? theme.near : dark ? '#1c3a3a' : theme.near, null);
      nc.fillStyle = dark ? '#2b5a4a' : '#7ad35f';  // grass tufts and flowers along the hills
      for (x = 0; x < near.width; x += px * Math.round(6 + seed() * 10)) { nc.fillRect(x, ground - px * 2, px, px * 2); nc.fillRect(x + px, ground - px, px, px); }
      if (biome) {  // Silhouettes give each stage a recognisable skyline.
        var decor = far.getContext('2d'); decor.fillStyle = theme.near;
        for (k = 0; k < 5; k++) {
          var dx = snap(seed() * w), dy = snap(ground - px * (18 + seed() * 15));
          decor.fillRect(dx, dy, px * 4, ground - dy);
          if (biome === 1) decor.fillRect(dx - px * 2, dy, px * 8, px * 3);
          else if (biome === 3) {
            decor.fillStyle = '#82edee';
            decor.fillRect(dx - px, dy - px * 3, px * 2, px * 5);
            decor.fillStyle = '#b2a0ff'; decor.fillRect(dx + px * 2, dy + px * 4, px * 2, px * 7);
            decor.fillStyle = theme.near;
          }
          else { decor.fillStyle = '#ef8958'; decor.fillRect(dx + px, dy, px, px * 7); decor.fillStyle = theme.near; }
        }
      }
      world = { sky: sky, far: far, near: near, dark: dark, biome: biome };
    }
    function drawWorld(ctx, dark, a) {
      if (!world || world.dark !== dark || world.biome !== stageIndex()) buildWorld(dark);
      var f = P.x / w;
      ctx.save(); ctx.globalAlpha = a; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(world.sky, 0, 0);
      ctx.drawImage(world.far, -Math.round(f * 60 / px) * px, 0);
      ctx.drawImage(world.near, -Math.round(f * 140 / px) * px, 0);
      ctx.fillStyle = dark ? '#2f7a2a' : '#4caf3a'; ctx.fillRect(0, ground, w, px * 2);  // grass
      ctx.fillStyle = stageIndex() ? stage().grass : dark ? '#5aa83f' : '#7ee05a'; ctx.fillRect(0, ground, w, px);
      ctx.fillStyle = dark ? '#3d2716' : '#6b4423'; ctx.fillRect(0, ground + px * 2, w, h - ground);  // dirt
      ctx.fillStyle = dark ? '#57381f' : '#8a5a2b';
      for (var x = (px * 3) % (px * 7); x < w; x += px * 7) ctx.fillRect(x, ground + px * (3 + (x / px) % 3), px, px);
      ctx.restore();
    }
    function setPlaying(on) { if (host) host.classList.toggle('cos-fx-playing', on); }
    try { hi = parseInt(window.localStorage.getItem('mdb-arcade-hi'), 10) || 0; } catch (e) { /* storage blocked */ }
    var blocks = [], cs = px * 8;
    for (var by = 0; by < h; by += cs) for (var bx = 0; bx < w; bx += cs) blocks.push([bx, by, rnd(0.25, 1.2)]);
    // Pixel text: drawn tiny on its own canvas, then scaled up unsmoothed so it stays chunky.
    var textCache = {};
    function textCanvas(str, color) {
      var key = str + color;
      if (!textCache[key]) {
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
    // A sprite from its rows, anchored at its bottom centre; sx/sy squash or flip it.
    // Each sprite is painted pixel by pixel once into its own little canvas, then stamped.
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
    function sprite(ctx, sp, x, y, sx, sy) {
      var img = spriteCanvas(sp);
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(sx || 1, sy || 1); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, -img.width / 2, -img.height);
      ctx.restore();
    }
    function burst(x, y, count, colors, speed) {
      for (var k = 0; k < count; k++) {
        var a = rnd(0, TAU), v = rnd(0.4, 1) * speed;
        sparks.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: rnd(0.5, 1), c: colors[k % colors.length] });
      }
    }
    function pop(x, y, label, color) { pops.push({ x: x, y: y, life: 1, label: label, c: color }); }
    function clearOfHazards(x) {
      return !spikes.some(function (sp) { return Math.abs(sp - x) < px * 8; }) && !lava.some(function (lv) { return Math.abs(lv.x - x) < lv.half + px * 3; });
    }
    function drop() {
      var r = Math.random(), kind = r < 0.6 ? 'coin' : r < 0.85 ? 'gem' : 'heart', x;
      for (var tries = 0; tries < 12; tries++) { x = rnd(0.08, 0.92) * w; if (clearOfHazards(x)) break; }
      if (!clearOfHazards(x)) return;  // no clear spot this time
      loot.push({ x: x, y: -px * 8, vy: 0, kind: kind, landed: false, bounced: false, spin: rnd(0, TAU), age: 0 });
    }
    // Only hearts vanish if left lying (seconds; half as long again in the demo), blinking
    // slowly for their last few seconds. Coins and gems stay until they're picked up.
    var LOOT_LIFE = { heart: 15 }, LOOT_BLINK = 4;
    function lootLife(l) { return LOOT_LIFE[l.kind] ? LOOT_LIFE[l.kind] * (mode === 'demo' ? 1.5 : 1) : Infinity; }
    // Spikes stay where they are; a new level only adds more (up to 5), never under the buddy.
    function addSpikes() {
      spikeWarn = 0.8;
      for (var want = Math.min(5, 1 + Math.floor(level / 2)), tries = 0; spikes.length < want && tries < 40; tries++) {
        var x = rnd(px * 10, w - px * 10);
        if (Math.abs(x - P.x) < px * 22 || spikes.some(function (s) { return Math.abs(s - x) < px * 16; })) continue;
        spikes.push(x);
      }
    }
    // Floating grass-topped platforms: low ones reachable from the ground, high ones from a low one.
    // How far sideways a jump carries the buddy (at level-1 speed) before its feet drop back
    // below dh above where it took off; 0 if it can't rise that high at all.
    function reach(dh) {
      var disc = JUMP * JUMP - 2 * G * dh;
      return disc <= 0 ? 0 : RUN * (JUMP + Math.sqrt(disc)) / G;
    }
    function snap(v) { return Math.round(v / px) * px; }
    // Platforms as a reachable chain: low ones anywhere (a jump from the ground clears them),
    // and each high one beside a low one, no further off than a jump from its edge carries.
    function placePlats() {
      plats = [];
      var lowY = snap(ground - px * 13), highY = snap(ground - px * 25), nLow = w > px * 200 ? 3 : 2, slot = w / nLow, k;
      for (k = 0; k < nLow; k++) {
        var pw = Math.round(rnd(18, 26)) * px, cx = slot * (k + 0.5) + rnd(-slot * 0.15, slot * 0.15);
        plats.push({ x0: snap(cx - pw / 2), x1: snap(cx + pw / 2), y: lowY });
      }
      if (highY < px * 14) return;  // too short a card for a second tier
      var gapMax = reach(lowY - highY) * 0.55, picks = plats.slice().sort(function () { return Math.random() - 0.5; }).slice(0, w > px * 160 ? 2 : 1);
      picks.forEach(function (low) {
        var hw = Math.round(rnd(16, 22)) * px, gap = rnd(-hw * 0.3, gapMax), side = Math.random() < 0.5 ? -1 : 1, x0;
        for (var tries = 0; tries < 2; tries++, side = -side) {
          x0 = side > 0 ? low.x1 + gap : low.x0 - gap - hw;
          if (x0 > px * 4 && x0 + hw < w - px * 4) break;
        }
        x0 = Math.max(px * 4, Math.min(w - px * 4 - hw, x0));
        plats.push({ x0: snap(x0), x1: snap(x0 + hw), y: highY });
      });
    }
    function surfaceAt(x) {  // the highest thing standing at x: a platform top or the ground
      var y = ground;
      plats.forEach(function (pl) { if (x > pl.x0 && x < pl.x1 && pl.y < y) y = pl.y; });
      return y;
    }
    // The highest surface under x that something falling from prevY to y lands on (one-way platforms).
    function floorAt(x, prevY, y) {
      var f = ground;
      surfaces().forEach(function (pl) { if (x > pl.x0 - px && x < pl.x1 + px && prevY <= pl.y + 0.5 && y >= pl.y && pl.y < f) f = pl.y; });
      return f;
    }
    // A short, reachable trail rewards climbing rather than waiting under random drops.
    function coinRoute() {
      if (!plats.length) return;
      var pl = plats[Math.floor(Math.random() * plats.length)], count = 4;
      for (var j = 0; j < count && loot.length < 12; j++) {
        loot.push({ x: snap(pl.x0 + (pl.x1 - pl.x0) * (j + 1) / (count + 1)),
          y: pl.y - px * (3 + Math.sin(j / (count - 1) * Math.PI) * 3), vy: 0,
          kind: j === count - 1 ? 'gem' : 'coin', landed: true, bounced: true, spin: j, age: 0 });
      }
    }
    var spikeWarn = 0;
    var LAVA_LIFE = 5;
    // A lava pool: bubbling molten pixels with a glow; it darkens to a crust as it cools, then
    // the grass grows back over it.
    function drawLava(ctx, lv, T, dark) {
      var x0 = Math.round((lv.x - lv.half) / px) * px, x1 = Math.round((lv.x + lv.half) / px) * px;
      var cool = clamp((1.6 - lv.life) / 1.2), regrow = clamp((0.5 - lv.life) / 0.5);
      if (cool < 1) {
        var gl = ctx.createRadialGradient(lv.x, ground, 0, lv.x, ground, lv.half * 1.8);
        gl.addColorStop(0, 'rgba(255,120,30,' + (0.35 * (1 - cool)) + ')'); gl.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = gl; ctx.fillRect(lv.x - lv.half * 2, ground - lv.half * 2, lv.half * 4, lv.half * 2 + px * 3);
      }
      for (var x = x0; x < x1; x += px) {
        var edge = Math.min(x - x0, x1 - px - x) / px, wave = Math.sin(T * 5 + x * 0.35) + Math.sin(T * 3.1 + x * 0.9);
        var hot = 1 - cool, top = ground - (edge < 1 ? 0 : wave > 1 ? px : 0);
        ctx.fillStyle = hot > 0.5 ? (wave > 1.2 ? '#ffd23f' : '#ff6a1f') : hot > 0.15 ? '#c2280e' : '#3a2a26';
        ctx.fillRect(x, top, px, ground + px * 3 - top);
        ctx.fillStyle = hot > 0.5 ? '#c2280e' : '#2a2020'; ctx.fillRect(x, ground + px, px, px * 2);
      }
      if (regrow > 0) {  // grass creeping back from the edges
        ctx.fillStyle = dark ? '#2f7a2a' : '#4caf3a';
        var reach = (x1 - x0) / 2 * regrow;
        ctx.fillRect(x0, ground, reach, px * 2); ctx.fillRect(x1 - reach, ground, reach, px * 2);
      }
      if (cool < 0.6 && Math.random() < 0.3) sparks.push({ x: rnd(x0, x1), y: ground - px, vx: rnd(-15, 15), vy: rnd(-90, -40) * px / 3, life: rnd(0.3, 0.6), c: Math.random() < 0.5 ? '#ffd23f' : '#ff6a1f' });  // embers
    }
    function drawPlat(ctx, pl, dark) {
      var wd = pl.x1 - pl.x0;
      ctx.fillStyle = dark ? '#3d2716' : '#6b4423'; ctx.fillRect(pl.x0, pl.y, wd, px * 4);  // dirt block
      ctx.fillStyle = dark ? '#57381f' : '#8a5a2b';
      for (var x = pl.x0 + px; x < pl.x1 - px; x += px * 4) ctx.fillRect(x, pl.y + px * (2 + (x / px) % 2), px, px);
      ctx.fillStyle = dark ? '#2f7a2a' : '#4caf3a'; ctx.fillRect(pl.x0, pl.y, wd, px * 1.5);  // grass top
      ctx.fillStyle = stageIndex() ? stage().grass : dark ? '#5aa83f' : '#7ee05a'; ctx.fillRect(pl.x0, pl.y, wd, px * 0.75);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(pl.x0, pl.y + px * 4, wd, px);  // underside shade
    }
    function start() {
      if (mode === 'over' && overT < 1.2) return;  // let GAME OVER sink in first
      mode = 'play'; score = 0; level = 1; xp = 0; enemies = []; enemyT = 2.5; goT = 0.8; playT = 0; setPlaying(true);
      ground = playGround;
      P.x = w * 0.2; P.y = ground; P.vx = P.vy = 0; P.hearts = 3; P.inv = 1; P.dir = 1;
      ARCADE.keys = {}; ARCADE.pointer = null; P.onGround = true; P.jumpBuf = 0; P.coyote = 0; P.chain = 0;
      P.sleep = 0; P.bonk = null; critter = null;  // wake up, it's game time
      loot = []; sparks = []; pops = []; bumps = []; levelT = 0;  // and a clean screen: nothing left over from the demo
      beginScoring();
      spikes = []; meteors = []; craters = []; lava = []; meteorT = 4; platT = 4; placePlats(); addSpikes(); coinRoute();
    }
    function quit() {
      mode = 'demo'; enemies = []; spikes = []; plats = []; meteors = []; craters = []; lava = []; setPlaying(false);
      ground = demoGround; P.y = Math.min(P.y, ground); P.vy = 0;  // back up onto the demo's floor
      loot.forEach(function (l) {
        if (l.y > ground) { l.y = ground; l.landed = true; l.vy = 0; }
        else if (l.y < ground) { l.landed = false; l.bounced = true; l.vy = 0; }  // off the vanished platforms
      });
    }
    function jump() { P.jumpBuf = 0.15; }
    function releaseJump() { if (mode === 'play' && P.vy < -JUMP * 0.45) P.vy = -JUMP * 0.45; }
    function hurt(fromX) {
      if (P.inv > 0) return;
      P.chain = 0;
      P.hearts--; P.inv = 1.4; P.vy = -JUMP * 0.55; P.vx = (P.x < fromX ? -1 : 1) * RUN * 1.4;
      pop(P.x, P.y - px * 12, '-1', '#ff3b5c'); burst(P.x, P.y - px * 4, 12, ['#ff3b5c', '#ffffff'], 140 * px / 3);
      if (P.hearts <= 0) {
        mode = 'over'; overT = 0; enemies = [];
        if (savedBest() != null) hi = savedBest();
        if (score > hi) { hi = score; try { window.localStorage.setItem('mdb-arcade-hi', String(hi)); } catch (e) { /* storage blocked */ } }
        finishScoring();
      }
    }
    function addScore(v) { score += v; }
    // Scores beyond this browser are optional: a site can plug in MDBCosmetics.arcadeScores
    //   .start(cardEl) -> a session for this game, or null when this card doesn't save scores
    //   session.finish(result)  at GAME OVER; result = {score, level, duration, coins, gems,
    //                           hearts, stomps, levelups} (what the score is made of)
    //   session.line()          a line for the GAME OVER screen, or null (e.g. 'SAVING...')
    //   session.good()          show that line in green (a new best)
    //   session.best()          the player's saved best score, or null when not known (yet)
    // Without it (the open playground) the game keeps its high score in this browser only.
    var tally = null, session = null;
    function beginScoring() {
      tally = { coins: 0, gems: 0, hearts: 0, stomps: 0, levelups: 0, chains: 0 };
      var hooks = FX.arcadeScores;
      session = hooks && hooks.start ? hooks.start(host) : null;
    }
    function finishScoring() {
      if (!session) return;
      var result = { score: score, level: level, duration: playT.toFixed(2) };
      Object.keys(tally).forEach(function (k) { result[k] = tally[k]; });
      session.finish(result);
    }
    function savedBest() { var b = session && session.best(); return b == null ? null : b; }
    var handle = { canvas: null, seen: 0, mode: function () { return mode; }, start: start, quit: quit, jump: jump, releaseJump: releaseJump };
    if (resumed) for (i = 0; i < 3; i++) { drop(); loot[i].y = ground; loot[i].landed = true; }
    return { intro: 1.6, loop: 6, rest: 4, layered: true, poster: 3.2, draw: function (front, w, h, phase, t, dt, T, edge, back) {
      // Playable only on a single canvas (not under a list header's content) whose card is marked
      // for it: a profile card for a signed-in viewer who can play (the style picker's preview is demo only).
      var hostEl = front.canvas && front.canvas.parentNode;
      var dark = isDark(), playable = front === back && !!(hostEl && hostEl.hasAttribute && hostEl.hasAttribute('data-arcade-play'));
      if (playable) { arcadeBind(); handle.canvas = front.canvas; handle.seen = performance.now(); ARCADE.inst = handle; host = front.canvas.parentNode; }
      else if (mode !== 'demo') quit();  // a game only runs where it can be played
      if (mode === 'demo') { measureT -= dt; if (measureT <= 0) { measureT = 1; measurePage(front.canvas && front.canvas.parentNode, front.canvas); } }
      var playing = mode === 'play';
      // Every level speeds the world up (enemies, spawns, falling loot), up to about 2.5x.
      var pace = playing || mode === 'over' ? Math.min(2.5, 1 + 0.15 * (level - 1)) : 1, wdt = dt * pace;
      frameT += dt; if (mode !== 'demo') playT += dt;
      // Loot keeps dropping; a little faster mid-game.
      if (edge === 'loop') { for (i = 0, n = Math.round(rnd(2, 3)); i < n && loot.length < 10; i++) drop(); }
      if (phase !== 'intro' && loot.length < 8 && Math.random() < wdt * (playing ? 0.5 : 0.35)) drop();
      loot = loot.filter(function (l) {  // loot that's lain too long vanishes with a little puff
        l.age = (l.age || 0) + dt;
        if (l.age < lootLife(l)) return true;
        burst(l.x, l.y - px * 3, 6, ['#ffffff', '#c3c9d4'], 50 * px / 3); return false;
      });
      loot.forEach(function (l) {
        l.spin += dt * (l.kind === 'coin' ? 5 : 2);
        if (l.landed) return;
        var ly = l.y; l.vy += G * wdt; l.y += l.vy * wdt;  // (age is counted below)
        var lf = l.vy > 0 ? floorAt(l.x, ly, l.y) : ground;  // loot lands on platforms too
        if (l.y >= lf) { l.y = lf; if (!l.bounced) { l.bounced = true; l.vy = -l.vy * 0.35; } else l.landed = true; }
      });
      // The buddy: the player's controls while playing, its own little hops otherwise.
      var target = 0;
      if (playing) {
        var k = ARCADE.keys, mine = ARCADE.inst === handle;
        if (mine && (k.arrowleft || k.a)) target = -1;
        else if (mine && (k.arrowright || k.d)) target = 1;
        else if (mine && ARCADE.pointer != null) { var dxp = ARCADE.pointer - P.x; target = Math.abs(dxp) > px * 3 ? (dxp < 0 ? -1 : 1) : 0; }
      } else if (mode === 'demo') {
        if (P.x > w - px * 8) P.dir = -1; else if (P.x < px * 8) P.dir = 1;  // turn at the edges first,
        target = P.dir;                                                      // or the move below undoes it
        bonkT -= dt; sleepT -= dt; hopT -= dt;
        var hv = ARCADE.hover && ARCADE.inst === handle && performance.now() - ARCADE.hover.t < 1200 ? ARCADE.hover : null;
        var near = hv ? hv.x - P.x : null;  // the cursor is on the card: where it is, relative to the buddy
        if (P.sleep > 0) {  // napping: still, until the time's up or someone comes close
          P.sleep -= dt; target = 0;
          if (P.sleep <= 0 || (near != null && Math.abs(near) < px * 25)) { P.sleep = 0; sleepT = rnd(20, 30); if (P.onGround) P.vy = -JUMP * 0.5; pop(P.x, P.y - px * 11, '!', '#ffe14d'); }
        } else if (sleepT <= 0 && P.onGround && near == null && (P.y < ground - 1 || sleepT < -6)) {
          P.sleep = rnd(5, 8); target = 0;  // on a ledge if it found one in time, else wherever it is
        } else if (near != null) {  // someone's here: come over, then stop and look at them; a happy hop when close
          P.dir = near < 0 ? -1 : 1; target = Math.abs(near) > px * 40 ? P.dir : 0;
          if (Math.abs(near) < px * 14 && hopT <= 0 && P.onGround) { hopT = 1.5; P.vy = -JUMP * 0.6; burst(P.x, P.y - px * 8, 8, ['#ff5c8a', '#ffd0da'], 70 * px / 3); }
        }
        // A beetle on the floor ahead: face it and jump on it.
        if (critter && !P.sleep && P.onGround && P.y >= ground - 1) {
          var cd = critter.x - P.x;
          P.dir = cd < 0 ? -1 : 1; target = P.dir;
          if (Math.abs(cd) > px * 8 && Math.abs(cd) < px * 13 && (critter.dir > 0) !== (cd > 0)) P.vy = -JUMP * 0.75;
        }
        if (P.onGround && !P.sleep && near == null && !critter) {
          var rise = JUMP * JUMP / (2 * G), ahead = null, under = null, best = 1e9;
          pageSurf.forEach(function (sf) {
            // A ledge coming up that a jump clears: take off a little before its edge.
            var d = ((P.dir > 0 ? sf.x0 : sf.x1) - P.x) * P.dir, up = P.y - sf.y;
            if (up > px * 2 && up < rise * 0.85 && d > px * 3 && d < px * 16 && d < best) { best = d; ahead = sf; }
            // A ledge overhead, low enough to bonk from below.
            if (bonkT <= 0 && P.x > sf.x0 + px * 2 && P.x < sf.x1 - px * 2 && P.y - px * 7 - sf.bottom > px && P.y - sf.bottom < rise * 0.9) under = sf;
          });
          if (under) { P.vy = -JUMP; P.bonk = under; bonkT = rnd(6, 10); }
          else if (ahead) P.vy = -JUMP;
          else if (levelT > 0 && Math.random() < dt * 4) P.vy = -JUMP * 0.9;  // celebrating a level
          else if (Math.random() < dt * 1.2) P.vy = -JUMP * 0.45;            // the odd happy hop
        }
      }
      var speed = mode === 'demo' ? RUN * 0.55 : RUN * Math.min(1.6, 1 + 0.07 * (level - 1));
      P.vx += (target * speed - P.vx) * Math.min(1, dt * (P.inv > 1 ? 2 : 12));
      if (target) P.dir = target;
      P.coyote = P.onGround ? 0.09 : Math.max(0, P.coyote - dt);
      if (P.jumpBuf > 0) { P.jumpBuf -= dt; if ((P.onGround || P.coyote > 0) && playing) { P.vy = -JUMP; P.jumpBuf = 0; P.coyote = 0; P.onGround = false; P.chain = 0; } }
      var py = P.y; P.vy += G * dt; P.x += P.vx * dt; P.y += P.vy * dt;
      var was = P.onGround, floor = P.vy >= 0 ? floorAt(P.x, py, P.y) : ground;  // jump up through platforms, land on them from above
      if (P.y >= floor) { P.y = floor; P.vy = 0; P.onGround = true; P.chain = 0; if (!was) { P.squash = 0.12; if (playing) burst(P.x, P.y, 5, ['#c8bca0', '#ffffff'], 22 * px); } } else P.onGround = false;
      if (P.bonk) {  // head meets the ledge from below: a bump, and a coin pops out over its top
        var bk = P.bonk;
        if (P.vy < 0 && P.y - px * 7 <= bk.bottom && P.x > bk.x0 && P.x < bk.x1) {
          P.y = bk.bottom + px * 7; P.vy = JUMP * 0.15; P.bonk = null;
          var cx = Math.max(bk.x0 + px * 3, Math.min(bk.x1 - px * 3, P.x));
          loot.push({ x: cx, y: bk.y, vy: -JUMP * 0.55, kind: 'coin', landed: false, bounced: false, spin: 0 });
          bumps.push({ x0: bk.x0, x1: bk.x1, y: bk.bottom, life: 0.25 });
          burst(cx, bk.bottom, 8, ['#ffe14d', '#ffffff'], 90 * px / 3);
        } else if (P.vy >= 0) P.bonk = null;
      }
      if (mode === 'demo') {
        critterT -= dt;
        if (!critter && critterT <= 0) { var cs2 = Math.random() < 0.5; critter = { x: cs2 ? w + px * 5 : -px * 5, dir: cs2 ? -1 : 1, ph: 0 }; }
        if (critter) {
          critter.x += critter.dir * 7 * px * dt; critter.ph += dt * 4;
          var ctop = ground - px * 6;
          if (Math.abs(P.x - critter.x) < px * 6.5 && P.y > ctop && P.y - px * 7 < ground) {
            if (P.vy > 0 && P.y - ctop < px * 4) {  // stomped
              P.vy = -JUMP * 0.7; pop(critter.x, ctop - px * 4, '+50', '#ffe14d');
              burst(critter.x, ctop, 16, ['#a04cff', '#5e1fa8', '#ffffff'], 150 * px / 3); critter = null; critterT = rnd(20, 35);
            } else if (!critter.bumped) {  // missed: startled, and it walks on
              critter.bumped = true; P.vy = -JUMP * 0.5; P.vx = (P.x < critter.x ? -1 : 1) * RUN; pop(P.x, P.y - px * 11, '!', '#ffffff');
            }
          }
          if (critter && (critter.x < -px * 8 || critter.x > w + px * 8)) { critter = null; critterT = rnd(20, 35); }
        }
      } else critter = null;
      P.x = Math.max(px * 4, Math.min(w - px * 4, P.x));
      if (P.inv > 0) P.inv -= dt;
      if (P.squash > 0) P.squash -= dt;
      // Grab loot by touching it.
      var changedStage = false;
      loot = loot.filter(function (l) {
        if (mode === 'over' || Math.abs(l.x - P.x) > px * 6 || l.y < P.y - px * 10 || l.y > P.y + px * 6) return true;
        var sp = SPRITES[l.kind];
        pop(l.x, P.y - px * 10, sp.label, sp.c);
        burst(l.x, l.y - px * 3, 10, [sp.pal[Object.keys(sp.pal)[1]], '#ffffff'], 120 * px / 3);
        if (playing) { addScore(sp.score); tally[l.kind + 's']++; if (l.kind === 'heart') P.hearts = Math.min(5, P.hearts + 1); }
        xp += sp.xp;  // whole XP points, a level every XP_PER_LEVEL: integers, so a server's re-count matches exactly
        if (xp >= XP_PER_LEVEL) {
          var previousStage = stageIndex();
          xp -= XP_PER_LEVEL; level++; levelT = 1.6;
          burst(w / 2, h * 0.3, 36, RAINBOW, 220 * px / 3);
          if (playing) {
            addScore(100); tally.levelups++;
            if (stageIndex() !== previousStage) {
              // Clear the wave and change the route safely under the player's feet.
              changedStage = true; enemies = []; meteors = []; lava = []; spikes = []; craters = [];
              placePlats(); P.y = ground; P.vy = 0; P.onGround = true; P.inv = Math.max(P.inv, 1.2);
              enemyT = 1.5; meteorT = 2; platT = 0.8;
            }
            addSpikes();
          }
          else P.vy = -JUMP * 0.9;  // the demo buddy's victory jump
        }
        return false;
      });
      if (changedStage) { loot = []; coinRoute(); }
      if (playing) {
        // Beetles walk in from the sides; from level 3 fire wisps float in too, and from level 5
        // only wisps come, swooping at all heights. From level 4 a rare comet shoots across after
        // a "!" warning at its edge. More of them, and faster, every level.
        enemyT -= wdt;
        if (enemyT <= 0) {
          enemyT = Math.max(1.6, 5.5 - level * 0.5);
          if (enemies.length < Math.min(7, 1 + level)) {
            var side = Math.random() < 0.5, roll = Math.random();
            var free = plats.filter(function (pl) { return !enemies.some(function (e) { return e.plat === pl; }); });
            if (level >= 3 && roll >= 0.15 && roll < 0.38 && free.length) {
              // A beetle pops up on a platform and patrols it.
              var bp = free[Math.floor(Math.random() * free.length)], bx = (bp.x0 + bp.x1) / 2;
              enemies.push({ kind: 'walk', warn: 0.65, plat: bp, x: bx, dir: Math.random() < 0.5 ? -1 : 1, ph: rnd(0, TAU), y: bp.y, v: 7 * px, vy: 0, hopT: rnd(1.5, 3) });
              burst(bx, bp.y - px * 3, 12, ['#a04cff', '#ffffff'], 90 * px / 3);
            } else if (level >= 4 && roll < 0.15) {
              enemies.push({ kind: 'dash', warn: 0.9, dir: side ? -1 : 1, x: side ? w + px * 8 : -px * 8, y: Math.random() < 0.5 ? ground : ground - px * 13, v: 85 * px, ph: 0 });
            } else {
              var fly = level >= 5 || (level >= 3 && Math.random() < 0.4), low = fly && Math.random() < (level >= 5 ? 0.45 : 0.2);
              enemies.push({ kind: fly ? 'fly' : 'walk', x: side ? w + px * 5 : -px * 5, dir: side ? -1 : 1, ph: rnd(0, TAU), inside: false, y: ground,
                base: low ? ground - px * 4 : ground - px * 15, amp: low ? px * 1.5 : level >= 5 ? px * 9 : px * 5, v: (fly ? 10 : 9) * px, vy: 0, hopT: rnd(1.5, 3) });
            }
          }
        }
        enemies = enemies.filter(function (e) {
          if (e.kind !== 'dash' && e.warn > 0) { e.warn -= dt; return true; }
          if (e.kind === 'dash') {
            if (e.warn > 0) { e.warn -= dt; return true; }  // the "!" shows first
            e.x += e.dir * e.v * wdt;
            if (Math.random() < 0.6) sparks.push({ x: e.x - e.dir * px * 4, y: e.y - px * rnd(1, 4), vx: -e.dir * 30, vy: rnd(-20, 20), life: 0.35, c: Math.random() < 0.5 ? '#ff3b6b' : '#ffb03b' });
            if (Math.abs(P.x - e.x) < px * 6 && P.y > e.y - px * 5 && P.y - px * 7 < e.y) hurt(e.x);
            return e.dir > 0 ? e.x < w + px * 10 : e.x > -px * 10;
          }
          e.x += e.dir * e.v * wdt; e.ph += wdt * 4;
          if (e.kind === 'walk' && e.air) {  // mid-hop: falls onto a platform or the ground
            var ey0 = e.y; e.vy += G * wdt; e.y += e.vy * wdt;
            var land = e.vy > 0 ? floorAt(e.x, ey0, e.y) : ground;
            if (e.y >= land) {
              e.y = land; e.air = false; e.vy = 0;
              e.plat = land < ground ? plats.filter(function (pl) { return pl.y === land && e.x > pl.x0 - px && e.x < pl.x1 + px; })[0] || null : null;
              if (!e.plat) e.inside = true;
            }
          } else if (e.plat) {  // a platform beetle: at an end it turns back, or now and then hops off
            var off = (e.x < e.plat.x0 + px * 4 && e.dir < 0) || (e.x > e.plat.x1 - px * 4 && e.dir > 0);
            if (off && Math.random() < 0.35) { e.air = true; e.vy = -BEETLE_JUMP * 0.45; e.plat = null; }
            else {
              if (e.x < e.plat.x0 + px * 4) { e.x = e.plat.x0 + px * 4; e.dir = 1; }
              if (e.x > e.plat.x1 - px * 4) { e.x = e.plat.x1 - px * 4; e.dir = -1; }
              e.y = e.plat.y;
            }
          } else {
            if (e.x > px * 5 && e.x < w - px * 5) e.inside = true;
            if (e.inside && ((e.x < px * 5 && e.dir < 0) || (e.x > w - px * 5 && e.dir > 0))) e.dir = -e.dir;
            e.y = e.kind === 'fly' ? Math.min(ground, e.base + Math.sin(e.ph * 0.7) * e.amp) : ground;
            if (e.kind === 'walk' && e.inside) {  // a ground beetle near a low platform's end sometimes hops up onto it
              e.hopT -= wdt;
              if (e.hopT <= 0) {
                e.hopT = rnd(1.5, 3);
                var up = plats.filter(function (pl) { var d = e.dir > 0 ? pl.x0 - e.x : e.x - pl.x1; return ground - pl.y < BEETLE_RISE * 0.9 && d > px && d < px * 7; })[0];
                if (up && Math.random() < 0.6) { e.air = true; e.vy = -BEETLE_JUMP; }
              }
            }
          }
          var top = e.y - (e.kind === 'fly' ? 5 : 6) * px;
          if (Math.abs(P.x - e.x) < px * 6.5 && P.y > top && P.y - px * 7 < e.y) {
            if (P.vy > 0 && P.y - top < px * 4) {  // stomped from above
              var pts = 50 + P.chain * 25;
              if (P.chain > 0) tally.chains = (tally.chains || 0) + 1;
              P.chain++;
              P.vy = -JUMP * 0.7; addScore(pts); tally.stomps++;
              var popLabel = P.chain > 1 ? '+' + pts + ' x' + P.chain : '+' + pts;
              var popCol = P.chain > 1 ? (P.chain >= 3 ? '#ff3bee' : '#ff9a1f') : '#ffe14d';
              pop(e.x, top - px * 4, popLabel, popCol);
              burst(e.x, top, 16 + Math.min(16, P.chain * 4), e.kind === 'fly' ? ['#ff6a1f', '#ffd23f'] : ['#a04cff', '#5e1fa8', '#ffffff'], (150 + Math.min(90, P.chain * 20)) * px / 3);
              return false;
            }
            hurt(e.x);
          }
          return true;
        });
        spikes.forEach(function (s) { if (spikeWarn <= 0 && Math.abs(P.x - s) < px * 4.5 && P.y > ground - px * 6) hurt(s); });
        // Lava burns whoever stands in it until it cools (harmless for its last moment).
        lava.forEach(function (lv) {
          if (lv.life < 0.8) return;
          if (Math.abs(P.x - lv.x) < lv.half && P.y > ground - px) hurt(lv.x);
          loot = loot.filter(function (l) {  // loot that ends up in it burns away
            if (!l.landed || l.y < ground - 1 || Math.abs(l.x - lv.x) > lv.half) return true;
            burst(l.x, ground - px * 2, 8, ['#ff6a1f', '#ffd23f', '#3a2a26'], 70 * px / 3); return false;
          });
          enemies = enemies.filter(function (e) {
            if (e.kind !== 'walk' || e.plat || e.air || Math.abs(e.x - lv.x) > lv.half) return true;
            burst(e.x, ground - px * 3, 12, ['#ff6a1f', '#5e1fa8', '#2a2e36'], 110 * px / 3); return false;  // a beetle that walks in burns up
          });
        });
        // Bonus loot appears on a platform now and then (gems more likely up there).
        platT -= wdt;
        if (platT <= 0 && plats.length) {
          platT = rnd(5, 8);
          if (loot.length < 5) coinRoute();
          if (loot.length < 8) {
            var lp = plats[Math.floor(Math.random() * plats.length)], lx = rnd(lp.x0 + px * 3, lp.x1 - px * 3), lr = Math.random();
            loot.push({ x: lx, y: lp.y, vy: 0, kind: lr < 0.5 ? 'gem' : lr < 0.9 ? 'coin' : 'heart', landed: true, bounced: true, spin: rnd(0, TAU), age: 0 });
            burst(lx, lp.y - px * 3, 10, ['#ffffff', '#ffe14d'], 80 * px / 3);
          }
        }
        // Meteors from level 2: a blinking target marks where one will hit, it streaks down on a
        // slant with a fire trail and explodes; near the blast (or touching it) costs a heart.
        if (level >= 2) {
          meteorT -= wdt;
          if (meteorT <= 0) {
            meteorT = Math.max(2.2, 8 - level * 0.6);
            var tx = rnd(px * 10, w - px * 10), dur = Math.max(0.6, 1.1 - 0.05 * level), side = Math.random() < 0.5 ? -1 : 1;
            meteors.push({ tx: tx, ty: surfaceAt(tx), sx: tx + side * Math.min(w * 0.3, h * 0.6), t: 0, dur: dur });
          }
          meteors = meteors.filter(function (m) {
            m.t += dt;
            var q = clamp(m.t / m.dur), mx = m.sx + (m.tx - m.sx) * q, my = -px * 8 + (m.ty + px * 8) * q * q;
            m.x = mx; m.y = my;
            sparks.push({ x: mx + rnd(-px, px), y: my - px * 3, vx: (m.sx - m.tx) * 0.3 + rnd(-20, 20), vy: rnd(-40, -10), life: 0.4, c: Math.random() < 0.5 ? '#ff6a1f' : '#ffd23f' });
            if (Math.abs(P.x - mx) < px * 6 && Math.abs(P.y - px * 3 - my) < px * 6) hurt(mx);
            if (q >= 1) {
              burst(m.tx, m.ty - px * 2, 26, ['#ff6a1f', '#ffd23f', '#7a4a2a', '#ffffff'], 200 * px / 3);
              if (m.ty >= ground) lava.push({ x: m.tx, half: px * 7, life: LAVA_LIFE });  // a pool of lava where it struck the ground
              else craters.push({ x: m.tx, y: m.ty, life: 2 });                            // a platform just gets scorched
              if (Math.abs(P.x - m.tx) < px * 9 && Math.abs(P.y - m.ty) < px * 8) hurt(m.tx);
              return false;
            }
            return true;
          });
        }
      }
      if (mode === 'over') { overT += dt; if (overT > 10) quit(); }
      // Backdrop: the game world (while a game is on), spikes, loot, enemies, the buddy, HUD.
      if (mode !== 'demo') drawWorld(back, dark, clamp(playT * 3));
      plats.forEach(function (pl) { drawPlat(back, pl, dark); });
      bumps = bumps.filter(function (b) { return (b.life -= dt) > 0; });
      bumps.forEach(function (b) { back.fillStyle = 'rgba(255,255,255,' + (3 * b.life) + ')'; back.fillRect(b.x0 + px, b.y - px, b.x1 - b.x0 - px * 2, px); });
      craters = craters.filter(function (c) { return (c.life -= dt) > 0; });
      lava = lava.filter(function (lv) { return (lv.life -= wdt) > 0; });
      lava.forEach(function (lv) { drawLava(back, lv, T, dark); });
      craters.forEach(function (c) { back.fillStyle = 'rgba(20,12,6,' + (0.5 * clamp(c.life)) + ')'; back.fillRect(c.x - px * 5, c.y, px * 10, px); back.fillRect(c.x - px * 3, c.y + px, px * 6, px); });
      spikeWarn = Math.max(0, spikeWarn - dt);
      spikes.forEach(function (s) {
        back.save(); back.globalAlpha = spikeWarn > 0 ? 0.25 + 0.5 * Math.abs(Math.sin(frameT * 16)) : 1;
        sprite(back, SPIKE, s, ground); back.restore();
      });
      meteors.forEach(function (m) {
        // Target marker on the ground, blinking faster as impact nears.
        var left = 1 - m.t / m.dur;
        if (Math.floor(m.t * (6 + 14 * (1 - left))) % 2 === 0) {
          back.fillStyle = '#ff3b3b';
          for (var d = -3; d <= 3; d++) { back.fillRect(m.tx + d * px - px / 2, m.ty - px * 2 + d * px * 0.5, px, px); back.fillRect(m.tx + d * px - px / 2, m.ty - px * 2 - d * px * 0.5, px, px); }
          back.fillRect(m.tx - px * 6, m.ty - px * 0.5, px * 2, px); back.fillRect(m.tx + px * 4, m.ty - px * 0.5, px * 2, px);
        }
        if (m.x != null) {
          back.save(); back.globalAlpha = 0.5; back.fillStyle = '#ff6a1f';
          back.beginPath(); back.arc(m.x, m.y - px * 3, px * 5, 0, TAU); back.fill(); back.restore();
          sprite(back, METEOR, m.x, m.y);
        }
      });
      loot.forEach(function (l) {
        var left = lootLife(l) - (l.age || 0);
        if (left < LOOT_BLINK && Math.floor(l.age * (left < 1.5 ? 6 : 3)) % 2) return;  // blinking: about to go
        var sx = l.kind === 'coin' ? Math.cos(l.spin) : 1, bob = l.landed && l.kind !== 'coin' ? Math.sin(l.spin) * px * 0.6 : 0;
        sprite(back, SPRITES[l.kind], l.x, l.y + bob, Math.abs(sx) < 0.15 ? 0.15 : sx, 1);
      });
      enemies.forEach(function (e) {
        if (e.kind === 'dash') {
          if (e.warn > 0) {
            back.fillStyle = 'rgba(255,75,100,.16)'; back.fillRect(0, e.y - px * 5, w, px * 5);
            if (Math.floor(e.warn * 8) % 2) pixelText(back, '!', e.dir > 0 ? px * 4 : w - px * 4, e.y - px * 4, px * 1.4, '#ff3b3b', '#15151a'); }
          else sprite(back, COMET, e.x, e.y - px * 0.5, e.dir, 1);
          return;
        }
        if (e.warn > 0) {
          pixelText(back, '!', e.x, e.y - px * 10, px * 0.8, '#ffe14d', '#15151a');
          if (Math.floor(e.warn * 12) % 2) return;
        }
        var f = Math.floor(e.ph) % 2;
        sprite(back, e.kind === 'fly' ? WISP[f] : BEETLE[f], e.x, e.y, e.kind === 'fly' ? 1 : -e.dir, 1);
      });
      if (mode !== 'over' && !(P.inv > 0 && Math.floor(P.inv * 10) % 2)) {  // blinks while hurt
        var shY = floorAt(P.x, P.y, ground);  // shadow on whatever is under it: a ledge, a platform or the floor
        back.save(); back.fillStyle = 'rgba(0,0,0,.22)'; back.fillRect(P.x - px * 4, shY - px * 0.5, px * 8, px); back.restore();
        var sq = P.squash > 0, stride = P.onGround && Math.abs(P.vx) > RUN * 0.15 && !P.sleep ? Math.sin(frameT * 24) : 0;
        sprite(back, P.sleep > 0 ? BLOB_SLEEP : BLOB, P.x, P.y - Math.abs(stride) * px * 0.45,
          P.dir * (sq ? 1.15 : 1 + stride * 0.045), sq ? 0.85 : P.onGround ? 1 - stride * 0.04 : P.vy < 0 ? 1.08 : 0.96);
        if (P.sleep > 0) for (var zz = 0; zz < 3; zz++) {  // z z z drifting up
          var zp = (T * 0.6 + zz / 3) % 1;
          pixelText(back, 'z', P.x + px * 3 + zp * px * 5, P.y - px * 9 - zp * px * 9, px * (0.5 + 0.35 * zp), '#ffffff', '#15151a', 1 - zp);
        }
      }
      if (critter) sprite(back, BEETLE[Math.floor(critter.ph) % 2], critter.x, ground, -critter.dir, 1);
      var barW = Math.min(150, w * 0.3), bx0 = px * 14, by0 = h - px * 5;
      // The XP bar sits on the card's bottom line: in the demo that's real page content on a profile
      // card (the hub tabs), so the card says to leave it off (scene.hud === false) until a game starts.
      if (mode !== 'demo' || scene.hud !== false) {
        back.fillStyle = dark ? 'rgba(10,10,20,.75)' : 'rgba(20,20,40,.7)'; back.fillRect(bx0 - px, by0 - px, barW + px * 2, px * 4);
        var fill = back.createLinearGradient(bx0, 0, bx0 + barW, 0); fill.addColorStop(0, '#6ee05a'); fill.addColorStop(1, '#ffe14d');
        back.fillStyle = fill; back.fillRect(bx0, by0, barW * clamp(xp / XP_PER_LEVEL), px * 2);
        pixelText(back, 'LV' + level, bx0 - px * 7, by0 + px, px * 0.75, '#ffffff', '#15151a');
      }
      if (playing) {
        for (i = 0; i < P.hearts; i++) sprite(front, SPRITES.heart, px * 6 + i * px * 6, px * 9, 0.7, 0.7);
        pixelText(front, 'SCORE ' + score, w - px * 4, px * 6, px * 0.65, '#ffffff', '#15151a', 1, 'right');
      } else if (mode === 'demo' && playable && scene.prompt !== false && phase !== 'intro' && Math.floor(frameT * 1.6) % 2) {
        pixelText(front, 'P / TAP TO PLAY', w - px * 4, by0 + px, px * 0.6, '#ffe14d', '#15151a', 0.9, 'right');
      }
      // Front: sparkles, pop-up numbers, LEVEL UP!, GO!, GAME OVER.
      sparks = sparks.filter(function (s) { return (s.life -= dt) > 0; });
      sparks.forEach(function (s) {
        s.vy += G * 0.6 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        front.globalAlpha = clamp(s.life * 2); front.fillStyle = s.c; front.fillRect(Math.round(s.x), Math.round(s.y), px, px);
      });
      front.globalAlpha = 1;
      pops = pops.filter(function (p) { return (p.life -= dt) > 0; });
      pops.forEach(function (p) { pixelText(front, p.label, p.x, p.y - (1 - p.life) * px * 10, px * 0.8, p.c, '#15151a', clamp(p.life * 2)); });
      if (levelT > 0) {
        levelT -= dt;
        var lk = 1.6 - levelT, lp = lk < 0.2 ? lk / 0.2 * 1.25 : lk < 0.35 ? 1.25 - (lk - 0.2) / 0.15 * 0.25 : 1;
        pixelText(front, stageIndex() !== stageIndex(level - 1) ? stage().name : 'LEVEL ' + level, w / 2, h * 0.3, px * 1.4 * lp, RAINBOW[Math.floor(T * 12) % RAINBOW.length], '#15151a', clamp(levelT * 2.5));
      }
      if (playing && playT < 5) {
        pixelText(front, w < 420 ? 'ARROWS / WASD + SPACE' : 'MOVE ARROWS / WASD   JUMP SPACE   ESC EXIT', w / 2, h - px * 1.5, px * 0.45, '#ffffff', '#15151a', Math.min(1, 5 - playT));
      }
      if (goT > 0) { goT -= dt; pixelText(front, 'GO!', w / 2, h * 0.4, px * 1.6, '#6ee05a', '#15151a', clamp(goT * 2)); }
      if (mode === 'over') {
        front.fillStyle = 'rgba(12,10,28,' + (0.6 * clamp(overT * 3)) + ')'; front.fillRect(0, 0, w, h);
        pixelText(front, 'GAME OVER', w / 2, h * 0.32, px * 1.5, '#ff3b5c', '#15151a', clamp(overT * 3));
        if (savedBest() != null) hi = savedBest();
        pixelText(front, 'SCORE ' + score + '   BEST ' + Math.max(hi, score), w / 2, h * 0.5, px * 0.8, '#ffffff', '#15151a', clamp(overT * 3));
        var line = session && session.line();
        if (line) pixelText(front, line, w / 2, h * 0.62, px * 0.6, session.good() ? '#6ee05a' : '#ffe14d', '#15151a', clamp(overT * 3));
        if (overT > 1.2 && Math.floor(overT * 1.6) % 2) pixelText(front, 'P / TAP TO RETRY', w / 2, h * 0.76, px * 0.7, '#ffe14d', '#15151a');
      }
      // Intro: dark pixel blocks break away behind PLAYER 1 ... GO!
      if (phase === 'intro' && !resumed && mode === 'demo') {
        front.fillStyle = '#15122b';
        blocks.forEach(function (b) { if (t < b[2]) front.fillRect(b[0], b[1], cs + 0.5, cs + 0.5); });
        if (t < 0.85) pixelText(front, 'PLAYER 1', w / 2, h / 2, px * 1.3, Math.floor(t * 8) % 2 ? '#ffe14d' : '#ffffff', '#7a2bd6');
        else pixelText(front, 'GO!', w / 2, h / 2, px * 1.6 * (1 + 0.3 * clamp(1 - (t - 0.85) / 0.2)), '#6ee05a', '#15151a', clamp((1.6 - t) * 3));
      }
    } };
  }

  FX.registerEffect('arcade', arcade);
})();

/* MDBList profile effects runtime: runs an effect on a canvas over a host element (on
   mdblist.com, the profile card). This is the runner from mdblist.com's effects file, without
   the built-in animations; games register themselves with MDBCosmetics.registerEffect.

     var fx = MDBCosmetics.mountEffect(hostEl, 'arcade', { scene: fn or {}, force: true });
     fx.replay(); fx.destroy();

   Each effect plays its intro once, then repeats loop + rest. It scales to the host's size,
   rebuilds after a resize, and pauses while the host is off screen or the tab is hidden.
   Skipped under prefers-reduced-motion unless opts.force is set (the game was asked for).
   poster: draw one still frame instead of animating (thumbnails).
   layered: also paint a backdrop canvas under the host's content (not playable).
   scene: layout hints for the effect, e.g. {ground: px from the top}; may be a function,
     re-read whenever the effect re-lays itself out after a resize.
   See CONTRIBUTING.md for what an effect factory returns. */
(function () {
  'use strict';
  var EFFECTS = {};

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // A still of the effect for the picker: fast-forward it to its most telling moment (halfway
  // through the first loop, or the factory's own `poster` time in seconds) and keep that one
  // frame. No animation loop or observers, and nothing moves, so it's fine under reduced motion.
  var POSTER_FPS = 30;
  function paintPoster(host, key) {
    var canvas = document.createElement('canvas');
    canvas.className = 'cos-fx-canvas'; canvas.setAttribute('aria-hidden', 'true');
    host.classList.add('cos-fx-host'); host.appendChild(canvas);
    var dpr = Math.min(2, window.devicePixelRatio || 1), r = host.getBoundingClientRect(), w = r.width, h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var eff = EFFECTS[key](w, h, { thumb: true }, false), at = eff.poster != null ? eff.poster : eff.intro + eff.loop / 2, phase = null;
    for (var i = 0, n = Math.round(at * POSTER_FPS); i <= n; i++) {
      var T = i / POSTER_FPS, p, t;
      if (T < eff.intro) { p = 'intro'; t = T; }
      else {
        var c = (T - eff.intro) % (eff.loop + eff.rest);
        if (c < eff.loop) { p = 'loop'; t = c; } else { p = 'rest'; t = c - eff.loop; }
      }
      var edge = p !== phase ? p : null; phase = p;
      ctx.clearRect(0, 0, w, h);
      eff.draw(ctx, w, h, p, t, 1 / POSTER_FPS, T, edge, ctx);
    }
    if (eff.hostClass) host.classList.add(eff.hostClass);
    return {
      meta: function () { return eff; },
      replay: function () {},
      destroy: function () { if (eff.hostClass) host.classList.remove(eff.hostClass); canvas.remove(); }
    };
  }

  function mountEffect(host, key, opts) {
    opts = opts || {};
    if (EFFECTS[key] && opts.poster) return paintPoster(host, key);
    if (!EFFECTS[key] || (reduceMotion && !opts.force)) return null;
    host.classList.add('cos-fx-host');
    function makeCanvas(cls) {
      var c = document.createElement('canvas');
      c.className = 'cos-fx-canvas' + (cls ? ' ' + cls : '');
      c.setAttribute('aria-hidden', 'true');
      return c;
    }
    // Front canvas sits over the host's content. With opts.layered a second, backdrop canvas
    // goes underneath it: layered effects paint their scenery there and pass only flying bits
    // to the front; effects that aren't split paint everything on the backdrop.
    var canvas = makeCanvas(''), back = opts.layered ? makeCanvas('cos-fx-back') : null;
    host.appendChild(canvas);
    if (back) host.insertBefore(back, host.firstChild);
    var canvases = back ? [back, canvas] : [canvas];
    var ctx = canvas.getContext('2d'), bctx = back ? back.getContext('2d') : null;
    var eff, w = 0, h = 0, start = 0, last = 0, phase = null, raf = 0, visible = true, dead = false, stopped = false, stoppedAt = 0;

    function size() {
      var dpr = window.devicePixelRatio || 1, r = host.getBoundingClientRect();
      w = r.width; h = r.height;
      canvases.forEach(function (c) {
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      });
    }
    function scene() { return (typeof opts.scene === 'function' ? opts.scene() : opts.scene) || {}; }
    // After a resize, rebuild the effect for the new size (scenery positions depend on it) but
    // keep the clock running, so it carries on from where it was instead of replaying the intro.
    // `phase` is left as it is, so the new instance doesn't see a phase edge and re-run its
    // intro/loop start (re-dropping leaves, bursting popcorn, re-releasing bats...).
    function relayout() {
      if (dead || !eff) return;
      host.classList.remove('cos-fx-playing');
      size();
      eff = EFFECTS[key](w, h, scene(), true);
    }
    var relayoutTimer = 0;
    function clear() { canvases.forEach(function (c) { c.getContext('2d').clearRect(0, 0, w, h); }); }
    // Host classes (e.g. Film Noir's greyscale) only make sense on the self-contained profile card/header.
    function hostClass() { return !opts.layered && eff && eff.hostClass; }
    function reset() {
      size();
      stopped = false;
      canvases.forEach(function (c) { c.style.transition = ''; c.style.opacity = ''; });
      if (hostClass()) host.classList.remove(eff.hostClass);
      host.classList.remove('cos-fx-playing');  // a Player One game hides the card; never leave it hidden
      eff = EFFECTS[key](w, h, scene(), false);
      if (hostClass()) host.classList.add(eff.hostClass);
      start = last = performance.now(); phase = null;
    }
    function frame(now) {
      raf = 0;
      if (dead) return;
      var dt = Math.min(0.05, (now - last) / 1000), T = (now - start) / 1000, p, t, cycleT;
      last = now;
      if (T < eff.intro) { p = 'intro'; t = T; cycleT = T; }
      else {
        var c = (T - eff.intro) % (eff.loop + eff.rest);
        if (c < eff.loop) { p = 'loop'; t = c; } else { p = 'rest'; t = c - eff.loop; }
        cycleT = eff.intro + c;
      }
      var edge = p !== phase ? p : null; phase = p;
      if (opts.stopAfter && T > opts.stopAfter && p === 'rest' && !stopped) {
        stopped = true; stoppedAt = T;
        canvases.forEach(function (cv) { cv.style.transition = 'opacity 1s'; cv.style.opacity = '0'; });
        setTimeout(function () { if (hostClass()) host.classList.remove(eff.hostClass); clear(); }, 1000);
      }
      if (stopped && T > stoppedAt + 1.1) return;  // faded out: stop the loop
      clear();
      var front = bctx && !eff.layered ? bctx : ctx;
      eff.draw(front, w, h, p, t, dt, T, edge, bctx || front);
      if (opts.onTick) opts.onTick(p, cycleT, eff, edge);
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    // Resume after being off screen / hidden (dt restarts at one frame, not the gap).
    function schedule() {
      if (!raf && !dead && visible && !document.hidden) { last = performance.now() - 16; raf = requestAnimationFrame(frame); }
    }

    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (e) { visible = e[0].isIntersecting; schedule(); }) : null;
    if (io) io.observe(host);
    var ro = 'ResizeObserver' in window ? new ResizeObserver(function () {
      var r = host.getBoundingClientRect();
      // Re-size and re-lay out once resizing settles; meanwhile the canvases just scale via CSS.
      if (Math.abs(r.width - w) > 1 || Math.abs(r.height - h) > 1) {
        clearTimeout(relayoutTimer); relayoutTimer = setTimeout(relayout, 200);
      }
    }) : null;
    if (ro) ro.observe(host);
    function onVis() { schedule(); }
    document.addEventListener('visibilitychange', onVis);

    reset(); schedule();
    return {
      meta: function () { return eff; },
      replay: function () { reset(); schedule(); },
      destroy: function () {
        dead = true; clearTimeout(relayoutTimer);
        if (raf) cancelAnimationFrame(raf);
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        if (hostClass()) host.classList.remove(eff.hostClass);
        host.classList.remove('cos-fx-playing');
        canvases.forEach(function (c) { c.remove(); });
      }
    };
  }

  window.MDBCosmetics = window.MDBCosmetics || {};
  window.MDBCosmetics.effects = Object.keys(EFFECTS);
  window.MDBCosmetics.mountEffect = mountEffect;
  // Games (games/*.js) add themselves here when loaded.
  window.MDBCosmetics.registerEffect = function (key, factory) {
    EFFECTS[key] = factory;
    if (window.MDBCosmetics.effects.indexOf(key) < 0) window.MDBCosmetics.effects.push(key);
  };
})();

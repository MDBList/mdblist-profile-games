# Contributing

Thanks for helping! You can improve Player One (new enemies, levels, polish, fixes) or make a new
game. Every change is reviewed before it reaches mdblist.com.

## Try your change

1. Open `index.html` in a browser and play.
2. Check every size (Desktop, Tablet, Phone), both themes, and with "Card content" on and off.
3. Run `node tools/check-games.js` (Node 18+). Pull requests run it too.

## How a game plugs in

A game is one JavaScript file in `games/`. It registers a factory with the runtime:

```js
(function () {
  'use strict';
  var FX = window.MDBCosmetics;
  if (!FX || !FX.registerEffect) return;

  function myGame(w, h, scene, resumed) {
    // Set up the game for a card w × h CSS pixels.
    return {
      intro: 1.5, loop: 6, rest: 4,   // seconds: the intro plays once, then loop + rest repeat
      draw: function (ctx, w, h, phase, t, dt, T, edge, back) {
        // Called every frame. ctx is a 2D canvas context covering the card.
        // phase: 'intro' | 'loop' | 'rest'; t: seconds into this phase; dt: seconds since the
        // last frame; T: seconds since start; edge: the phase name on its first frame, else null.
      }
    };
  }

  FX.registerEffect('my-game', myGame);
})();
```

Then add `<script src="games/my-game.js"></script>` to `index.html`.

- **Resizing.** `resumed` is `true` when the runtime rebuilds your game after the card was
  resized. Pick up where you were instead of replaying the intro.
- **Layout hints.** `scene` tells you about the card, for example `scene.ground`: the y position
  (in px from the top) of the line the demo should walk on, so it doesn't walk over the stats.
  `scene.hud === false` means the card's bottom line is busy (the tabs), so keep a heads-up display
  off it during the demo. `scene.prompt === false` means there's no room for a "press P" prompt.
- **Playable or not.** A game may only take input when its card has the `data-arcade-play`
  attribute. Without it (thumbnails, someone signed out) it should run its demo only.
- **Input.** Bind your own keys and pointer events, and ignore keys while the user is typing in a
  form field. Don't block page scrolling except while a game is actually being played.
- **While playing**, add the class `cos-fx-playing` to the card. That hides the card's own content
  so your game has the whole card. Remove the class when the game ends.
- **Dark and light.** Check `document.documentElement.classList.contains('dark')` each frame.

Player One is the full example: demo mode, input, levels, the HUD and game over.

## Scores

A game keeps its own high score in `localStorage`, under a key like `mdb-<game>-hi`. On
mdblist.com the site can also save scores to leaderboards. If your game wants that, call the
optional hook the way Player One does (`beginScoring` / `finishScoring`):

```js
var hooks = FX.arcadeScores;                        // absent here, present on mdblist.com
var session = hooks && hooks.start ? hooks.start(cardElement) : null;
// ... at game over:
if (session) session.finish({ score: 1234, level: 4, duration: '93.50', /* what the score is made of */ });
// On the game over screen: session.line() (a status line or null), session.good() (show it in
// green), session.best() (saved best score or null).
```

The site checks every saved score, so changing how Player One scores (points per coin, XP per
level) also needs a change on the site. Say so in your pull request. A new game starts without
leaderboard scores until the site adds checks for it.

## Rules

Games run inside a signed-in user's page on mdblist.com, so they must be self-contained:

- **No network.** No `fetch`, `XMLHttpRequest`, WebSockets, beacons, or loading other scripts.
- **No page access beyond the card.** Draw on your canvas. Don't read or change the rest of the
  page, cookies, or other storage. You may read the card's layout (element positions) to place
  things, as Player One does with its ledges.
- **No code from strings.** No `eval`, `new Function`, or string timers.
- **No external assets.** Draw everything in code (Player One's sprites are pixel maps in the
  file). Keep the file reasonably small.
- **Respect the demo.** Until someone presses play, the card's content must stay readable: no
  solid overlays, nothing parked on top of text or tabs.
- **Be smooth on phones.** Aim for 60 fps on a mid-range phone; scale with the card size.
- **Pause and resume cleanly.** The runtime stops calling `draw` while the card is off screen or
  the tab is hidden; handle a long gap without a jump.

`tools/check-games.js` catches the common mistakes. The review catches the rest.

## Pull requests

- Keep one change per pull request, with a short description and a screenshot or GIF for visual
  changes.
- By sending a pull request you agree your contribution is licensed under the MIT license of
  this repo, and you confirm you have the right to submit it. Sign off your commits
  (`git commit -s`) to say so.

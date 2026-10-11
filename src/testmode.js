// Test mode (#703): `&test` makes headless test runs cheap. It changes only what is DRAWN, never the game: no
// antialiasing, no shadows, the lowest quality level (`&quality=0` unless another is named: mirrors off, smallest
// pixel ratio, fewest particles, nearest detail culling) and no start warm-up (headless browsers skip it anyway).
// `&test=lazy` also stops the loop's own render() (the game logic still runs every frame); `__app.testMode.draw()`
// renders one frame, `.full(true)` raises quality 3 + shadows for a real screenshot (tools/testkit.cjs `shot()`),
// `.full(false)` goes back. Tests that measure drawing (perfcount, turntest, phonememtest, glrestoretest, shot
// comparisons) must NOT use it. Spawned by main.js; the controller lives at `window.__app.testMode`.
export function readTestMode(search = location.search) {
  const p = new URLSearchParams(search);
  return p.has('test') ? { lazy: p.get('test') === 'lazy' } : null;
}

/** `TEST` = readTestMode(); `ctx` = { renderer, quality, levels, render }; returns the controller (null when not in test mode). */
export function makeTestController(TEST, { renderer, quality, levels, render }) {
  if (!TEST) return null;
  let full = false, drawNext = false;
  return {
    lazy: TEST.lazy,
    get full() { return full; },
    /** Take (and clear) the "draw this frame" request: always true unless lazy. */
    wantsFrame() { const v = !TEST.lazy || drawNext || full; drawNext = false; return v; },
    /** Draw one frame right now (also in lazy mode). */
    draw() { render(); },
    /** Full quality + shadows for a screenshot (true) or back to the cheap test look (false). */
    setFull(on) {
      full = !!on;
      renderer.shadowMap.enabled = full;
      quality.set(full ? levels - 1 : 0, 'testmode');
      renderer.shadowMap.needsUpdate = true;
    },
  };
}

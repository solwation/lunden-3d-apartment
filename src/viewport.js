// CSS owns the game surface; Three owns only its drawing buffer (#567).
// Attach before scene loading awaits anything so an early rotation is not lost.
// The size the game surface actually has (CSS px). HUD code that places things in screen space or splits the screen
// reads this instead of window.innerWidth/innerHeight, which iOS leaves stale for a while after a rotation (#567).
export const gameView = { w: typeof innerWidth === 'number' ? innerWidth : 0, h: typeof innerHeight === 'number' ? innerHeight : 0 };

export function bindGameViewport(renderer, camera, { deferResize = () => false } = {}) {
  const canvas = renderer.domElement;
  const win = canvas.ownerDocument.defaultView, doc = canvas.ownerDocument;
  let width = 0, height = 0, frame = 0, pending = false, deferred = false, disposed = false;
  function sync() {
    if (disposed) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // Hidden documents can briefly have no layout. Keep the last valid projection.
    if (w <= 0 || h <= 0) return;
    gameView.w = w; gameView.h = h;
    // The opaque phone cover needs current CSS dimensions for DOM/input, but no new drawing buffer.
    // Keep projection paired with the existing buffer until a visible draw can use the latest layout.
    if (deferResize()) { pending = true; deferred = true; return; }
    pending = deferred = false;
    if (w === width && h === height) return;
    width = w; height = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Do not set inline pixel dimensions: they would freeze the CSS viewport size.
    // setSize preserves the current (possibly adaptive) rendering pixel ratio.
    renderer.setSize(w, h, false);
  }
  function schedule() {
    if (disposed) return;
    pending = true;
    if (!frame) frame = win.requestAnimationFrame(() => { frame = 0; sync(); });
  }
  // iOS can report the pre-rotation layout for a while after orientationchange; re-measure a few times (#567).
  const settle = () => { schedule(); for (const ms of [120, 350, 800]) win.setTimeout(schedule, ms); };
  function resize() {
    win.scrollTo(0, 0); // retain the existing iOS scroll correction
    schedule();
  }
  // A later CSS layout change may happen without another window.resize event.
  // Updating the buffer cannot resize this CSS-sized canvas, so no observer loop.
  const observer = win.ResizeObserver ? new win.ResizeObserver(sync) : null;
  observer?.observe(canvas);
  const listeners = [
    [win, 'resize', resize], [win, 'orientationchange', settle],
    [win, 'pageshow', schedule], [win.screen?.orientation, 'change', settle],
    [win.visualViewport, 'resize', schedule], [doc, 'fullscreenchange', schedule],
    [doc, 'visibilitychange', schedule],
  ];
  for (const [target, event, fn] of listeners) target?.addEventListener(event, fn);
  sync();
  const dispose = () => {
    disposed = true;
    pending = deferred = false;
    observer?.disconnect();
    if (frame) win.cancelAnimationFrame(frame);
    for (const [target, event, fn] of listeners) target?.removeEventListener(event, fn);
  };
  // Main flushes before its next visible frame; a resize rAF may otherwise run after the animation loop.
  // No layout read in ordinary unchanged frames, or while the cover still defers the pending resize.
  dispose.flush = () => { if (!disposed && pending && !deferResize()) sync(); };
  // Diagnostic snapshot only: cached binding state, no extra layout/style reads per frame.
  dispose.layoutState = () => ({ deferred: pending && deferred ? 1 : 0, retained: [width, height] });
  return dispose;
}

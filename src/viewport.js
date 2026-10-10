// CSS owns the game surface; Three owns only its drawing buffer (#567).
// Attach before scene loading awaits anything so an early rotation is not lost.
// The size the game surface actually has (CSS px). HUD code that places things in screen space or splits the screen
// reads this instead of window.innerWidth/innerHeight, which iOS leaves stale for a while after a rotation (#567).
export const gameView = { w: typeof innerWidth === 'number' ? innerWidth : 0, h: typeof innerHeight === 'number' ? innerHeight : 0 };

export function bindGameViewport(renderer, camera) {
  const canvas = renderer.domElement;
  const win = canvas.ownerDocument.defaultView, doc = canvas.ownerDocument;
  let width = 0, height = 0, frame = 0;
  function sync() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // Hidden documents can briefly have no layout. Keep the last valid projection.
    if (w <= 0 || h <= 0 || (w === width && h === height)) return;
    width = w; height = h;
    gameView.w = w; gameView.h = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Do not set inline pixel dimensions: they would freeze the CSS viewport size.
    // setSize preserves the current (possibly adaptive) rendering pixel ratio.
    renderer.setSize(w, h, false);
  }
  function schedule() {
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
  return () => {
    observer?.disconnect();
    if (frame) win.cancelAnimationFrame(frame);
    for (const [target, event, fn] of listeners) target?.removeEventListener(event, fn);
  };
}

// Loading steps (#1130): names the current startup step on the loading card (index.html's `window.__lundenLoading`).
// Later stall detection (#1131), error messages (#1132) and long-task splitting (#1133) build on the same record.
import { STARTUP } from './config.js';

/** Resolves after the next frame (or STARTUP.stepYield ms when frames are throttled), so the page can paint. */
function nextPaint() {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, STARTUP.stepYield);
    globalThis.requestAnimationFrame?.(() => { clearTimeout(timer); setTimeout(resolve, 0); });
  });
}

/** Show `name` as the current step, with an approximate share `fraction` (0–1) of the whole startup.
 *  `await loadingStep(…)` before a long synchronous block lets the page paint the new step first. */
export function loadingStep(name, fraction) {
  try { globalThis.__lundenLoading?.step(name, fraction); } catch { /* the card is cosmetic */ }
  return nextPaint();
}

/** Progress inside the current step (#1133): raises the card's share to `fraction` without a new step, then lets
 *  the page paint, so a long synchronous build can be cut into parts with the heartbeat drawn in between. */
export function loadingYield(fraction) {
  try {
    const api = globalThis.__lundenLoading;
    if (api && Number.isFinite(fraction)) {
      api.fraction = Math.max(api.fraction, Math.min(1, fraction));
      const bar = document.querySelector('#loading .loading-bar i');
      if (bar) bar.style.width = `${Math.round(api.fraction * 100)}%`;
    }
  } catch { /* the card is cosmetic */ }
  return nextPaint();
}

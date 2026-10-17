// Loading steps (#1130): names the current startup step on the loading card (index.html's `window.__lundenLoading`).
// Later stall detection (#1131), error messages (#1132) and long-task splitting (#1133) build on the same record.
import { STARTUP } from './config.js';

/** Show `name` as the current step, with an approximate share `fraction` (0–1) of the whole startup.
 *  The returned promise resolves after the next frame (or STARTUP.stepYield ms when frames are throttled), so
 *  `await loadingStep(…)` before a long synchronous block lets the page paint the new step first. */
export function loadingStep(name, fraction) {
  try { globalThis.__lundenLoading?.step(name, fraction); } catch { /* the card is cosmetic */ }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, STARTUP.stepYield);
    globalThis.requestAnimationFrame?.(() => { clearTimeout(timer); setTimeout(resolve, 0); });
  });
}

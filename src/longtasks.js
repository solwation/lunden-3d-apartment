// Startup long tasks (#1133): the longest main-thread blocks (PerformanceObserver 'longtask', each ≥ 50 ms) until the
// loading card is done, each with the loading step (#1130) it started in. Kept in `window.__lundenLoading.long` as
// { top: [[ms, step], …] (longest first, STARTUP.longTasksKept), n, sum (ms) }; crashlog.js puts it in its heartbeat.
// Buffered, so tasks before this module loaded (bootstrap, imports) count too. Chromium only; elsewhere nothing.
import { STARTUP } from './config.js';

const L = globalThis.__lundenLoading;
if (L && !L.long && typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
  const long = L.long = { top: [], n: 0, sum: 0 };
  const card = document.getElementById('loading');
  const stepAt = (t) => { let name = L.steps?.[0]?.name ?? '?'; for (const s of L.steps ?? []) if (s.at <= t) name = s.name; return name; };
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const ms = Math.round(e.duration);
        long.n++; long.sum += ms;
        long.top.push([ms, stepAt(e.startTime)]);
      }
      long.top.sort((a, b) => b[0] - a[0]);
      long.top.length = Math.min(long.top.length, STARTUP.longTasksKept);
      if (!card || card.hidden || card.classList.contains('done')) obs.disconnect(); // startup only
    });
    obs.observe({ type: 'longtask', buffered: true });
  } catch { /* diagnostics only */ }
}

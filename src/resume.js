// Keep the visitor's place across the "Ladda om" button (#74): the button stores the position, the
// view direction and the clock in a ONE-TIME record; the next page load reads it, deletes it at once
// and starts there. F5 / Ctrl+F5 / opening the page anew find no record and start at START as usual.
// sessionStorage first; localStorage (with a short expiry) as a fallback, because iOS can lose
// sessionStorage on reload. Every access is wrapped: storage may be blocked.

const KEY = 'lunden.resume', MAX_AGE = 2 * 60 * 1000;
// F5 (#203): the place is also written to this tab's sessionStorage every couple of seconds while visiting, so a
// reload of the same tab carries on; a new tab / visit has none and starts as usual
const SESSION = 'lunden.session', SESSION_AGE = 12 * 3600 * 1000;
// The developer scenario `&life` (#365, life.js) neither reads nor writes these records: the visitor's own place stays.
const DEV = /[?&]life(?:[=&]|$)/.test(location.search);

/** Keep the place for an F5 in this tab (called every ~2 s and when the page is hidden). */
export function saveSession(state) {
  if (DEV) return;
  try { sessionStorage.setItem(SESSION, JSON.stringify({ ...state, ts: Date.now() })); } catch { /* blocked */ }
}

/** Store the place now (only called by the "Ladda om" button). */
export function saveResume(state) {
  if (DEV) return;
  const rec = JSON.stringify({ ...state, ts: Date.now() });
  try { sessionStorage.setItem(KEY, rec); } catch { /* blocked */ }
  try { localStorage.setItem(KEY, rec); } catch { /* blocked */ }
}

/** Read and delete the record; null when there is none, it is too old or it is broken. */
export function takeResume() {
  if (DEV) return null;
  let raw = null;
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const s = store();
      raw = raw ?? s.getItem(KEY);
      s.removeItem(KEY);
    } catch { /* blocked */ }
  }
  let age = MAX_AGE;
  if (!raw) { // no "Ladda om" record: this tab's running record (F5)
    try { raw = sessionStorage.getItem(SESSION); sessionStorage.removeItem(SESSION); age = SESSION_AGE; } catch { /* blocked */ }
  }
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    if (!(Date.now() - r.ts < age) || ![r.x, r.z, r.feetY, r.yaw, r.pitch].every(Number.isFinite)) return null;
    return r;
  } catch { return null; }
}

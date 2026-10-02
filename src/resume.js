// Keep the visitor's place across the "Ladda om" button (#74): the button stores the position, the
// view direction and the clock in a ONE-TIME record; the next page load reads it, deletes it at once
// and starts there. F5 / Ctrl+F5 / opening the page anew find no record and start at START as usual.
// sessionStorage first; localStorage (with a short expiry) as a fallback, because iOS can lose
// sessionStorage on reload. Every access is wrapped: storage may be blocked.

const KEY = 'lunden.resume', MAX_AGE = 2 * 60 * 1000;

/** Store the place now (only called by the "Ladda om" button). */
export function saveResume(state) {
  const rec = JSON.stringify({ ...state, ts: Date.now() });
  try { sessionStorage.setItem(KEY, rec); } catch { /* blocked */ }
  try { localStorage.setItem(KEY, rec); } catch { /* blocked */ }
}

/** Read and delete the record; null when there is none, it is too old or it is broken. */
export function takeResume() {
  let raw = null;
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const s = store();
      raw = raw ?? s.getItem(KEY);
      s.removeItem(KEY);
    } catch { /* blocked */ }
  }
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    if (!(Date.now() - r.ts < MAX_AGE) || ![r.x, r.z, r.feetY, r.yaw, r.pitch].every(Number.isFinite)) return null;
    return r;
  } catch { return null; }
}

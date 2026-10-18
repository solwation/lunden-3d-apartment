// Typed clock time for the wall clock strip (#1242): pure parsing, no imports (tested with node --test).

/**
 * Parse a typed time of day into hours (0 ≤ h < 24), or null when it is not a valid 00:00–23:59.
 * Accepts "14:30", "14.30", "14,30", "14 30", "14h30", and bare digits: "1430", "930" (= 09:30), "9" or "14" (= whole hour).
 * Minutes after a separator may be one or two digits ("9:5" = 09:05); bare digits are read as HMM / HHMM.
 */
export function parseClockInput(text) {
  const s = String(text ?? '').trim().toLowerCase();
  let h, m;
  const sep = /^(\d{1,2})\s*[:.,h ]\s*(\d{1,2})$/.exec(s);
  if (sep) { h = Number(sep[1]); m = Number(sep[2]); }
  else if (/^\d{1,2}$/.test(s)) { h = Number(s); m = 0; }
  else if (/^\d{3,4}$/.test(s)) { h = Number(s.slice(0, -2)); m = Number(s.slice(-2)); }
  else return null;
  return h <= 23 && m <= 59 ? h + m / 60 : null;
}

/** Live preview of digits typed so far with the keys: "1" → "1_:__", "143" → "14:3_", "1430" → "14:30". */
export function previewDigits(digits) {
  const d = String(digits).slice(0, 4).padEnd(4, '_');
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

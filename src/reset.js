// "Återställ" on the start screen (#303): the whole home back to how it was at the very first visit, locally only.
// Every 'lunden.*' key in this browser's localStorage and sessionStorage goes except the whitelist RESET_KEEP (the
// shared world's queue and drawings, the score, the leaderboard name, conveniences); the resume / F5 records go with
// the rest, so the clean reload that follows (main.js) starts at START at the real time with every door shut, the
// lamps on the dusk rule, everything at home, no car, no cat. IndexedDB (taped-up drawings, cat photos) is never
// touched, nor is the cloud: no DELETE is sent and its offline queue stays. Only our own prefix: the origin
// (solwation.github.io) is shared with other pages.
import { RESET_KEEP } from './config.js';

const PREFIX = 'lunden.';
/** One-time flag for the reloaded page: say "Hemmet är återställt". */
export const RESET_DONE = 'lunden.resetDone';
/** One-time flag to hide menu automatically when resetting from menu (#522). */
export const RESET_HIDE_MENU = 'lunden.resetHideMenu';

/** Remove every 'lunden.*' key not in RESET_KEEP from both storages; returns the keys removed. */
export function clearLocalHome() {
  const removed = [];
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const s = store();
      const drop = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(PREFIX) && !RESET_KEEP.includes(k)) drop.push(k);
      }
      for (const k of drop) { s.removeItem(k); removed.push(k); }
    } catch { /* blocked */ }
  }
  try { sessionStorage.setItem(RESET_DONE, '1'); } catch { /* blocked */ }
  return removed;
}

/** True once after a reset (the flag is removed when read). */
export function takeResetDone() {
  try {
    const done = sessionStorage.getItem(RESET_DONE) === '1';
    sessionStorage.removeItem(RESET_DONE);
    return done;
  } catch { return false; }
}

/** Returns the input mode to resume after reset and hides the menu, removing the flag. */
export function takeResetHideMenu() {
  try {
    const mode = sessionStorage.getItem(RESET_HIDE_MENU);
    if (mode) sessionStorage.removeItem(RESET_HIDE_MENU);
    return mode;
  } catch { return null; }
}

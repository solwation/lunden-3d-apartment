import { CHORE_SYNC } from './config.js';

// #1976 (the user, 2026-11-15: "everybody who helped with a chore gets its points"): the goals of the day's chores (src/tasks.js)
// shared between the players in a room. No three.js, no DOM: the Worker imports the validation (cloudflare/chores.js).
// A goal one player completes counts for the same chore of everybody else in the room (if they have that chore today and it is not
// done); when a chore's last goal falls into place, each player whose own hands completed at least one of its goals is paid by their
// own client (tasks.js `completeGoal(…, by)`); a player who did none of it gets the chore done, for nothing.
// The room remembers who did which goal (CHORE_SYNC.days days, in memory only: gone when the room is), by a random helper key the
// client keeps in its own storage, so a player who helped and left is paid at their next visit while the room still exists.
//   client -> room: { t: 'ch', k: 'hi', u } (after the welcome: who we are) | { t: 'ch', k: 'g', u, d, i, g } (we completed goal g of
//     chore i on our day d, 'YYYY-MM-DD').
//   room -> the sender, on 'hi': { t: 'ch', k: 'L', rows: [[d, i, g, mine 0 | 1, name], …] } (everything it remembers).
//   room -> everybody else, on 'g': { t: 'ch', k: 'g', d, i, g, n } (`n`: the helper's display name). The key `u` never leaves the room.

const DAY = /^\d{4}-\d{2}-\d{2}$/, ID = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/, KEY = /^[0-9a-f]{16,32}$/;

/** A helper key: random, kept by the client; or null. */
export const helperKey = (u) => (typeof u === 'string' && KEY.test(u) ? u : null);
/** A fresh helper key (16 hex characters). */
export function newHelperKey(random = (n) => crypto.getRandomValues(new Uint8Array(n))) { return [...random(8)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

/** A chore message from a client (already parsed), or null. */
export function cleanChore(m) {
  if (m?.t !== 'ch') return null;
  const u = helperKey(m.u);
  if (!u) return null;
  if (m.k === 'hi') return { k: 'hi', u };
  if (m.k !== 'g' || typeof m.d !== 'string' || !DAY.test(m.d) || typeof m.i !== 'string' || !ID.test(m.i) || typeof m.g !== 'string' || !ID.test(m.g)) return null;
  return { k: 'g', u, d: m.d, i: m.i, g: m.g };
}
/** A goal as the room tells it ([d, i, g, mine, name] or the 'g' message), or null. */
export function cleanGoal(d, i, g, mine = 0, name = '') {
  if (typeof d !== 'string' || !DAY.test(d) || typeof i !== 'string' || !ID.test(i) || typeof g !== 'string' || !ID.test(g)) return null;
  return { d, i, g, mine: mine === 1, name: typeof name === 'string' ? name.slice(0, CHORE_SYNC.name) : '' };
}

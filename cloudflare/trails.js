import { FOOTPRINTS } from '../src/config.js';

// #1773: the players' recent paths, so a player who joins late still sees the footprints of the last 30 minutes. The live prints of the
// others are made by every client from the states it already gets (5 Hz, cloudflare/players.js); only the past needs the room. It keeps,
// in memory only (no KV, no storage, #1689; lost when the object hibernates, the prints then simply start again), a sparse point per
// FOOTPRINTS.room.gap m walked from each player's states: a ring of at most `max` points [key, x, y, z, ms], none older than
// FOOTPRINTS.life s. `key` numbers one unbroken trail (a new one after a jump over `jump` m, a ride, the jetpack's thrust, sitting or
// lying, and per connection). No new message: the joiner's welcome carries { trails: { k: [[key, x, y, z, age s], …] } }, and the
// client (src/footprints.js) decides where snow lies. A player state already passed cleanState (finite, bounded numbers).
const R = FOOTPRINTS.room, r1 = (v) => Math.round(v * 10) / 10;

export class RoomTrails {
  constructor(max = R.max) { this.max = max; this.reset(); }
  reset() { this.pts = []; this.head = 0; this.walkers = new Map(); this.nextKey = 1; } // pts: the ring; head: the oldest slot when full

  /** A player's accepted state `s` (cleanState) at room time `now` ms. */
  record(id, s, now = Date.now()) {
    if (!Array.isArray(s?.p)) return;
    if (s.bk !== undefined || s.jp === 2 || s.pose) { this.walkers.delete(id); return; } // riding, flying, seated / lying: no prints
    const [x, y, z] = s.p;
    let w = this.walkers.get(id);
    const d = w ? Math.hypot(x - w.x, z - w.z) : Infinity;
    if (w && d < R.gap) return;
    if (!w || d > R.jump) w = { key: this.nextKey++ };
    w.x = x; w.z = z;
    this.walkers.set(id, w);
    const pt = [w.key, r1(x), r1(y), r1(z), now];
    if (this.pts.length < this.max) this.pts.push(pt);
    else { this.pts[this.head] = pt; this.head = (this.head + 1) % this.max; }
  }

  /** A player left: their trail stays, the next connection starts a new one. */
  leave(id) { this.walkers.delete(id); }

  /** The history for a welcome: { k: [[key, x, y, z, age s], …] } oldest first, only points younger than FOOTPRINTS.life. */
  snapshot(now = Date.now()) {
    const n = this.pts.length, out = [];
    for (let j = 0; j < n; j++) {
      const p = this.pts[(this.head + j) % n], age = Math.round((now - p[4]) / 1000);
      if (age <= FOOTPRINTS.life) out.push([p[0], p[1], p[2], p[3], Math.max(0, age)]);
    }
    return { k: out };
  }
}

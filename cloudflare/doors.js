import { DOOR_SYNC } from '../src/config.js';

// #1775: doors seen by everybody. The room keeps each door's state in MEMORY ONLY (no KV, no storage; #1689): lost when the object
// hibernates, and forgotten when the last player has left. Ids are `<group letter><index>` (src/config.js DOOR_SYNC.max lists the groups
// and how many indexes each may have; the clients build the lists identically).
//   client -> room: { t: 'dr', i: 'w3', o: 1 | 0 } (open / shut); at most one per DOOR_SYNC.every s per connection.
//   room -> everybody (the sender too, so a simultaneous pair ends the same for all): { t: 'dr', i, o, at, by } where `at` is the ROOM's
//   clock (ms) when it took the message: the last one taken wins, a stale one (at below the stored) never overrides.
//   welcome: the room's `w` message carries doors: [[id, open 0|1], …] (only the doors that differ from the closed start; left out when none).

/** A door message from a client, or null. */
export function cleanDoor(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'dr' || typeof m.i !== 'string') return null;
  const g = /^([wLABCgq])(0|[1-9]\d{0,2})$/.exec(m.i);
  if (!g || Number(g[2]) >= DOOR_SYNC.max[g[1]]) return null;
  if (m.o !== 0 && m.o !== 1) return null;
  return { i: m.i, o: m.o };
}

export class RoomDoors {
  constructor(send, peers) { this.send = send; this.peers = peers; this.state = new Map(); } // id -> { o, at }
  /** The doors that are not shut, for the welcome. */
  list() { const out = []; for (const [i, e] of this.state) if (e.o) out.push([i, 1]); return out; }
  /** The room is empty: forget everything (every door starts shut again). */
  reset() { this.state.clear(); }
  handle(ws, a, m, now = Date.now()) {
    if (now - (a.dr ?? 0) < DOOR_SYNC.every * 1000 * 0.8) return;
    a.dr = now;
    const old = this.state.get(m.i);
    const at = Math.max(now, (old?.at ?? 0) + 1); // the room's clock never goes back: the last one taken is the newest
    this.state.set(m.i, { o: m.o, at });
    const out = JSON.stringify({ t: 'dr', i: m.i, o: m.o, at, by: a.i });
    for (const { ws: x } of this.peers()) this.send(x, out);
  }
}

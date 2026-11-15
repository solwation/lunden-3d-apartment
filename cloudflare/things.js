import { THING_SYNC } from '../src/config.js';
import { cleanThing } from '../src/thingsync.js';

// #1974 (part of #1964): loose things shared between the players: who holds a thing, or where it lies. The protocol is in
// src/thingsync.js. As the doors (#1775) the room keeps this in MEMORY ONLY (no KV, no Durable Object storage): forgotten when the
// last player has left. What a connection HOLDS is also written into its socket attachment (`th`: a short list of ids), so a room
// that wakes from hibernation still knows who holds what; where things LIE is lost by a hibernation (the clients keep showing what
// they were told; only a late joiner's welcome is then incomplete).
// The rules: a thing held by a connected player cannot be taken or moved by anybody else (the first 'take' the room gets wins, the
// other is refused); anybody may take a thing that lies in the world (from within THING_SYNC.reach m of it) or that is at home; only
// its holder may put it down (within reach of where they stand) or send it home; when a player leaves, what they held goes home.

/** A thing message from a client (text), or null. */
export function cleanThingText(text) {
  try { return cleanThing(JSON.parse(text)); } catch { return null; }
}

export class RoomThings {
  /** send(ws, text); peers(): [{ ws, a }] the open connections with their attachments; save(ws, a): write the attachment back. */
  constructor(send, peers, save = () => {}) { Object.assign(this, { send, peers, save, state: new Map(), woke: false }); } // id -> { m, at, by, p?, q? }
  /** After a hibernation the map is empty: what the connections hold is in their attachments. */
  wake() {
    if (this.woke) return;
    this.woke = true;
    for (const { a } of this.peers()) for (const i of Array.isArray(a?.th) ? a.th : []) if (!this.state.has(i)) this.state.set(i, { m: 'held', at: 1, by: a.i });
  }
  /** The things that are not at home, for the welcome. */
  list() {
    this.wake();
    const out = [];
    for (const [i, e] of this.state) out.push(e.m === 'held' ? [i, 'held', e.by] : [i, 'world', e.by, e.p, e.q]);
    return out;
  }
  /** The room is empty: forget everything (every thing is where each player's own save has it). */
  reset() { this.state.clear(); this.woke = true; }
  row(i, e) { return { i, m: e.m, at: e.at, by: e.by, ...(e.m === 'world' ? { p: e.p, q: e.q } : {}) }; }
  near(a, p) { const s = a?.s?.p; return !Array.isArray(s) || Math.hypot(s[0] - p[0], s[1] - p[1], s[2] - p[2]) <= THING_SYNC.reach; } // (no position yet: not refused)
  handle(ws, a, m, now = Date.now()) {
    this.wake();
    if (now - (a.thAt ?? 0) < THING_SYNC.every * 1000 * 0.8) return;
    a.thAt = now;
    const old = this.state.get(m.i) ?? { m: 'home', at: 0, by: '' }, live = new Set(this.peers().map((p) => p.a?.i));
    const others = old.m === 'held' && old.by !== a.i && live.has(old.by), mine = Array.isArray(a.th) ? a.th : [];
    let why = '';
    if (others) why = 'held';
    else if (m.k === 'take') {
      if (old.m === 'world' && !this.near(a, old.p)) why = 'far';
      else if (!mine.includes(m.i) && mine.length >= THING_SYNC.held) why = 'full';
    } else if (m.k === 'put') { if (!this.near(a, m.p)) why = 'far'; }
    else if (old.m === 'world' && old.by !== a.i && !this.near(a, old.p)) why = 'far'; // 'home' of a thing lying somewhere: only from beside it
    if (why) { this.send(ws, JSON.stringify({ t: 'th', ...this.row(m.i, old), no: why, n: m.n })); return; }
    const at = Math.max(now, old.at + 1); // the room's clock never goes back per thing
    const next = m.k === 'take' ? { m: 'held', at, by: a.i } : m.k === 'put' ? { m: 'world', at, by: a.i, p: m.p, q: m.q } : { m: 'home', at, by: a.i };
    if (next.m === 'home') this.state.delete(m.i); else this.state.set(m.i, next);
    const th = next.m === 'held' ? [...mine.filter((x) => x !== m.i), m.i] : mine.filter((x) => x !== m.i);
    if (th.length !== mine.length || next.m === 'held') { a.th = th; this.save(ws, a); }
    const out = JSON.stringify({ t: 'th', ...this.row(m.i, next) });
    for (const { ws: x } of this.peers()) this.send(x, out);
  }
  /** A connection left: what it held goes home for everybody. `rest`: the connections that remain. */
  leave(a, now = Date.now()) {
    this.wake();
    if (!a?.i) return;
    for (const [i, e] of [...this.state]) {
      if (e.m !== 'held' || e.by !== a.i) continue;
      this.state.delete(i);
      const out = JSON.stringify({ t: 'th', i, m: 'home', at: Math.max(now, e.at + 1), by: a.i });
      for (const { ws, a: b } of this.peers()) if (b?.i !== a.i) this.send(ws, out);
    }
  }
}

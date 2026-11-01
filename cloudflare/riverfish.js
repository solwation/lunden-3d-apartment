import { RIVER_FISH as C } from '../src/config.js';
import { fishSpec, fishAt, fishTime } from '../src/riverfishswim.js';

// #1752: the fish in Höje å shared between the players near the river. The fish are pure functions of (seed, id, born, time)
// (src/riverfishswim.js), so the room simulates nothing per frame and writes NOTHING to storage or KV (#1689): it is the one clock and
// seed for everybody, and keeps, in memory only, which fish were caught (lost when the object hibernates; the fish are then simply back).
// Messages { t: 'rf', k, … } (src/riverfishsync.js documents the client side):
//   client -> room: 'on' / 'off' (the player is within RIVER_FISH.sync.enter m of the river / left beyond `leave`); 'c' { f, b } (#1753: catch
//   fish f in its life b).
//   room -> client: 'L' { now, s, g } to a player who comes near (room clock ms, seed, gone list [[id, born, until ms]]); to the catcher 'ok' |
//   'no' { f, b }; to everybody else near 'g' { f, b, u } (fish f is gone and comes back as life b at room time u).
// Limits: ids 0..count-1, born 0..1e6; 'on' while on and 'off' while off are ignored (one 'L' per arrival); a catch at most once per
// `catchEvery` s per connection, only from a player near the river whose last known position (a.s.p) is within `reach` m of where that fish
// is now, only for the fish's current life and only while it is in the water. The gone list holds at most `count` entries.

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const between = ([a, b], r) => a + (b - a) * r;

/** A river-fish message from a client, or null. */
export function cleanRiverFish(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'rf') return null;
  switch (m.k) {
    case 'on': case 'off': return { k: m.k };
    case 'c': return int(m.f, 0, C.count - 1) && int(m.b, 0, 1e6) ? { k: 'c', f: m.f, b: m.b } : null;
    default: return null;
  }
}

/** The river-fish relay of one players room. `peers()` → [{ ws, a }] open sockets with their (deserialized) attachments. */
export class RoomRiverFish {
  constructor(peers, send, random = Math.random) { this.peers = peers; this.send = send; this.random = random; this.reset(); }
  reset() { this.lives = new Map(); } // id -> { b: current life, u: room ms it is back }
  /** The players near the river, `ws`'s own (not yet serialized) attachment `a` swapped in. */
  present(ws, a) { return this.peers().map((o) => (o.ws === ws ? { ws, a } : o)).filter((o) => o.a?.rf === true); }
  goneList() {
    const out = [];
    for (const [f, e] of this.lives) out.push([f, e.b, e.u]);
    return out;
  }
  /** A socket is gone (or about to be). Nothing else to hand over: the room keeps the clock and the gone list. */
  trim(ws, a) { if (a?.rf === true) a.rf = false; }
  handle(ws, a, m, now = Date.now()) {
    if (m.k === 'on') {
      if (a.rf === true) return;
      a.rf = true;
      this.send(ws, JSON.stringify({ t: 'rf', k: 'L', now, s: C.seed, g: this.goneList() }));
      return;
    }
    if (m.k === 'off') { a.rf = false; return; }
    if (m.k !== 'c' || a.rf !== true) return;
    if (now - (a.rfc ?? 0) < C.sync.catchEvery * 1000) return; // (too soon: no answer, the client gives up on its own)
    a.rfc = now;
    const e = this.lives.get(m.f), born = e?.b ?? 0, p = a.s?.p;
    let ok = born === m.b && !(e && now < e.u) && Array.isArray(p);
    if (ok) { const o = fishAt(fishSpec(m.f, born), fishTime(now)); ok = Math.hypot(p[0] - o.x, p[2] - o.z) <= C.sync.reach; }
    if (!ok) { this.send(ws, JSON.stringify({ t: 'rf', k: 'no', f: m.f, b: m.b })); return; }
    const next = { b: born + 1, u: Math.round(now + between(C.sync.respawn, this.random()) * 1000) };
    this.lives.set(m.f, next);
    this.send(ws, JSON.stringify({ t: 'rf', k: 'ok', f: m.f, b: m.b }));
    const out = JSON.stringify({ t: 'rf', k: 'g', f: m.f, b: next.b, u: next.u });
    for (const o of this.present(ws, a)) if (o.ws !== ws) this.send(o.ws, out);
    // the catcher learns the comeback too (its own gone entry)
    this.send(ws, out);
  }
}

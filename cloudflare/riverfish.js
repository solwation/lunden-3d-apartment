import { RIVER_FISH as C, SHARK } from '../src/config.js';
import { fishSpec, fishAt, fishTime } from '../src/riverfishswim.js';
import { sharkNow, sharkAt, sharkUntil, cleanSharkRecord } from '../src/sharkswim.js';

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
// is now, only for the fish's current life (or up to 50 later, #1778) and only while it is in the water. The gone list holds at most `count` entries.
// #1769, the rare shark (src/sharkswim.js): client -> room 'sc' { p: [x, y, z], r } (catch the shark; its body lands at p, yaw r); room -> client
// 'sok' / 'sno' to the catcher, 'S' { sh } (the catch record { w, at, p, r }) to everybody near, and 'L' also carries `sh` (the live record; left
// out when there is none) and `sk: 1` when the room runs the test schedule (env SHARK_TEST: cloudflare/dev.mjs LUNDEN_SHARK_TEST=1). A shark catch shares the
// fish catch's rate limit; it is accepted only while a window is open (by the room's clock), once per window, from a player within
// SHARK.reach m of the shark, landing within SHARK.land m of that player.
// Storage (the one exception to "memory only", #1769): the record must outlive hibernation for about a day (the skeleton), so it is ONE
// small value under the key 'shark' in this Durable Object's own storage: read once when the object wakes, written once per accepted
// catch (at most once a week), deleted when found expired on waking. Nothing goes to KV (#1689) and no alarm is set.

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// #1778: how many lives past its own record the room believes a client's catch (it forgets all of them when it hibernates).
const AHEAD = 50;
const between = ([a, b], r) => a + (b - a) * r;

/** A river-fish message from a client, or null. */
export function cleanRiverFish(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'rf') return null;
  switch (m.k) {
    case 'on': case 'off': return { k: m.k };
    case 'c': return int(m.f, 0, C.count - 1) && int(m.b, 0, 1e6) ? { k: 'c', f: m.f, b: m.b } : null;
    case 'sc': return Array.isArray(m.p) && m.p.length === 3 && m.p.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e4) && typeof m.r === 'number' && Number.isFinite(m.r) && Math.abs(m.r) <= 10 ? { k: 'sc', p: m.p.slice(), r: m.r } : null;
    default: return null;
  }
}

/** The river-fish relay of one players room. `peers()` → [{ ws, a }] open sockets with their (deserialized) attachments. */
export class RoomRiverFish {
  /** storage: the Durable Object's ctx.storage (or null: memory only); test: the shark's test schedule (SHARK.test). */
  constructor(peers, send, random = Math.random, { storage = null, test = false } = {}) { Object.assign(this, { peers, send, random, storage, test, shark: null }); this.reset(); }
  reset() { this.lives = new Map(); } // id -> { b: current life, u: room ms it is back }
  /** #1769: the shark's catch record after waking (blockConcurrencyWhile); an expired one is deleted. */
  async load(now = Date.now()) {
    if (!this.storage) return;
    const raw = await this.storage.get('shark');
    if (raw === undefined || raw === null) return;
    const r = cleanSharkRecord(raw);
    if (r && now < sharkUntil(r)) this.shark = r;
    else await this.storage.delete('shark'); // (expired or malformed: nothing left to show)
  }
  /** The live shark record (null once the skeleton is gone). */
  liveShark(now) { return this.shark && now < sharkUntil(this.shark) ? this.shark : null; }
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
      this.send(ws, JSON.stringify({ t: 'rf', k: 'L', now, s: C.seed, g: this.goneList(), ...(this.liveShark(now) ? { sh: this.shark } : {}), ...(this.test ? { sk: 1 } : {}) }));
      return;
    }
    if (m.k === 'off') { a.rf = false; return; }
    if ((m.k !== 'c' && m.k !== 'sc') || a.rf !== true) return;
    if (now - (a.rfc ?? 0) < C.sync.catchEvery * 1000) return; // (too soon: no answer, the client gives up on its own)
    a.rfc = now;
    if (m.k === 'sc') return this.catchShark(ws, a, m, now);
    const e = this.lives.get(m.f), p = a.s?.p;
    // #1778: after hibernation the room is back at life 0 while a still-connected client has seen later lives; a catch of a LATER life
    // (at most `ahead` beyond the room's) is believed and the room catches up (the reach check below still uses that life's position).
    const known = e?.b ?? 0, ahead = m.b > known && m.b - known <= AHEAD, born = ahead ? m.b : known;
    let ok = born === m.b && !(!ahead && e && now < e.u) && Array.isArray(p);
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
  /** #1769: a catch of the shark ('sc'): open window, not caught in it yet, the catcher near the shark, the body landing near the catcher. */
  catchShark(ws, a, m, now) {
    const t = fishTime(now), w = sharkNow(t, C.seed, this.test), p = a.s?.p;
    let ok = !!w && Array.isArray(p) && !(this.shark && this.shark.w === w.k);
    if (ok) { const o = sharkAt(w, t, {}, C.seed); ok = Math.hypot(p[0] - o.x, p[2] - o.z) <= SHARK.reach && Math.hypot(m.p[0] - p[0], m.p[2] - p[2]) <= SHARK.land && Math.abs(m.p[1] - p[1]) <= 3; }
    if (!ok) { this.send(ws, JSON.stringify({ t: 'rf', k: 'sno' })); return; }
    const r2 = (v) => Math.round(v * 100) / 100;
    this.shark = { w: w.k, at: now, p: m.p.map(r2), r: r2(m.r) };
    this.storage?.put('shark', this.shark); // (one small value, once per window: survives hibernation for the skeleton's day)
    const out = JSON.stringify({ t: 'rf', k: 'S', sh: this.shark });
    for (const o of this.present(ws, a)) this.send(o.ws, out); // (the catcher too, before its answer: the fin is gone when the body lands)
    this.send(ws, JSON.stringify({ t: 'rf', k: 'sok' }));
  }
}

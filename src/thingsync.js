import { THING_SYNC } from './config.js';

// #1974 (part of #1964): loose things shared between the players, the wire and the client's ledger (no three.js, no DOM: the Worker
// imports the validation, `node --test src/thingsync.test.mjs` runs the rest). The room (cloudflare/things.js) keeps, per thing, where
// it is: at HOME (the default, never stored), lying in the WORLD at a place, or HELD by one connection. Memory only, as the doors (#1775).
//   client -> room: { t: 'th', i, k: 'take' | 'put' | 'home', n, p?: [x, y, z], q?: [x, y, z, w] } (`n`: the sender's request number;
//     `p`, `q` with 'put': where it lies and how it is turned).
//   room -> everybody (the sender too): { t: 'th', i, m: 'held' | 'world' | 'home', at, by, p?, q? } (`at`: the room's clock, strictly
//     rising per thing; `by`: who holds it / put it there / sent it home).
//   room -> the sender only, when refused: { t: 'th', i, no: why, n, m, at, by?, p?, q? } with the thing's state as the room has it,
//     so the client puts things right ('held' by somebody else, 'far', 'full', 'bad').
//   welcome: things: [[i, 'held', by] | [i, 'world', by, p, q], …] (only what is not at home; left out when none).
// Nothing here says what a thing IS beyond its id's group: no names, no contents.

const ID = /^([a-z])(0|[1-9]\d{0,2})$/, KINDS = new Set(['take', 'put', 'home']);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Is `i` the id of a thing that may be shared (a known group, an index under the group's max, no padding)? */
export function thingId(i, C = THING_SYNC) {
  if (typeof i !== 'string') return false;
  const g = ID.exec(i);
  return !!g && Number(g[2]) < (C.max[g[1]] ?? 0);
}
/** A place [x, y, z] inside the bounds, rounded to mm; or null. */
export function cleanPlace(p, C = THING_SYNC) {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(fin)) return null;
  if (p[0] < C.x[0] || p[0] > C.x[1] || p[1] < C.y[0] || p[1] > C.y[1] || p[2] < C.z[0] || p[2] > C.z[1]) return null;
  return p.map(r3);
}
/** A unit quaternion [x, y, z, w] (normalised, rounded); or null. */
export function cleanTurn(q) {
  if (!Array.isArray(q) || q.length !== 4 || !q.every(fin)) return null;
  const l = Math.hypot(...q);
  return l > 0.9 && l < 1.1 ? q.map((v) => r3(v / l)) : null;
}
/** A thing message from a client (already parsed), or null. */
export function cleanThing(m, C = THING_SYNC) {
  if (m?.t !== 'th' || !thingId(m.i, C) || !KINDS.has(m.k) || !Number.isSafeInteger(m.n) || m.n < 0) return null;
  if (m.k !== 'put') return { i: m.i, k: m.k, n: m.n };
  const p = cleanPlace(m.p, C), q = cleanTurn(m.q);
  return p && q ? { i: m.i, k: 'put', n: m.n, p, q } : null;
}
/** A state from the room (a broadcast, a refusal's state or a welcome row turned into one), or null. */
export function cleanThingState(m, C = THING_SYNC) {
  if (!thingId(m?.i, C) || !['held', 'world', 'home'].includes(m.m)) return null;
  const s = { i: m.i, m: m.m, at: fin(m.at) ? m.at : 0, by: typeof m.by === 'string' ? m.by.slice(0, 16) : '' };
  if (m.m === 'world') { s.p = cleanPlace(m.p, C); s.q = cleanTurn(m.q); if (!s.p || !s.q) return null; }
  return s;
}

/** The client's side: what the room says about every thing that is not at home, and our own requests waiting for an answer.
 *  send(m): false when not connected; me(): our connection's id (or ''); hooks.change(state, was, why): a thing's state changed
 *  (`why`: 'room' | 'welcome' | 'refused' | 'reset'); the caller moves the real thing. Solo / offline nothing is sent or kept. */
export class ThingLedger {
  constructor({ send = () => false, me = () => '', hooks = {}, cfg = THING_SYNC } = {}) {
    Object.assign(this, { send, me, hooks, cfg, state: new Map(), pending: new Map(), n: 0 });
  }
  /** Where thing `i` is, as far as the room has said: { i, m, at, by, p?, q? } ('home' when nothing else is known). */
  get(i) { return this.state.get(i) ?? { i, m: 'home', at: 0, by: '' }; }
  /** Somebody else holds it (we may not take it). */
  heldByOther(i) { const s = this.state.get(i); return !!s && s.m === 'held' && s.by !== this.me(); }
  set(s, why) {
    const was = this.get(s.i);
    if (s.m === 'home') this.state.delete(s.i); else this.state.set(s.i, s);
    this.hooks.change?.(s, was, why);
  }
  /** Ask the room: `k` 'take' | 'put' | 'home' (with `p`, `q` for 'put'). False when it cannot be sent (offline: do it locally only). */
  request(i, k, p = null, q = null) {
    const m = cleanThing({ t: 'th', i, k, n: ++this.n, ...(k === 'put' ? { p, q } : {}) }, this.cfg);
    if (!m || !this.send({ t: 'th', ...m })) return false;
    this.pending.set(m.n, m);
    return true;
  }
  /** A message from the room. Returns { state, refused } or null (not ours / malformed / older than what we hold). */
  receive(m) {
    if (m?.t !== 'th') return null;
    const s = cleanThingState(m, this.cfg);
    if (!s) return null;
    if (typeof m.no === 'string') { // our request was refused: the room's state stands
      this.pending.delete(m.n);
      this.set(s, 'refused');
      return { state: s, refused: m.no };
    }
    if (s.at < this.get(s.i).at) return null; // stale
    if (s.by === this.me()) for (const [n, r] of this.pending) if (r.i === s.i) this.pending.delete(n);
    this.set(s, 'room');
    return { state: s, refused: null };
  }
  /** The welcome's `things` list (replaces everything we knew). */
  welcome(list) {
    const next = new Map();
    for (const row of Array.isArray(list) ? list.slice(0, 400) : []) {
      if (!Array.isArray(row)) continue;
      const s = cleanThingState(row[1] === 'world' ? { i: row[0], m: 'world', by: row[2], p: row[3], q: row[4] } : { i: row[0], m: row[1], by: row[2] }, this.cfg);
      if (s) next.set(s.i, s);
    }
    const gone = [...this.state.keys()].filter((i) => !next.has(i));
    this.pending.clear();
    for (const i of gone) this.set({ i, m: 'home', at: 0, by: '' }, 'welcome');
    for (const s of next.values()) this.set(s, 'welcome');
  }
  /** The connection dropped: everything is as our own save says again. */
  reset() { const ids = [...this.state.keys()]; this.pending.clear(); for (const i of ids) this.set({ i, m: 'home', at: 0, by: '' }, 'reset'); }
}

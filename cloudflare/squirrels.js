import { SQUIRRELS as C } from '../src/config.js';
import { STATES } from '../src/squirrelsync.js';

// #1686: the squirrels and their nuts shared between the players near them. Like the pony paddock (#1644, cloudflare/paddock.js) the room
// simulates nothing and writes NOTHING to storage or KV: it keeps, in memory only, the leader's last snapshots (so a newcomer sees the
// scene at once) and the nut claims, and relays. Messages { t: 'sq', k, … } (src/squirrelsync.js documents the flow):
//   client -> room: 'on' / 'off' (the player is within C.sync.enter m of a squirrel / left beyond C.sync.leave); from the leader 's' (3 animal poses,
//   9 numbers each), 'n' (the nuts lying out, flat ints), 'f' { s, b, to, an } (a squirrel took the nut `to` held); from anybody 't' { s, b } (take
//   a nut), 'p' { s, b, x, z } (put a held nut down within C.sync.reach m of oneself).
//   room -> client: 'L' { lead, n, c? } (you lead, with n others present and the claims c = [[slot, born, owner, kind]] / you follow / off);
//   'ok' | 'no' { s, b } (the take is yours / somebody was first or the nut is not there); 'g' { s, b } (a nut was taken: gone for you);
//   to the leader 't' { s, b, i } (player i holds that nut now) and 'x' { s, b } (its holder left); everybody 'p' { s, b, x, z, kd, i },
//   's', 'n'; the others (not the leader) 'F' { an, i } (the squirrel `an` took player i's nut: i scores). Rates are bounded per connection.
// Solo players send nothing but on/off. A nut is identified by (slot, born): born counts the slot's spawns, so a stale take is refused.

const fin = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const r2 = (v) => Math.round(v * 100) / 100;
const N = () => C.maxNuts;

/** A squirrel message from a client, or null. */
export function cleanSquirrels(text) {
  let m;
  try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'sq') return null;
  switch (m.k) {
    case 'on': case 'off': return { k: m.k };
    case 's': {
      const ok = (q) => Array.isArray(q) && q.length === 9 && q.slice(0, 6).every((v) => fin(v, 5000)) && fin(q[6], 5) && int(q[7], 0, STATES.length - 1) && (q[8] === 0 || q[8] === 1);
      return Array.isArray(m.a) && m.a.length === C.animals.length && m.a.every(ok) ? { k: 's', a: m.a.map((q) => q.map((v, i) => (i < 7 ? r2(v) : v))) } : null;
    }
    case 'n': return Array.isArray(m.v) && m.v.length % 4 === 0 && m.v.length <= 4 * N() && m.v.every((v, i) => (i % 4 === 0 ? int(v, 0, 64 + 63) && (v & 63) < N() : i % 4 === 3 ? int(v, 0, 1e9) : int(v, -5e5, 5e5))) ? { k: 'n', v: m.v } : null;
    case 't': return int(m.s, 0, N() - 1) && int(m.b, 0, 1e9) ? { k: 't', s: m.s, b: m.b } : null;
    case 'p': return int(m.s, 0, N() - 1) && int(m.b, 0, 1e9) && fin(m.x, 5000) && fin(m.z, 5000) ? { k: 'p', s: m.s, b: m.b, x: r2(m.x), z: r2(m.z) } : null;
    case 'f': return int(m.s, 0, N() - 1) && int(m.b, 0, 1e9) && typeof m.to === 'string' && m.to.length <= 16 && int(m.an, 0, C.animals.length - 1) ? { k: 'f', s: m.s, b: m.b, to: m.to, an: m.an } : null;
    default: return null;
  }
}

/** The squirrel relay of one players room. `peers()` → [{ ws, a }] open sockets with their (deserialized) attachments. */
export class RoomSquirrels {
  constructor(peers, send) { this.peers = peers; this.send = send; this.reset(); }
  reset() { this.nuts = new Map(); this.claims = new Map(); this.snap = null; }
  /** The players present, `ws`'s own (not yet serialized) attachment `a` swapped in, without `except`. */
  present(ws, a, except) { return this.peers().filter((o) => o.ws !== except).map((o) => (o.ws === ws ? { ws, a } : o)).filter((o) => o.a.sq === true); }
  leader(list) { return list.find((o) => o.a.sqL === true); }
  claimList() { return [...this.claims.values()].map((c) => [c.s, c.b, c.owner, c.kind]); }
  /** Make sure the players present have a leader; tell it (and a newcomer) how things stand. */
  settle(ws, a, except, joined = false) {
    const list = this.present(ws, a, except);
    if (!list.length) { this.reset(); return; }
    let lead = this.leader(list);
    if (!lead) {
      lead = list.reduce((x, y) => ((y.a.sqAt ?? 0) < (x.a.sqAt ?? 0) ? y : x)); lead.a.sqL = true;
      if (lead.ws !== ws) lead.ws.serializeAttachment(lead.a);
    }
    this.send(lead.ws, JSON.stringify({ t: 'sq', k: 'L', lead: true, n: list.length - 1, ...(this.claims.size ? { c: this.claimList() } : {}) }));
    if (joined && lead.ws !== ws) { // a newcomer follows: the scene as the room last saw it
      this.send(ws, JSON.stringify({ t: 'sq', k: 'L', lead: false }));
      if (this.snap) this.send(ws, this.snap);
      this.send(ws, JSON.stringify({ t: 'sq', k: 'n', v: this.nutsFlat() }));
    }
  }
  nutsFlat() { const v = []; for (const [s, n] of this.nuts) v.push(s + 64 * n.kind, Math.round(n.x * 100), Math.round(n.z * 100), n.b); return v; }
  /** A state arrived: the player's own `sq` flag comes from 'on' / 'off', nothing to do on movement. */
  presence() {}
  /** A socket is gone (or about to be): its claims end, the leader is told, a new leader is made. */
  trim(ws, a) {
    if (a?.sq !== true) return;
    a.sq = false;
    const wasLead = a.sqL === true; a.sqL = false;
    const rest = this.present(null, null, ws), lead = wasLead ? null : this.leader(rest);
    for (const [key, c] of [...this.claims]) if (c.owner === a.i) { this.claims.delete(key); if (lead) this.send(lead.ws, JSON.stringify({ t: 'sq', k: 'x', s: c.s, b: c.b })); }
    this.settle(null, null, ws);
  }
  handle(ws, a, m, now = Date.now()) {
    if (m.k === 'on') { if (a.sq !== true) { a.sq = true; a.sqL = false; a.sqAt = now; this.settle(ws, a, null, true); } return; }
    if (m.k === 'off') { if (a.sq === true) { this.trim(ws, a); this.send(ws, JSON.stringify({ t: 'sq', k: 'L', off: true })); } return; }
    if (a.sq !== true) return;
    const key = `${m.s}:${m.b}`, others = (except) => this.present(ws, a, except);
    const lead = a.sqL === true;
    if (m.k === 's' || m.k === 'n') {
      if (!lead) return;
      const every = (m.k === 's' ? C.sync.every : C.sync.nutEvery) * 800, f = `sq${m.k}`;
      if (now - (a[f] ?? 0) < every) return;
      a[f] = now;
      const out = JSON.stringify({ t: 'sq', ...m });
      if (m.k === 's') this.snap = out;
      else { this.nuts = new Map(); for (let i = 0; i < m.v.length; i += 4) { const s = m.v[i] & 63; if (![...this.claims.values()].some((c) => c.s === s)) this.nuts.set(s, { kind: m.v[i] >> 6, x: m.v[i + 1] / 100, z: m.v[i + 2] / 100, b: m.v[i + 3] }); } }
      for (const o of others(ws)) this.send(o.ws, out);
      return;
    }
    if (m.k === 't') {
      const nut = this.nuts.get(m.s);
      if (!nut || nut.b !== m.b || this.claims.has(key)) return this.send(ws, JSON.stringify({ t: 'sq', k: 'no', s: m.s, b: m.b }));
      this.claims.set(key, { s: m.s, b: m.b, owner: a.i, kind: nut.kind }); this.nuts.delete(m.s);
      this.send(ws, JSON.stringify({ t: 'sq', k: 'ok', s: m.s, b: m.b }));
      const g = JSON.stringify({ t: 'sq', k: 'g', s: m.s, b: m.b }), t = JSON.stringify({ t: 'sq', k: 't', s: m.s, b: m.b, i: a.i });
      for (const o of others(ws)) this.send(o.ws, o.a.sqL === true ? t : g);
      return;
    }
    if (m.k === 'p') {
      const c = this.claims.get(key), p = a.s?.p;
      if (!c || c.owner !== a.i || !p || Math.hypot(p[0] - m.x, p[2] - m.z) > C.sync.reach) return;
      this.claims.delete(key); this.nuts.set(m.s, { kind: c.kind, x: m.x, z: m.z, b: m.b });
      const out = JSON.stringify({ t: 'sq', k: 'p', s: m.s, b: m.b, x: m.x, z: m.z, kd: c.kind, i: a.i });
      for (const o of others(ws)) this.send(o.ws, out);
      return;
    }
    if (m.k === 'f') { // leader: a squirrel took `to`'s nut
      const c = this.claims.get(key);
      if (!lead || !c || c.owner !== m.to) return;
      this.claims.delete(key);
      const out = JSON.stringify({ t: 'sq', k: 'F', an: m.an, i: m.to });
      for (const o of others(ws)) this.send(o.ws, out);
    }
  }
}

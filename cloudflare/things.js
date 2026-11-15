import { THING_SYNC } from '../src/config.js';
import { cleanThing, thingId, cleanPlace, cleanTurn } from '../src/thingsync.js';

// #1974 (part of #1964): loose things shared between the players: who holds a thing, or where it lies. The protocol is in
// src/thingsync.js. #1978 (the user, 2026-11-15: the shared world is kept between visits): where things LIE is saved in the room's
// existing Durable Object storage (one value, key 'things': { v: 1, rows: [[i, by, p, q, at], …] }, at most one row per id, so bounded
// by THING_SYNC.max), written BEFORE the change is confirmed or broadcast; a failed write refuses the request and changes nothing
// (the pattern of cloudflare/sharedfish.js, #1855). A lying thing nobody has touched for THING_SYNC.keepDays days goes home by
// itself. What a connection HOLDS is never stored: it is in memory and in its socket attachment (`th`: a short list of ids), so a
// room that wakes from hibernation still knows who holds what, and what a player held when they left goes home.
// The rules: a thing held by a connected player cannot be taken or moved by anybody else (the first 'take' the room gets wins, the
// other is refused); anybody may take a thing that lies in the world (from within THING_SYNC.reach m of it) or that is at home; only
// its holder may put it down (within reach of where they stand) or send it home; when a player leaves, what they held goes home.

/** A thing message from a client (text), or null. */
export function cleanThingText(text) {
  try { return cleanThing(JSON.parse(text)); } catch { return null; }
}

export class RoomThings {
  /** ctx: the Durable Object's (storage); send(ws, text); peers(): [{ ws, a }] the open connections with their attachments;
   *  save(ws, a): write the attachment back; clock(): ms. */
  constructor(ctx, send, peers, save = () => {}, clock = () => Date.now()) {
    Object.assign(this, { ctx, send, peers, save, clock, state: new Map(), woke: false, chain: Promise.resolve() }); // id -> { m, at, by, p?, q? }
    this.ready = Promise.resolve(ctx?.storage?.get('things')).then((saved) => {
      if (saved?.v !== 1 || !Array.isArray(saved.rows)) return;
      for (const r of saved.rows.slice(0, 1000)) {
        if (!Array.isArray(r) || !thingId(r[0]) || this.state.has(r[0])) continue;
        const p = cleanPlace(r[2]), q = cleanTurn(r[3]);
        if (p && q && Number.isFinite(r[4])) this.state.set(r[0], { m: 'world', at: r[4], by: typeof r[1] === 'string' ? r[1].slice(0, 16) : '', p, q });
      }
    }).catch(() => { /* an unreadable save: start with everything at home */ });
  }
  /** One change after another, each after the saved state is loaded. */
  enqueue(fn) { const work = this.chain.then(async () => { await this.ready; return fn(); }); this.chain = work.catch(() => {}); return work; }
  flush() { return this.chain; }
  rows(state = this.state) { const out = []; for (const [i, e] of state) if (e.m === 'world') out.push([i, e.by, e.p, e.q, e.at]); return out; }
  /** Write where things lie; throws when the storage does. */
  async commit(state) { if (this.ctx?.storage) await this.ctx.storage.put('things', { v: 1, rows: this.rows(state) }); }
  /** After a hibernation the map holds only what was saved: what the connections hold is in their attachments. */
  wake() {
    if (this.woke) return;
    this.woke = true;
    for (const { a } of this.peers()) for (const i of Array.isArray(a?.th) ? a.th : []) if (this.state.get(i)?.m !== 'held') this.state.set(i, { m: 'held', at: (this.state.get(i)?.at ?? 0) + 1, by: a.i });
  }
  /** Lying things nobody touched for THING_SYNC.keepDays days go home (saved; told to whoever is here). */
  async expire(now) {
    const old = [...this.state].filter(([, e]) => e.m === 'world' && now - e.at > THING_SYNC.keepDays * 864e5);
    if (!old.length) return;
    const next = new Map(this.state); for (const [i] of old) next.delete(i);
    try { await this.commit(next); } catch { return; }
    this.state = next;
    for (const [i, e] of old) { const out = JSON.stringify({ t: 'th', i, m: 'home', at: Math.max(now, e.at + 1), by: '' }); for (const { ws } of this.peers()) this.send(ws, out); }
  }
  /** The things that are not at home, for the welcome. */
  welcome(now = this.clock()) {
    return this.enqueue(async () => {
      this.wake(); await this.expire(now);
      const out = [];
      for (const [i, e] of this.state) out.push(e.m === 'held' ? [i, 'held', e.by] : [i, 'world', e.by, e.p, e.q]);
      return out;
    });
  }
  /** The room is empty: nobody holds anything any more; what lies stays (it is saved). */
  reset() { for (const [i, e] of [...this.state]) if (e.m === 'held') this.state.delete(i); this.woke = true; }
  row(i, e) { return { i, m: e.m, at: e.at, by: e.by, ...(e.m === 'world' ? { p: e.p, q: e.q } : {}) }; }
  near(a, p, reach = THING_SYNC.reach) { const s = a?.s?.p; return !Array.isArray(s) || Math.hypot(s[0] - p[0], s[1] - p[1], s[2] - p[2]) <= reach; } // (no position yet: not refused)
  handle(ws, a, m, now = this.clock()) { return this.enqueue(() => this.transact(ws, a, m, now)); }
  async transact(ws, a, m, now) {
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
    } else if (m.k === 'put') { if (!this.near(a, m.p, THING_SYNC.putReach?.[m.i[0]])) why = 'far'; } // (a thrown ball lands further off)
    else if (old.m === 'world' && old.by !== a.i && !this.near(a, old.p)) why = 'far'; // 'home' of a thing lying somewhere: only from beside it
    const at = Math.max(now, old.at + 1); // the room's clock never goes back per thing
    const next = m.k === 'take' ? { m: 'held', at, by: a.i } : m.k === 'put' ? { m: 'world', at, by: a.i, p: m.p, q: m.q } : { m: 'home', at, by: a.i };
    if (!why && (old.m === 'world' || next.m === 'world')) { // where things lie changes: saved before anybody hears of it
      const after = new Map(this.state); if (next.m === 'home') after.delete(m.i); else after.set(m.i, next);
      try { await this.commit(after); } catch { why = 'save'; }
    }
    if (why) { this.send(ws, JSON.stringify({ t: 'th', ...this.row(m.i, old), no: why, n: m.n })); return; }
    if (next.m === 'home') this.state.delete(m.i); else this.state.set(m.i, next);
    const th = next.m === 'held' ? [...mine.filter((x) => x !== m.i), m.i] : mine.filter((x) => x !== m.i);
    if (th.length !== mine.length || next.m === 'held') { a.th = th; this.save(ws, a); }
    const out = JSON.stringify({ t: 'th', ...this.row(m.i, next) });
    for (const { ws: x } of this.peers()) this.send(x, out);
  }
  /** A connection left: what it held goes home for everybody (nothing held is saved, so nothing is written). */
  leave(a, now = this.clock()) {
    return this.enqueue(() => {
      this.wake();
      if (!a?.i) return;
      for (const [i, e] of [...this.state]) {
        if (e.m !== 'held' || e.by !== a.i) continue;
        this.state.delete(i);
        const out = JSON.stringify({ t: 'th', i, m: 'home', at: Math.max(now, e.at + 1), by: a.i });
        for (const { ws, a: b } of this.peers()) if (b?.i !== a.i) this.send(ws, out);
      }
    });
  }
}

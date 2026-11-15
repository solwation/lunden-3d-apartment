import { LIFE_SYNC } from '../src/config.js';
import { cleanLifeRecord, cleanLifePlace, lifeKey, cleanMessRow, messKey } from '../src/lifesync.js';

// #1981 (part of #1964): the life simulator's things (food, dishes, laundry, rubbish) as ONE kitchen for the room. The protocol is
// in src/lifesync.js. The room keeps a record per instance and who holds it; it asks no game rule, only what keeps the kitchen whole:
//   - an instance held by a connected player cannot be changed, moved or removed by anybody else (the first batch the room gets
//     wins; the other is refused whole and gets the room's state back);
//   - one thing per slot / carrier spot; a carrier exists before what lies on it, and is not removed from under it;
//   - at most LIFE_SYNC.max instances, LIFE_SYNC.held held per connection.
// When a player leaves (or the room wakes without them), what they held goes back to where it was taken from if that is still free,
// else to where they stood, else it is gone with what lay on it (the kitchen's stock comes back by itself, life.js `restock`).
// Saved (the user, 2026-11-15: the shared world is kept between visits) in the room's Durable Object storage BEFORE a change is
// confirmed: LIFE_SYNC.chunks values `li0` … (rows [record, holder | 0, where it was taken from | 0], spread by id so a change writes
// only its own chunks) and `lim` { v: 1, at } (when the kitchen was last touched, written at most once a day): untouched for
// LIFE_SYNC.keepDays days it starts over empty, and the next player brings their own.

const hash = (id) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % LIFE_SYNC.chunks; };

export class RoomLife {
  /** ctx: the Durable Object's (storage); send(ws, text); peers(): [{ ws, a }] the open connections with their attachments; clock(): ms. */
  constructor(ctx, send, peers, clock = () => Date.now()) {
    Object.assign(this, { ctx, send, peers, clock, state: new Map(), parts: new Map(), mess: new Map(), touched: 0, chain: Promise.resolve() }); // id -> { e, h, pv }; parts: name -> JSON text; mess: key -> spot row (#1990)
    this.ready = (async () => {
      const st = ctx?.storage;
      if (!st) return;
      const meta = await st.get('lim');
      this.touched = meta?.v === 1 && Number.isFinite(meta.at) ? meta.at : 0;
      const ms = await st.get('lim2');
      if (ms?.v === 1 && Array.isArray(ms.s)) for (const r of ms.s.slice(0, 200)) { const row = cleanMessRow(r, 0.001, 1); if (row) this.mess.set(messKey(row), row); }
      const px = await st.get('lix');
      if (px?.v === 1 && Array.isArray(px.p)) for (const r of px.p.slice(0, 32)) if (Array.isArray(r) && LIFE_SYNC.parts.includes(r[0]) && typeof r[1] === 'string' && r[1].length <= LIFE_SYNC.part) this.parts.set(r[0], r[1]);
      for (let c = 0; c < LIFE_SYNC.chunks; c++) {
        const rows = await st.get(`li${c}`);
        for (const r of Array.isArray(rows) ? rows.slice(0, LIFE_SYNC.max) : []) {
          const e = Array.isArray(r) ? cleanLifeRecord(r[0]) : null;
          if (e && this.state.size < LIFE_SYNC.max && !this.state.has(e.id)) this.state.set(e.id, { e, h: typeof r[1] === 'string' ? r[1] : null, pv: cleanLifePlace(r[2]) });
        }
      }
    })().catch(() => { /* an unreadable save: an empty kitchen */ });
  }
  enqueue(fn) { const work = this.chain.then(async () => { await this.ready; return fn(); }); this.chain = work.catch(() => {}); return work; }
  flush() { return this.chain; }
  row(i, s = this.state) { const v = s.get(i); return [v.e, v.h ?? 0]; }
  /** Write the chunks holding `ids` as `state` has them; throws when the storage does. */
  async commit(state, ids, now) {
    const st = this.ctx?.storage;
    if (!st) return;
    const chunks = new Set([...ids].map(hash));
    for (const c of chunks) { const rows = []; for (const [i, v] of state) if (hash(i) === c) rows.push([v.e, v.h ?? 0, v.pv ?? 0]); await st.put(`li${c}`, rows); }
    if (now - this.touched > 864e5) { await st.put('lim', { v: 1, at: now }); this.touched = now; }
  }
  /** Is the whole of `state` sound where `ids` are concerned? '' or why not. */
  check(state, ids) {
    if (state.size > LIFE_SYNC.max) return 'full';
    const keys = new Map();
    for (const [i, v] of state) { const k = lifeKey(v.e.place); if (!k) continue; if (keys.has(k) && (ids.has(i) || ids.has(keys.get(k)))) return 'full'; keys.set(k, i); }
    for (const [i, v] of state) {
      if (v.e.place.at !== 'on') continue;
      let p = v.e.place, n = 0, touched = ids.has(i);
      while (p.at === 'on') { // up the carriers: each exists, no loop
        const par = state.get(p.parent);
        if (!par || ++n > 16) { if (touched || ids.has(p.parent)) return 'bad'; break; }
        if (ids.has(p.parent)) touched = true;
        p = par.e.place;
      }
    }
    return '';
  }
  /** What nobody here holds any more is put down: where it came from, else at `feet`, else gone (with what lies on it). Returns
   *  { state, ids } to commit and tell, or null when nothing changed. */
  released(feet = null, gone = null) {
    const live = new Set(this.peers().map((p) => p.a?.i)); if (gone) live.delete(gone);
    const lost = [...this.state].filter(([, v]) => v.h && !live.has(v.h));
    if (!lost.length) return null;
    const next = new Map(this.state), ids = new Set();
    const taken = () => new Set([...next.values()].map((v) => lifeKey(v.e.place)).filter(Boolean));
    for (const [i, v] of lost) {
      const keys = taken(), pv = v.pv && (lifeKey(v.pv) ? !keys.has(lifeKey(v.pv)) && (v.pv.at !== 'on' || next.has(v.pv.parent)) : true) ? v.pv : null;
      const place = pv ?? (feet ? cleanLifePlace({ at: 'world', pos: feet, yaw: 0 }) : null);
      ids.add(i);
      if (place) next.set(i, { e: { ...v.e, place }, h: null, pv: null });
      else { const drop = [i]; while (drop.length) { const d = drop.pop(); next.delete(d); ids.add(d); for (const [j, w] of next) if (w.e.place.at === 'on' && w.e.place.parent === d) drop.push(j); } }
    }
    return { state: next, ids };
  }
  tell(by, n, state, ids, only = null, no = null) {
    const s = [], x = [];
    for (const i of ids) if (state.has(i)) s.push(this.row(i, state)); else x.push(i);
    const out = JSON.stringify({ t: 'li', ...(no ? { no } : { by }), n, s, x });
    if (only) this.send(only, out); else for (const { ws } of this.peers()) this.send(ws, out);
  }
  async sweep(now, feet = null, gone = null) {
    if (this.state.size && now - this.touched > LIFE_SYNC.keepDays * 864e5 && this.touched) { // long untouched: starts over
      try { const all = new Set(this.state.keys()); await this.ctx?.storage?.put('lix', { v: 1, p: [] }); await this.ctx?.storage?.put('lim2', { v: 1, s: [] }); await this.commit(new Map(), all, now); this.state = new Map(); this.parts = new Map(); this.mess = new Map(); } catch { /* next time */ }
      return;
    }
    const r = this.released(feet, gone);
    if (!r) return;
    try { await this.commit(r.state, r.ids, now); } catch { return; }
    this.state = r.state;
    this.tell('', 0, r.state, r.ids);
  }
  /** The whole kitchen to a new connection, in pages. */
  welcome(ws, now = this.clock()) {
    return this.enqueue(async () => {
      await this.sweep(now);
      const rows = [...this.state.keys()].map((i) => this.row(i));
      for (let k = 0; k === 0 || k < rows.length; k += LIFE_SYNC.page) this.send(ws, JSON.stringify({ t: 'li', k: 'a', ...(k === 0 ? { f: 1 } : {}), ...(k + LIFE_SYNC.page >= rows.length ? { z: 1 } : {}), r: rows.slice(k, k + LIFE_SYNC.page) }));
    });
  }
  /** What the room has of the home's other state (after the kitchen's pages). */
  partsWelcome(ws) { return this.enqueue(() => this.send(ws, JSON.stringify({ t: 'lx', k: 'a', p: [...this.parts] }))); }
  /** A part's new word { k, d }: saved, then told to the others. Too fast or a failed save: dropped (the sender's next change says it again). */
  part(ws, a, m, now = this.clock()) {
    return this.enqueue(async () => {
      if (now - (a.lxAt ?? 0) < LIFE_SYNC.partEvery * 1000 * 0.6) return;
      a.lxAt = now;
      if (this.parts.get(m.k) === m.d) return;
      const next = new Map(this.parts); next.set(m.k, m.d);
      try { await this.ctx?.storage?.put('lix', { v: 1, p: [...next] }); if (now - this.touched > 864e5) { await this.ctx?.storage?.put('lim', { v: 1, at: now }); this.touched = now; } } catch { return; }
      this.parts = next;
      const out = JSON.stringify({ t: 'lx', k: m.k, d: m.d, by: a.i });
      for (const { ws: x } of this.peers()) if (x !== ws) this.send(x, out);
    });
  }
  /** #1990: every spot of crumbs / dust to a new connection (`e`: nothing is kept yet at all: bring your own). */
  messWelcome(ws) { return this.enqueue(() => this.send(ws, JSON.stringify({ t: 'lm', k: 'a', s: [...this.mess.values()], ...(!this.state.size && !this.mess.size ? { e: 1 } : {}) }))); }
  /** #1990: amounts added to / taken from spots (rows with a delta): saved, then the touched spots as they are now go to everybody.
   *  A new spot past its kind's cap is not made (the sender hears amt 0). Too fast / a failed save: the sender gets the room's word. */
  messy(ws, a, ops, now = this.clock()) {
    return this.enqueue(async () => {
      const slow = now - (a.lmAt ?? 0) < LIFE_SYNC.messEvery * 1000 * 0.6;
      a.lmAt = now;
      const next = new Map(this.mess), keys = new Set(), count = (k) => { let n = 0; for (const r of next.values()) if (r[0] === k) n++; return n; };
      for (const r of ops) {
        const key = messKey(r), cur = next.get(key);
        keys.add(key);
        if (slow) continue;
        if (cur) { const amt = Math.round(Math.min(1, cur[7] + r[7]) * 1000) / 1000; if (amt <= 0.001) next.delete(key); else next.set(key, [...cur.slice(0, 7), amt, cur[8]]); }
        else if (r[7] > 0.001 && count(r[0]) < LIFE_SYNC.messMax[r[0]]) next.set(key, r);
      }
      let ok = !slow;
      if (ok) { try { await this.ctx?.storage?.put('lim2', { v: 1, s: [...next.values()] }); } catch { ok = false; } }
      if (ok) this.mess = next;
      const gone = (key) => { const p = key.split('|'); return [p[0], +p[1], +p[2], +p[3], +p[4], 'floor', null, 0, 0]; };
      const out = JSON.stringify({ t: 'lm', s: [...keys].map((k) => this.mess.get(k) ?? gone(k)) });
      if (ok) for (const { ws: x } of this.peers()) this.send(x, out); else this.send(ws, out);
    });
  }
  handle(ws, a, m, now = this.clock()) { return this.enqueue(() => this.transact(ws, a, m, now)); }
  async transact(ws, a, m, now) {
    await this.sweep(now);
    const ids = new Set([...m.s.map((e) => e.id), ...m.x]);
    let why = now - (a.liAt ?? 0) < LIFE_SYNC.every * 1000 * 0.6 ? 'slow' : '';
    a.liAt = now;
    const next = new Map(this.state);
    if (!why) {
      for (const i of ids) { const old = this.state.get(i); if (old?.h && old.h !== a.i) { why = 'held'; break; } } // (sweep: every holder left in the state is here)
      for (const e of m.s) {
        const old = this.state.get(e.id), hand = e.place.at === 'hand';
        next.set(e.id, { e, h: hand ? a.i : null, pv: hand ? (old && old.e.place.at !== 'hand' ? old.e.place : old?.pv ?? null) : null });
      }
      for (const i of m.x) next.delete(i);
      if (!why) why = this.check(next, ids);
      if (!why && [...next.values()].filter((v) => v.h === a.i).length > LIFE_SYNC.held) why = 'full';
      if (!why) { try { await this.commit(next, ids, now); } catch { why = 'save'; } }
    }
    if (why) { this.tell('', m.n, this.state, ids, ws, why); return; }
    this.state = next;
    this.tell(a.i, m.n, next, ids);
  }
  /** A connection left: what it held is put down (at its feet when its old place is taken). */
  leave(a, now = this.clock()) { return this.enqueue(() => (a?.i ? this.sweep(now, Array.isArray(a.s?.p) ? a.s.p : null, a.i) : null)); }
}

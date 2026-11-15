import { LIFE_SYNC } from './config.js';
import { cleanLifeRecord, cleanLifeRows, cleanMessRow, messKey } from './lifesync.js';

// #1981 (part of #1964): the life simulator's things (items.js: food, dishes, laundry, rubbish) follow the room's ONE kitchen
// (the protocol: src/lifesync.js; the room: cloudflare/life.js). No three.js: `node --test src/lifeshare.test.mjs`.
//   - Joining: the room sends the whole kitchen and ours becomes it (what we carry stays in our hand and is told to the room). An
//     empty room gets our own kitchen instead.
//   - Our own changes (the items' events: made, moved, changed, gone) are gathered and sent as one batch at most every
//     LIFE_SYNC.every s. The room takes a batch whole or refuses it whole; refused, our things go back to what the room says.
//   - What somebody else holds is not in our kitchen at all (nor what lies on it) until they put it down.
// `shadow` is the room's word (id -> { e: record, h: holder | null }); `dirty` our changes not sent yet; `pending` batches on
// their way. An instance with a change of ours under way is left alone; everything else is made to match the shadow.
// Offline / before the room's kitchen has arrived nothing is sent and the own saved kitchen decides, as before.

const HELD = (p) => !p || (p.at !== 'world' && p.at !== 'slot' && p.at !== 'on');

/** #1981: the home's state that is no instance (life.js `keepPart`: the dishwasher's and the laundry machines' programmes, made
 *  beds, watered plants, the milk) shared whole per part; the last word wins. A part: { save() → JSON | null, load(v), sig?(v) →
 *  what counts as a change (a programme's countdown does not: each client counts for itself) }. On joining, the room's word is
 *  loaded; what the room does not have yet is told from ours. */
export class LifeParts {
  constructor({ connected = () => false, send = () => false, now = () => performance.now() / 1000, cfg = LIFE_SYNC }) {
    Object.assign(this, { connected, send, now, cfg, parts: new Map(), last: new Map(), live: false, sentAt: -1e9 });
  }
  add(name, part) { if (this.cfg.parts.includes(name) && part) this.parts.set(name, part); }
  sig(name) { const p = this.parts.get(name), v = p.save() ?? null; return p.sig ? p.sig(v) : JSON.stringify(v); }
  put(name, d) { const p = this.parts.get(name); if (!p) return; let v; try { v = JSON.parse(d); } catch { return; } p.load(v); this.last.set(name, this.sig(name)); }
  receive(m) {
    if (m?.t !== 'lx') return;
    if (m.k === 'reset') { this.live = false; return; }
    if (m.k === 'a') {
      const have = new Map((Array.isArray(m.p) ? m.p : []).filter((r) => Array.isArray(r) && typeof r[1] === 'string'));
      for (const name of this.parts.keys()) { if (have.has(name)) this.put(name, have.get(name)); else this.last.set(name, JSON.stringify(null) === JSON.stringify(this.parts.get(name).save() ?? null) ? this.sig(name) : ''); } // (ours, when it says anything, is told)
      this.live = true;
    } else if (this.live && typeof m.d === 'string') this.put(m.k, m.d);
  }
  /** Per frame: a changed part is told, one at a time. */
  update() {
    if (!this.connected()) { this.live = false; return; }
    if (!this.live || this.now() - this.sentAt < this.cfg.partEvery) return;
    for (const [name, p] of this.parts) {
      const s = this.sig(name);
      if (s === this.last.get(name)) continue;
      const d = JSON.stringify(p.save() ?? null);
      if (d.length <= this.cfg.part && /^[\x20-\x7e]+$/.test(d) && !this.send({ t: 'lx', k: name, d })) return; // (cannot go now: next frame)
      this.last.set(name, s); this.sentAt = this.now();
      return;
    }
  }
}

/** #1990: crumbs, dust and smears (src/mess.js `spots`) follow the room's. A spot is its place (lifesync.js `messKey`); what we
 *  add or take is sent as a change of amount per spot, and the room's word about a spot (plus whatever of ours is not sent yet)
 *  is what lies here. `known`: key -> the amount the room has, as far as we have heard (and what we have sent). */
export class MessShare {
  /** mess: the Mess (spots, redraw()); connected(); send(m); changed(): after the room changed our spots (save, redraw …). */
  constructor({ mess, connected = () => false, send = () => false, changed = () => {}, now = () => performance.now() / 1000, cfg = LIFE_SYNC }) {
    Object.assign(this, { mess, connected, send, changed, now, cfg, known: new Map(), live: false, sentAt: -1e9 });
  }
  row(s, v) { return [s.kind, s.level, s.x, s.y, s.z, s.surf, s.room, v, s.rot]; }
  local() { const m = new Map(); for (const s of this.mess.spots) m.set(messKey(this.row(s, 0)), s); return m; }
  /** The room says spot `r` holds r[7] now: here it is that, plus what we have changed and not sent. */
  set(r, here) {
    const key = messKey(r), s = here.get(key), ours = (s?.amt ?? 0) - (this.known.get(key) ?? 0), amt = Math.min(1, r[7] + ours);
    if (r[7] > 0) this.known.set(key, r[7]); else this.known.delete(key);
    if (amt <= 0.001) { if (s) { this.mess.spots = this.mess.spots.filter((x) => x !== s); here.delete(key); } return; }
    if (s) s.amt = amt;
    else { const n = { kind: r[0], level: r[1], x: r[2], y: r[3], z: r[4], surf: r[5], room: r[6], amt, rot: r[8] }; this.mess.spots.push(n); here.set(key, n); }
  }
  receive(m) {
    if (m?.t !== 'lm') return;
    if (m.k === 'reset') { this.live = false; return; }
    const rows = (Array.isArray(m.s) ? m.s : []).map((r) => cleanMessRow(r, 0, 1, this.cfg)).filter(Boolean);
    if (m.k === 'a') {
      this.known.clear();
      if (!m.e) { this.mess.spots = []; const here = new Map(); for (const r of rows) this.set(r, here); } // the room's mess replaces ours (a new room takes ours: sent as additions)
      this.live = true;
    } else if (this.live) { const here = this.local(); for (const r of rows) this.set(r, here); }
    else return;
    this.mess.redraw(); this.changed();
  }
  /** Per frame: what we added / took since the last time, as changes of amount. */
  update() {
    if (!this.connected()) { this.live = false; return; }
    if (!this.live || this.now() - this.sentAt < this.cfg.messEvery) return;
    const here = this.local(), o = [];
    for (const [key, s] of here) { const d = Math.round((s.amt - (this.known.get(key) ?? 0)) * 1000) / 1000; if (d !== 0) o.push([key, this.row(s, Math.max(-1, Math.min(1, d))), s.amt]); }
    for (const [key, v] of this.known) if (!here.has(key)) { const p = key.split('|'); o.push([key, [p[0], +p[1], +p[2], +p[3], +p[4], 'floor', null, -Math.min(1, v), 0], 0]); }
    if (!o.length) return;
    const batch = o.slice(0, this.cfg.messOps);
    if (!this.send({ t: 'lm', o: batch.map((x) => x[1]) })) return;
    for (const [key, , amt] of batch) { if (amt > 0) this.known.set(key, amt); else this.known.delete(key); }
    this.sentAt = this.now();
  }
}

export class LifeShare {
  /** items: the Items; connected(); send(m): false when it cannot go now; me(): our connection's id; say(text); now(): s. */
  constructor({ items, connected = () => false, send = () => false, me = () => '', say = () => {}, now = () => performance.now() / 1000, cfg = LIFE_SYNC }) {
    Object.assign(this, { items, connected, send, me, say, now, cfg, shadow: new Map(), dirty: new Set(), pending: new Map(), page: null, live: false, applying: false, n: 0, sentAt: -1e9, serial: 0, tries: new Map(), own: new Set() }); // `tries`: id -> refusals in a row; `own`: instances the wire cannot carry (ours alone)
    this.tag = Math.floor(Math.random() * 9e5 + 1e5) * 1000; // our own range of new ids while in a room (#1981: two clients never make the same id)
    items.on((kind, item) => { if (!this.applying) this.dirty.add(item.id); });
  }
  mine(id) { const it = this.items.get(id); return !!it && HELD(it.place); }
  busy(id) { if (this.dirty.has(id) || this.own.has(id)) return true; for (const b of this.pending.values()) if (b.has(id)) return true; return false; }
  /** Is `id` out of sight here: held by somebody else, or riding on something that is (or on nothing at all)? */
  hidden(id) {
    for (let v = this.shadow.get(id), n = 0; v && n < 20; n++) {
      if (v.e.place.at === 'hand') return v.h !== this.me();
      if (v.e.place.at !== 'on') return false;
      v = this.shadow.get(v.e.place.parent);
    }
    return true;
  }
  depth(id) { let n = 0; for (let v = this.shadow.get(id); v?.e.place.at === 'on' && n < 20; n++) v = this.shadow.get(v.e.place.parent); return n; }
  /** Make our instances match the room's (those with a change of ours under way are left). */
  reconcile() {
    const I = this.items;
    this.applying = true;
    try {
      for (const it of I.all()) { // gone from the room, or out of sight: gone here
        if (!I.get(it.id) || this.busy(it.id) || (HELD(it.place) && this.shadow.get(it.id)?.h === this.me())) continue;
        if (!this.shadow.has(it.id) || this.hidden(it.id)) I.remove(it, { cascade: true });
      }
      const rows = [...this.shadow.values()].sort((a, b) => this.depth(a.e.id) - this.depth(b.e.id));
      for (const { e, h } of rows) {
        if (this.busy(e.id) || this.hidden(e.id)) continue;
        if (e.place.at === 'hand') { if (h === this.me() && I.get(e.id) && !this.mine(e.id)) this.dirty.add(e.id); continue; } // (the room says we hold it and we have put it down: tell it where)
        if (e.place.at === 'on' && !I.get(e.place.parent)) continue; // (its carrier is busy: next time)
        I.adopt(e);
      }
    } finally { this.applying = false; }
  }
  /** A `li` message from the room. */
  receive(m) {
    if (m?.t !== 'li') return;
    if (m.k === 'reset') { this.live = false; this.page = null; return; } // a new connection: the room's kitchen is on its way
    if (m.k === 'a') { // the whole kitchen, in pages
      if (m.f) this.page = new Map();
      if (!this.page) return;
      for (const r of cleanLifeRows(m.r, this.cfg)) this.page.set(r.e.id, r);
      if (m.z) this.welcome();
      return;
    }
    if (!this.live) return;
    const mine = m.by === this.me() || typeof m.no === 'string', sent = mine ? this.pending.get(m.n) : null;
    if (mine) this.pending.delete(m.n);
    for (const id of sent ?? []) { // refused for another reason than "somebody holds it" (a batch cut in two, too fast): once more, then the room's word stands
      const t = typeof m.no === 'string' && m.no !== 'held' ? (this.tries.get(id) ?? 0) + 1 : 0;
      if (t > 0 && t <= 2) { this.tries.set(id, t); this.dirty.add(id); } else this.tries.delete(id);
    }
    for (const r of cleanLifeRows(m.s, this.cfg)) this.shadow.set(r.e.id, r);
    for (const i of Array.isArray(m.x) ? m.x : []) this.shadow.delete(i);
    if (m.no === 'held') this.say('Någon annan hann före');
    this.reconcile();
  }
  /** The room's kitchen has arrived: ours becomes it; an empty room gets ours. What we carry stays ours. */
  welcome() {
    const I = this.items;
    this.shadow = this.page; this.page = null; this.pending.clear(); this.dirty.clear(); this.tries.clear(); this.own.clear();
    I.mint = (type) => `${type}#${this.tag + ++this.serial}`;
    if (!this.shadow.size) for (const it of I.all()) this.dirty.add(it.id); // an empty room: our kitchen is the room's from now on
    else {
      const keep = new Set(); // what is in our hand (and on it): ours, told to the room
      for (const it of I.all()) if (HELD(it.place)) { keep.add(it.id); for (const d of I.descendants(it)) keep.add(d.id); }
      for (const i of keep) this.dirty.add(i);
      this.reconcile();
    }
    this.live = true;
  }
  /** Per frame: send what changed, one batch at a time. */
  update() {
    if (!this.connected()) { if (this.live) { this.live = false; this.pending.clear(); this.dirty.clear(); this.own.clear(); this.page = null; this.items.mint = null; } return; }
    if (!this.live) return;
    for (const [n, b] of this.pending) if (this.now() - b.at > 10) { this.pending.delete(n); for (const id of b) this.dirty.add(id); } // (never answered: lost on the way; once more)
    if (!this.dirty.size || this.now() - this.sentAt < this.cfg.every) return;
    const s = [], x = [], ids = new Set(), I = this.items;
    let bytes = 40;
    // carriers before what lies on them; what is gone last, the deepest first (the room wants a carrier while something lies on it)
    const order = [...this.dirty].map((id) => [id, I.get(id) ? I.ancestors(id).length : 100 - this.depth(id)]).sort((a, b) => a[1] - b[1]);
    for (const [id] of order) {
      const it = this.items.get(id);
      if (it) {
        const e = cleanLifeRecord(this.items.record(it), this.cfg);
        if (!e) { this.dirty.delete(id); this.own.add(id); continue; } // (not a thing the wire can carry: stays our own)
        this.own.delete(id);
        const len = JSON.stringify(e).length + 1;
        if (bytes + len > this.cfg.maxBytes - 200) break;
        const was = this.shadow.get(id);
        if (was && was.h === (e.place.at === 'hand' ? this.me() : null) && JSON.stringify(was.e) === JSON.stringify(e)) { this.dirty.delete(id); continue; } // (nothing new)
        bytes += len; s.push(e);
      } else if (this.shadow.has(id)) { bytes += id.length + 4; x.push(id); }
      else { this.dirty.delete(id); continue; }
      ids.add(id);
      if (ids.size >= this.cfg.ops) break;
    }
    if (!ids.size) return;
    const n = ++this.n;
    if (!this.send({ t: 'li', n, ...(s.length ? { s } : {}), ...(x.length ? { x } : {}) })) { this.n--; return; }
    for (const id of ids) this.dirty.delete(id);
    ids.at = this.sentAt = this.now(); this.pending.set(n, ids);
  }
  state() { return { live: this.live, shadow: this.shadow.size, dirty: this.dirty.size, pending: this.pending.size, local: this.items.all().length }; }
}

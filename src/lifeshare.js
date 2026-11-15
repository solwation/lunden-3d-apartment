import { LIFE_SYNC } from './config.js';
import { cleanLifeRecord, cleanLifeRows } from './lifesync.js';

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

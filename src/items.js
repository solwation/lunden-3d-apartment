// The life simulator's things as data (#366, LIFE-002): item definitions (types, ITEMS in config) and instances with a
// stable id and independent properties. Plain data and logic, no three.js: the 3D side (life.js, a Holdable per instance)
// only shows what is here, and tools/itemtest.html tests it without rendering.
//
// An instance: { id ('cucumber#3'), type, place, amount, pkg, prep, clean, machine, home }
//   place  — exactly one of
//            { at: 'world', pos: [x, y, z], yaw }        lying / standing somewhere (a worktop, a table, the floor)
//            { at: 'hand' }                             in the visitor's hand (one at a time)
//            { at: 'slot', store, slot }                in a store's slot (the fridge, a drawer …, #369)
//            { at: 'on', parent, slot }                 on a carrier (a plate, the cutting board, #370)
//   amount — in the type's unit ('g' | 'ml' | 'count'), never below 0
//   pkg    — 'closed' | 'open' | 'empty', or null (not a package)
//   prep   — 'whole' | 'sliced' | 'spread' | 'assembled', or null
//   clean  — 'clean' | 'used' | 'dirty', or null (food)
//   machine — free per-type fields of a machine / appliance (on, time left …); separate fields, not one enum
//   home   — the place it goes back to (a slot), or null
// The existing holdables (cups, glasses, the milk, fish fingers, fruit, fries) keep their own state for now; the ones
// that hold an amount (drinks.js Contents, fishfingers.js `left` / `bite`, fruit.js bites, fries.js portions) could move
// over to an instance each (docs/livssimulator-inventering.md).

/** Size classes, smallest first: a slot or a carrier takes things up to its own size. */
export const SIZES = { xs: 0, s: 1, m: 2, l: 3, xl: 4 };
const UNITS = new Set(['g', 'ml', 'count']);
const PKG = new Set(['closed', 'open', 'empty']), PREP = new Set(['whole', 'sliced', 'spread', 'assembled']), CLEAN = new Set(['clean', 'used', 'dirty']);
const EPS = 1e-6;
const round = (v) => Math.round(v * 1e6) / 1e6;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A place's copy (places are plain objects, never shared between two items). */
export function clonePlace(p) {
  if (!p) return null;
  if (p.at === 'world') return { at: 'world', pos: [...p.pos], yaw: p.yaw ?? 0 };
  if (p.at === 'hand') return { at: 'hand' };
  if (p.at === 'slot') return { at: 'slot', store: p.store, slot: p.slot };
  if (p.at === 'on') return { at: 'on', parent: p.parent, slot: p.slot };
  return null;
}
const samePlace = (a, b) => !!a && !!b && a.at === b.at && (a.at === 'slot' ? a.store === b.store && a.slot === b.slot : a.at === 'on' ? a.parent === b.parent && a.slot === b.slot : a.at === 'hand');

export class Items {
  /** defs = ITEMS (config): type → { name, tags, unit, amount, size, pkg?, prep?, clean?, carrier?: { slots, size, accepts } } */
  constructor(defs) {
    this.defs = defs;
    this.items = new Map();   // id → instance
    this.counters = {};       // type → the last number given out
    this.stores = new Map();  // id → store (#369)
    this.listeners = [];
  }

  // --- definitions -----------------------------------------------------------
  def(x) { return this.defs[typeof x === 'string' ? x : x?.type] ?? null; }
  has(item, tag) { return !!this.def(item)?.tags?.includes(tag); }
  name(item) { return this.def(item)?.name ?? item?.type ?? ''; }
  unit(item) { return this.def(item)?.unit ?? 'count'; }
  size(item) { return SIZES[this.def(item)?.size ?? 'm'] ?? SIZES.m; }

  // --- events (the 3D side follows the data) --------------------------------
  /** fn(kind, item, extra): 'create' | 'move' | 'change' | 'remove'. Returns an unsubscribe function. */
  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  emit(kind, item, extra) { for (const f of this.listeners) f(kind, item, extra); }

  // --- instances --------------------------------------------------------------
  /** A new instance of `type` at `place` (props override the type's defaults); null + no change if the place is not
   * allowed (`this.lastReason` says why) or the type is unknown. */
  create(type, place, props = {}) {
    const d = this.defs[type];
    if (!d) { this.lastReason = `Okänd sak: ${type}`; return null; }
    let id = props.id;
    if (id && this.items.has(id)) id = null;
    if (!id) { do id = `${type}#${(this.counters[type] = (this.counters[type] ?? 0) + 1)}`; while (this.items.has(id)); }
    else { const n = Number(id.split('#')[1]); if (Number.isFinite(n) && n > (this.counters[type] ?? 0)) this.counters[type] = n; }
    const unit = UNITS.has(d.unit) ? d.unit : 'count';
    const item = {
      id, type,
      place: null,
      amount: Math.max(0, round(Number.isFinite(props.amount) ? props.amount : d.amount ?? 1)),
      unit,
      pkg: PKG.has(props.pkg) ? props.pkg : d.pkg ?? null,
      prep: PREP.has(props.prep) ? props.prep : d.prep ?? null,
      clean: CLEAN.has(props.clean) ? props.clean : d.clean ?? null,
      machine: { ...(d.machine ?? {}), ...(props.machine ?? {}) },
      home: clonePlace(props.home) ?? null,
      parts: Array.isArray(props.parts) ? props.parts.map((p) => ({ ...p })) : [], // what it is made of (a sandwich's layers, #379)
    };
    const why = this.check(item, place);
    if (why) { this.lastReason = why; return null; }
    item.place = clonePlace(place);
    this.items.set(id, item);
    this.emit('create', item);
    return item;
  }

  get(id) { return this.items.get(typeof id === 'string' ? id : id?.id) ?? null; }
  all() { return [...this.items.values()]; }
  ofType(type) { return this.all().filter((i) => i.type === type); }
  /** The instance in the hand, or null. */
  held() { return this.all().find((i) => i.place?.at === 'hand') ?? null; }

  /** What occupies a slot / carrier spot (`place` of kind 'slot' or 'on'), other than `except`. */
  occupant(place, except = null) {
    for (const i of this.items.values()) if (i !== except && samePlace(i.place, place)) return i;
    return null;
  }
  /** The things lying on a carrier, by slot. */
  children(item) {
    const id = typeof item === 'string' ? item : item.id;
    return this.all().filter((i) => i.place?.at === 'on' && i.place.parent === id).sort((a, b) => a.place.slot - b.place.slot);
  }
  /** Everything on it, on what is on it … (depth first). */
  descendants(item) { return this.children(item).flatMap((c) => [c, ...this.descendants(c)]); }
  /** The carriers it lies on, nearest first. */
  ancestors(item) {
    const out = [];
    let p = this.get(item)?.place, guard = 0;
    while (p?.at === 'on' && guard++ < 64) { const par = this.get(p.parent); if (!par) break; out.push(par); p = par.place; }
    return out;
  }
  /** The outermost carrier it rides on (itself when it lies on nothing). */
  root(item) { const a = this.ancestors(item); return a.length ? a[a.length - 1] : this.get(item); }

  // --- stores (#369): registered by the 3D side; here only what the rules need -------------------------------
  /** store: { id, name, slots: [{ size, accepts? }], accepts? (tags, any of), isOpen() → bool, shutText, fullText } */
  addStore(store) { this.stores.set(store.id, store); return store; }
  store(id) { return this.stores.get(id) ?? null; }
  /** The first free slot of `storeId` that takes `item`, or -1. */
  freeSlot(storeId, item) {
    const s = this.store(storeId);
    if (!s) return -1;
    for (let k = 0; k < s.slots.length; k++) if (!this.check(item, { at: 'slot', store: storeId, slot: k }, { ignoreShut: true })) return k;
    return -1;
  }
  /** The first free spot on a carrier for `item`, or -1. */
  freeSpot(parent, item) {
    const d = this.def(parent)?.carrier;
    if (!d) return -1;
    for (let k = 0; k < d.slots; k++) if (!this.check(item, { at: 'on', parent: parent.id ?? parent, slot: k })) return k;
    return -1;
  }

  // --- the rules ----------------------------------------------------------------------------------
  /** Why `item` cannot go to `place`, in Swedish, or null when it can. opts.ignoreShut: a shut store is no reason (the
   * 3D side asks before opening). */
  check(item, place, opts = {}) {
    if (!place || typeof place !== 'object') return 'Ingen plats';
    const what = cap(this.name(item));
    switch (place.at) {
      case 'world':
        if (!Array.isArray(place.pos) || place.pos.length !== 3 || !place.pos.every(Number.isFinite)) return 'Ogiltig plats';
        return null;
      case 'hand': {
        const h = this.held();
        return h && h !== item ? `Lägg ifrån dig ${this.name(h)} först` : null;
      }
      case 'slot': {
        const s = this.store(place.store);
        if (!s) return 'Platsen finns inte';
        const slot = s.slots[place.slot];
        if (!Number.isInteger(place.slot) || !slot) return 'Platsen finns inte';
        if (!opts.ignoreShut && s.isOpen && !s.isOpen()) return s.shutText ?? `Öppna ${s.name} först`;
        const accepts = slot.accepts ?? s.accepts;
        if (accepts && !accepts.some((t) => this.has(item, t) || item.type === t)) return `${what} hör inte hemma i ${s.name}`;
        if (this.size(item) > (SIZES[slot.size ?? 'm'] ?? SIZES.m)) return `${what} får inte plats i ${s.name}`;
        if (this.occupant(place, item)) return s.fullText ?? `Platsen i ${s.name} är upptagen`;
        if (this.children(item).length && !s.carriers) return `Ta av det som ligger på ${this.name(item)} först`;
        return null;
      }
      case 'on': {
        const parent = this.get(place.parent);
        if (!parent) return 'Platsen finns inte';
        const c = this.def(parent)?.carrier;
        if (!c) return `${cap(this.name(parent))} kan inte bära något`;
        if (parent === this.get(item) || this.ancestors(parent).includes(this.get(item))) return `${what} kan inte ligga på sig själv`;
        if (!Number.isInteger(place.slot) || place.slot < 0 || place.slot >= c.slots) return 'Platsen finns inte';
        if (c.accepts && !c.accepts.some((t) => this.has(item, t) || item.type === t)) return `${what} ska inte ligga på ${this.name(parent)}`;
        if (this.size(item) > (SIZES[c.size ?? 'm'] ?? SIZES.m)) return `${what} får inte plats på ${this.name(parent)}`;
        if (this.occupant(place, item)) return c.fullText ?? `${cap(this.name(parent))} är full`;
        return null;
      }
      default: return 'Ingen plats';
    }
  }

  /** Move `item` to `place`: null when done, else the reason (and nothing changed). What lies on it comes along. */
  move(item, place, opts = {}) {
    const it = this.get(item);
    if (!it) return 'Saken finns inte';
    if (it.lock && !opts.force && it.lock !== opts.by) return `${cap(this.name(it))} används just nu`; // reserved by a timed action (#372)
    const why = this.check(it, place, opts);
    if (why) return why;
    const from = it.place;
    it.place = clonePlace(place);
    this.emit('move', it, from);
    return null;
  }

  /** Set fields (pkg, prep, clean, machine …) that are valid; emits 'change'. */
  set(item, fields) {
    const it = this.get(item);
    if (!it) return;
    if (fields.pkg !== undefined && (fields.pkg === null || PKG.has(fields.pkg))) it.pkg = fields.pkg;
    if (fields.prep !== undefined && (fields.prep === null || PREP.has(fields.prep))) it.prep = fields.prep;
    if (fields.clean !== undefined && (fields.clean === null || CLEAN.has(fields.clean))) it.clean = fields.clean;
    if (fields.machine) Object.assign(it.machine, fields.machine);
    if (fields.home !== undefined) it.home = clonePlace(fields.home);
    if (Array.isArray(fields.parts)) it.parts = fields.parts.map((p) => ({ ...p }));
    this.emit('change', it);
  }

  // --- amounts: never below 0 -----------------------------------------------------------------------
  setAmount(item, v) {
    const it = this.get(item);
    if (!it || !Number.isFinite(v)) return;
    it.amount = Math.max(0, round(v));
    this.emit('change', it);
  }
  /** Take up to `n` out of it; returns what was really taken (0 … n, never more than there is). */
  consume(item, n) {
    const it = this.get(item);
    if (!it || !(n > 0)) return 0;
    const got = Math.min(it.amount, n);
    it.amount = Math.max(0, round(it.amount - got));
    if (it.amount < EPS) it.amount = 0;
    this.emit('change', it);
    return round(got);
  }
  add(item, n) {
    const it = this.get(item);
    if (!it || !(n > 0)) return;
    it.amount = round(it.amount + n);
    this.emit('change', it);
  }
  isEmpty(item) { return (this.get(item)?.amount ?? 0) <= EPS; }

  /** Gone (eaten, thrown away). Not while something lies on it (nothing is silently lost: false, `lastReason`),
   * unless `cascade`: then that goes too. */
  remove(item, { cascade = false } = {}) {
    const it = this.get(item);
    if (!it) return false;
    const kids = this.children(it);
    if (kids.length && !cascade) { this.lastReason = `Ta av det som ligger på ${this.name(it)} först`; return false; }
    for (const c of kids) this.remove(c, { cascade });
    this.items.delete(it.id);
    this.emit('remove', it);
    return true;
  }

  // --- sanity ----------------------------------------------------------------------------------------
  /** Problems with the whole set (tests): every item has exactly one valid place, no amount below 0, no two in one
   * spot, no item on itself. [] when all is well. */
  audit() {
    const out = [], seen = new Map();
    let inHand = 0;
    for (const i of this.items.values()) {
      if (!i.place || !['world', 'hand', 'slot', 'on'].includes(i.place.at)) out.push(`${i.id}: no place`);
      if (!(i.amount >= 0)) out.push(`${i.id}: amount ${i.amount}`);
      if (i.place?.at === 'hand') inHand++;
      if (i.place?.at === 'slot' || i.place?.at === 'on') {
        const k = JSON.stringify(i.place);
        if (seen.has(k)) out.push(`${i.id} and ${seen.get(k)} share ${k}`);
        seen.set(k, i.id);
      }
      if (i.place?.at === 'on' && (i.place.parent === i.id || this.ancestors(i).some((a) => a.id === i.id))) out.push(`${i.id}: on itself`);
      if (i.place?.at === 'on' && !this.get(i.place.parent)) out.push(`${i.id}: on a missing ${i.place.parent}`);
    }
    if (inHand > 1) out.push(`${inHand} things in the hand`);
    return out;
  }
}

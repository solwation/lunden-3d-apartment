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

/** The record's version (#371); MIGRATIONS[v](record) turns a v record into v + 1. */
export const ITEMS_VERSION = 2;
export const MIGRATIONS = {
  // v1 → v2 (#386): the one waste bin under the sink (LIFE-017, store sinkBins) became three sorted ones — the old bin is now
  // Restavfall, emptied, and what its parts counted moves on: the food into a Matavfall bin, the packages into a Förpackningar
  // bin (its amount less the food; volumes were 1 per food, 2–3 per package)
  1: (r) => {
    const items = r.items.map((e) => (e && typeof e === 'object' ? { ...e } : e));
    for (const e of items) {
      if (!e || e.type !== 'bin' || e.place?.store !== 'sinkBins') continue;
      const count = (k) => (Array.isArray(e.parts) ? e.parts.find((p) => p?.type === k)?.amount ?? 0 : 0);
      const food = count('food'), pkgs = count('package'), packed = Math.max(0, (Number(e.amount) || 0) - food);
      if (food) items.push({ id: 'binFood#1', type: 'binFood', place: { at: 'slot', store: 'binsFood', slot: 0 }, amount: food, parts: [{ type: 'food', amount: food }] });
      if (pkgs) items.push({ id: 'binPack#1', type: 'binPack', place: { at: 'slot', store: 'binsPack', slot: 0 }, amount: packed, parts: [{ type: 'package', amount: pkgs }] });
      e.amount = 0; e.parts = [];
    }
    return { ...r, v: 2, items };
  },
};

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
    this.reserved = new Map(); // place key → job id: a slot / spot promised to a timed action's result (#372)
    this.namers = {}; // type → (item) => a name from its state, or null for the type's own (#376)
  }

  // --- definitions -----------------------------------------------------------
  def(x) { return this.defs[typeof x === 'string' ? x : x?.type] ?? null; }
  has(item, tag) { return !!this.def(item)?.tags?.includes(tag); }
  name(item) { const n = item && typeof item === 'object' ? this.namers[item.type]?.(item) : null; return n ?? this.def(item)?.name ?? item?.type ?? ''; } // (a namer: a name from the state, "gurkänden", #376)
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
      home: clonePlace(props.home) ?? (place?.at === 'slot' ? clonePlace(place) : null), // made in a store: that slot is its home
      parts: Array.isArray(props.parts) ? props.parts.map((p) => ({ ...p })) : [], // what it is made of (a sandwich's layers, #379)
    };
    const why = this.check(item, place, { ignoreShut: true }); // (stocking a shut store is fine: nobody reaches in)
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
  /** A place's key (reservations, #372). */
  placeKey(p) { return p.at === 'slot' ? `slot:${p.store}:${p.slot}` : p.at === 'on' ? `on:${p.parent}:${p.slot}` : null; }
  /** Is `place` promised to a timed action other than `by`? */
  isReserved(place, by = null) { const j = this.reserved.get(this.placeKey(place)); return j !== undefined && j !== by; }
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
  freeSlot(storeId, item, by = null) {
    const s = this.store(storeId);
    if (!s) return -1;
    for (let k = 0; k < s.slots.length; k++) if (!this.check(item, { at: 'slot', store: storeId, slot: k }, { ignoreShut: true, by })) return k;
    return -1;
  }
  /** The first free spot on a carrier for `item`, or -1 (spots in the carrier's `order`, else 0, 1, 2 …). */
  freeSpot(parent, item, by = null) {
    const d = this.def(parent)?.carrier;
    if (!d) return -1;
    const order = d.order ?? [...Array(d.slots).keys()];
    for (const k of order) if (!this.check(item, { at: 'on', parent: parent.id ?? parent, slot: k }, { by })) return k;
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
        if (this.occupant(place, item) || this.isReserved(place, opts.by)) return s.fullText ?? `Platsen i ${s.name} är upptagen`;
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
        const spot = c.spots?.[place.slot]; // a spot of its own (the board's: what is being cut | the slices)
        if (spot?.accepts && !spot.accepts.some((t) => this.has(item, t) || item.type === t)) return `${what} ska inte ligga där`;
        if (spot?.size && this.size(item) > (SIZES[spot.size] ?? SIZES.m)) return `${what} får inte plats där`;
        if (this.occupant(place, item) || this.isReserved(place, opts.by)) return c.fullText ?? `${cap(this.name(parent))} är full`;
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
    if (fields.machine) for (const [k, v] of Object.entries(fields.machine)) { if (v === null || v === undefined) delete it.machine[k]; else it.machine[k] = v; } // (null clears a field: nothing stale is saved)
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

  // --- saving (#371): versioned plain JSON, read tolerantly -----------------------------------------------
  /** Everything as plain JSON: { v, counters, items: [{ id, type, place, amount, pkg, prep, clean, machine, home, parts }] }. */
  serialize() {
    const items = this.all().map((i) => {
      const e = { id: i.id, type: i.type, place: clonePlace(i.place) };
      if (i.amount !== (this.defs[i.type]?.amount ?? 1)) e.amount = i.amount; // (#387: compact — a default amount and a home that is the place are left out; create() gives them back)
      for (const k of ['pkg', 'prep', 'clean']) if (i[k] !== null && i[k] !== undefined) e[k] = i[k];
      if (Object.keys(i.machine).length) e.machine = { ...i.machine };
      if (i.home && !(i.place?.at === 'slot' && samePlace(i.home, i.place))) e.home = clonePlace(i.home);
      if (i.parts.length) e.parts = i.parts.map((x) => ({ ...x }));
      return e;
    });
    return { v: ITEMS_VERSION, counters: { ...this.counters }, items };
  }

  /**
   * Replace everything with a saved record (made by serialize, any older version: MIGRATIONS bring it up to date).
   * Tolerant: a broken record changes nothing; an unknown type is skipped (logged with `log`); an item whose place is
   * gone (a missing store or carrier, a taken slot) goes to its home, else to `fallback()` (a world place) — never
   * silently lost. opts: { hand: false } = what was in the hand goes home too (a new visit starts empty-handed).
   * Returns { loaded, skipped: [ids], rehomed: [ids] } or null for a record it cannot read.
   */
  load(rec, { log = () => {}, fallback = () => ({ at: 'world', pos: [0, 0, 0], yaw: 0 }), hand = true } = {}) {
    if (!rec || typeof rec !== 'object' || !Number.isFinite(rec.v) || !Array.isArray(rec.items)) { log('life: unreadable record', rec); return null; }
    let r = rec;
    for (let v = r.v; v < ITEMS_VERSION; v++) { const m = MIGRATIONS[v]; if (!m) break; r = m(r); }
    const out = { loaded: 0, skipped: [], rehomed: [] };
    const valid = r.items.filter((e) => {
      if (!e || typeof e !== 'object' || typeof e.type !== 'string') { out.skipped.push(String(e?.id)); return false; }
      if (!this.defs[e.type]) { log(`life: unknown type ${e.type} (${e.id}) skipped`); out.skipped.push(e.id); return false; }
      return true;
    });
    if (!valid.length && r.items.length) { log('life: nothing readable in the record, the current things kept'); return out; } // (never trade what is there for nothing)
    for (const i of this.all()) this.remove(i, { cascade: true });
    this.counters = {};
    for (const [t, n] of Object.entries(r.counters ?? {})) if (Number.isFinite(n)) this.counters[t] = n;
    // carriers before what lies on them (a plate in the hand with its food: the plate first)
    const byId = new Map(valid.map((e) => [e.id, e]));
    const depth = (e, n = 0) => (e.place?.at === 'on' && byId.has(e.place.parent) && n < 32 ? depth(byId.get(e.place.parent), n + 1) + 1 : 0);
    valid.sort((a, b) => depth(a) - depth(b));
    for (const e of valid) {
      const props = { id: e.id, amount: e.amount, pkg: e.pkg, prep: e.prep, clean: e.clean, machine: e.machine, home: e.home, parts: e.parts };
      let place = clonePlace(e.place);
      if (place?.at === 'hand' && !hand) place = null;
      let it = place ? this.create(e.type, place, props) : null;
      if (!it) {
        const why = place ? this.lastReason : 'not in the hand at a new visit';
        for (const p of [e.home, fallback(e)]) { if (p && (it = this.create(e.type, p, props))) break; }
        if (it && place) { out.rehomed.push(it.id); log(`life: ${e.id} could not go back (${why}): ${it.place.at}`); }
      }
      if (it) out.loaded++; else { out.skipped.push(e.id); log(`life: ${e.id} lost?`); }
    }
    return out;
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

import { LIFE_SYNC, THING_SYNC } from './config.js';

// #1981 (part of #1964): the life simulator's things shared between the players, the wire (no three.js, no DOM: the Worker imports the
// validation; `node --test src/lifesync.test.mjs`). The room (cloudflare/life.js) keeps ONE record per instance (items.js `record`:
// id, type, place, amount, package, dirt, machine fields, home, parts), the clients make their own instances follow it
// (src/lifeshare.js). A place is as in items.js, except that 'hand' means "held by one connection" (the room says whose).
//   client -> room: { t: 'li', n, s?: [record, …], x?: [id, …] } one batch (`n`: the sender's request number; `s`: instances as
//     they are now, new ones included; `x`: instances that are gone). A batch is taken whole or refused whole.
//   room -> everybody (the sender too): { t: 'li', by, n, s: [[record, holder | 0], …], x: [id, …] }.
//   room -> the sender only, when refused: { t: 'li', no: why, n, s: [[record, holder | 0], …], x: [id, …] } with the touched
//     instances as the room has them ('held' by somebody else, 'full' a place is taken / too many, 'bad', 'slow', 'save').
//   room -> a new connection: { t: 'li', k: 'a', f?: 1, z?: 1, r: [[record, holder | 0], …] } the whole kitchen in pages (`f` first,
//     `z` last). An empty kitchen (one page, no rows) asks the newcomer to send its own.
// The room knows nothing of what a thing IS: it keeps places unique (one thing per slot / carrier spot), carriers before what
// lies on them, and who holds what.

const ID = /^[A-Za-z][A-Za-z0-9]{0,23}#[0-9]{1,12}$/, TYPE = /^[A-Za-z][A-Za-z0-9]{0,23}$/, STORE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/, WORD = /^[A-Za-z]{1,12}$/, KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const r3 = (v) => Math.round(v * 1000) / 1000;
const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

export const lifeId = (i) => typeof i === 'string' && ID.test(i);

/** A place as the wire carries it, or null. Anything that is not lying / in a slot / on a carrier is "in the sender's hand"
 *  (the inventory's pockets included). */
export function cleanLifePlace(p, C = THING_SYNC) {
  if (!p || typeof p !== 'object') return null;
  if (p.at === 'world') {
    const q = p.pos;
    if (!Array.isArray(q) || q.length !== 3 || !q.every(fin) || q[0] < C.x[0] || q[0] > C.x[1] || q[1] < C.y[0] || q[1] > C.y[1] || q[2] < C.z[0] || q[2] > C.z[1]) return null;
    return { at: 'world', pos: q.map(r3), yaw: fin(p.yaw) ? r3(p.yaw % (Math.PI * 2)) : 0 };
  }
  if (p.at === 'slot') return typeof p.store === 'string' && STORE.test(p.store) && int(p.slot, 255) ? { at: 'slot', store: p.store, slot: p.slot } : null;
  if (p.at === 'on') return lifeId(p.parent) && int(p.slot, 63) ? { at: 'on', parent: p.parent, slot: p.slot } : null;
  return typeof p.at === 'string' ? { at: 'hand' } : null;
}
/** The key of a place only one thing can have (a slot, a carrier's spot), else null. */
export const lifeKey = (p) => (p?.at === 'slot' ? `s:${p.store}:${p.slot}` : p?.at === 'on' ? `o:${p.parent}:${p.slot}` : null);

const flat = (o, keys) => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {}; let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (!KEY.test(k) || ++n > keys) return null;
    if (fin(v) || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 48 && /^[\x20-\x7e]*$/.test(v)) out[k] = v;
    else if (v !== null && v !== undefined) return null;
  }
  return out;
};

/** One instance's record (items.js `record`), with only what the wire allows, in a fixed key order; or null. */
export function cleanLifeRecord(e, L = LIFE_SYNC, C = THING_SYNC) {
  if (!e || typeof e !== 'object' || !lifeId(e.id) || typeof e.type !== 'string' || !TYPE.test(e.type)) return null;
  const place = cleanLifePlace(e.place, C);
  if (!place || (place.at === 'on' && place.parent === e.id)) return null;
  const out = { id: e.id, type: e.type, place };
  if (e.amount !== undefined) { if (!fin(e.amount) || e.amount < 0 || e.amount > 1e7) return null; out.amount = Math.round(e.amount * 1e6) / 1e6; }
  for (const k of ['pkg', 'prep', 'clean', 'moisture']) if (e[k] !== undefined && e[k] !== null) { if (typeof e[k] !== 'string' || !WORD.test(e[k])) return null; out[k] = e[k]; }
  if (e.toasted) out.toasted = true;
  if (e.machine !== undefined) { const m = flat(e.machine, 16); if (!m) return null; if (Object.keys(m).length) out.machine = m; }
  if (e.home !== undefined && e.home !== null) { const h = cleanLifePlace(e.home, C); if (!h || h.at === 'hand') return null; out.home = h; }
  if (e.parts !== undefined) {
    if (!Array.isArray(e.parts) || e.parts.length > 16) return null;
    const parts = e.parts.map((x) => flat(x, 8));
    if (parts.some((x) => !x)) return null;
    if (parts.length) out.parts = parts;
  }
  return JSON.stringify(out).length <= L.rec ? out : null;
}

/** A batch from a client (already parsed), or null: { n, s: [record …], x: [id …] }, no id twice. */
export function cleanLifeBatch(m, L = LIFE_SYNC, C = THING_SYNC) {
  if (m?.t !== 'li' || !Number.isSafeInteger(m.n) || m.n < 0) return null;
  const s = m.s ?? [], x = m.x ?? [];
  if (!Array.isArray(s) || !Array.isArray(x) || s.length + x.length < 1 || s.length + x.length > L.ops) return null;
  const seen = new Set(), recs = [];
  for (const e of s) { const r = cleanLifeRecord(e, L, C); if (!r || seen.has(r.id)) return null; seen.add(r.id); recs.push(r); }
  for (const i of x) { if (!lifeId(i) || seen.has(i)) return null; seen.add(i); }
  return { n: m.n, s: recs, x: [...x] };
}
export function cleanLifeText(text, L = LIFE_SYNC) {
  if (typeof text !== 'string' || text.length > L.maxBytes) return null;
  try { return cleanLifeBatch(JSON.parse(text), L); } catch { return null; }
}
export const LIFE_PREFIX = '{"t":"li"';

// The home's state that is no instance (the dishwasher's and the laundry machines' programmes, made beds, watered plants, the milk):
//   client -> room: { t: 'lx', k: name, d: JSON text } (`name` one of LIFE_SYNC.parts); room -> the others: { t: 'lx', k, d, by };
//   room -> a new connection, after the kitchen's pages: { t: 'lx', k: 'a', p: [[name, d], …] } (what the room has; maybe none).
// The room keeps the last word per part and never reads it.
export const PART_PREFIX = '{"t":"lx"';
/** A part message from a client (text), or null. */
export function cleanPartText(text, L = LIFE_SYNC) {
  if (typeof text !== 'string' || text.length > L.part + 80) return null;
  let m; try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'lx' || !L.parts.includes(m.k) || typeof m.d !== 'string' || m.d.length < 1 || m.d.length > L.part || !/^[\x20-\x7e]+$/.test(m.d)) return null;
  try { JSON.parse(m.d); } catch { return null; }
  return { k: m.k, d: m.d };
}

/** Rows from the room ([[record, holder | 0], …]) → [{ e, h }] (malformed ones dropped). */
export function cleanLifeRows(rows, L = LIFE_SYNC, C = THING_SYNC) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows.slice(0, L.max) : []) {
    const e = Array.isArray(row) ? cleanLifeRecord(row[0], L, C) : null;
    if (e) out.push({ e, h: typeof row[1] === 'string' ? row[1].slice(0, 16) : null });
  }
  return out;
}

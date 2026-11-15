import { DRINKS, THING_SYNC } from './config.js';

// #1976: what a shared thing carries with it, as the short string of thingsync.js `cleanData`: written by the thing's own adapter
// (main.js `thingShare.register(…, { save, load })`), kept and passed on by the room, read by the next player's copy of the thing.
// No three.js, no DOM (`node --test src/thingcontents.test.mjs`). The format is compact JSON with fixed keys; anything a reader does
// not know or that is out of range is dropped, never trusted.

const KINDS = Object.keys(DRINKS).filter((k) => DRINKS[k] && typeof DRINKS[k] === 'object' && 'color' in DRINKS[k]);
const r3 = (v) => Math.round(v * 1000) / 1000;

/** A vessel's drink: `a` = { kind: amount 0…1 } (drinks.js Contents.a), `used` (drunk from, not washed), `heat` 0…1 (cups).
 *  Returns the string, or null when it is empty, clean and cold (nothing to carry). Beer travels as an amount only: its source
 *  ledger (#1007) stays with the player who poured it. */
export function drinkData(a, used = false, heat = 0) {
  const o = {};
  for (const k of KINDS) { const v = a?.[k]; if (Number.isFinite(v) && v > 0.005) (o.a ??= {})[k] = r3(Math.min(1, v)); }
  if (used) o.u = 1;
  if (o.a && Number.isFinite(heat) && heat > 0.01) o.h = r3(Math.min(1, heat));
  if (!o.a && !o.u) return null;
  const s = JSON.stringify(o);
  return s.length <= THING_SYNC.data ? s : null;
}
/** The reverse: { a, used, heat } (empty and clean for null / anything malformed). The amounts never sum over 1. */
export function readDrink(d) {
  const out = { a: {}, used: false, heat: 0 };
  let o = null;
  try { o = typeof d === 'string' ? JSON.parse(d) : null; } catch { return out; }
  if (!o || typeof o !== 'object') return out;
  let sum = 0;
  if (o.a && typeof o.a === 'object') for (const k of KINDS) { const v = o.a[k]; if (Number.isFinite(v) && v > 0.005 && sum + v <= 1.0005) { out.a[k] = Math.min(1, v); sum += v; } }
  out.used = o.u === 1;
  if (Number.isFinite(o.h) && o.h > 0 && sum > 0) out.heat = Math.min(1, o.h);
  return out;
}

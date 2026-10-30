import { SPRAY as S } from './config.js';

// The spray paint's records (#1707, #1724), free of three.js so the Worker's tests can use them: the localStorage record
// { v: 1, s: [wire spot …] } and the wire spot [x, y, z, nx, ny, nz, colour index, size cm, t (s since epoch)] that is also what the
// players' room passes on (cloudflare/graffiti.js). A spot in memory is { p: [x, y, z], n: [nx, ny, nz], c, s (m), t (ms) }.

const HOUR_MS = 3600 * 1000;
const r2 = (v) => Math.round(v * 100) / 100;
/** One spot as stored and as sent to the players' room (cm / centi-units / seconds keep it small: ~45 bytes a spot). */
export const spotWire = (s) => [r2(s.p[0]), r2(s.p[1]), r2(s.p[2]), r2(s.n[0]), r2(s.n[1]), r2(s.n[2]), s.c, Math.round(s.s * 100), Math.round(s.t / 1000)];
/** A spot's identity, the same on every client and in the room (cloudflare/graffiti.js `spotKey`): position, colour, second. */
export const wireKey = (a) => `${a[0]},${a[1]},${a[2]},${a[6]},${a[8]}`;

/** Parse a stored record into spots, dropping malformed and expired ones (and anything from the future by > a day). */
export function readSpots(text, now = Date.now()) {
  let rec; try { rec = JSON.parse(text); } catch { return []; }
  if (rec?.v !== 1 || !Array.isArray(rec.s)) return [];
  const life = S.hours * HOUR_MS, out = [];
  for (const a of rec.s) {
    if (!Array.isArray(a) || a.length !== 9 || !a.every(Number.isFinite)) continue;
    const t = a[8] * 1000;
    if (now - t >= life || t - now > 24 * HOUR_MS) continue;
    if (!Number.isInteger(a[6]) || a[6] < 0 || a[6] >= S.cans.length) continue;
    out.push(fromWire(a));
  }
  out.sort((x, y) => x.t - y.t);
  return out.slice(-S.max);
}
/** A wire spot back as a spot (rounded as stored, so its key stays the same after a reload). */
const fromWire = (a) => ({ p: [a[0], a[1], a[2]], n: [a[3], a[4], a[5]], c: a[6], s: Math.min(1, Math.max(0.02, a[7] / 100)), t: a[8] * 1000 });
/** The record for spots (cm / centi-units / seconds keep it small: ~45 bytes a spot). */
export function writeSpots(spots) {
  return JSON.stringify({ v: 1, s: spots.map(spotWire) });
}

/** Spots painted by other players (#1724, wire records): the new ones join `spots` in time order, expired / malformed ones and
 * duplicates skipped, at most S.max (the oldest go). Returns { spots (a new array when anything was added), added }. */
export function mergeSpots(spots, list, now = Date.now()) {
  if (!Array.isArray(list) || !list.length) return { spots, added: 0 };
  const have = new Set(spots.map((s) => wireKey(spotWire(s))));
  const got = readSpots(JSON.stringify({ v: 1, s: list }), now).filter((s) => { const k = wireKey(spotWire(s)); return !have.has(k) && have.add(k); });
  if (!got.length) return { spots, added: 0 };
  const out = spots.concat(got).sort((x, y) => x.t - y.t);
  if (out.length > S.max) out.splice(0, out.length - S.max);
  return { spots: out, added: got.length };
}

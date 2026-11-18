// Wind (#2117): the weather's wind as one velocity in the scene's ground plane — { x, z } m/s DOWNWIND (x east, z south, north = −z) —
// from the real 10 m wind where Open-Meteo has the hour (src/realweather.js), else from a seeded draw per date and hour for Lund
// (`simWind`, WIND in config.js): a prevailing south-west–west wind, stronger in winter, weather regimes of ~1½ days with smaller turns
// every few hours, a daily swing and more in rain and thunderstorms; every value is blended between its control points, so the wind
// never jumps. Pure (config only): tools/windsimtest.mjs. Consumers: Weather (state, rain/snow slant), SiteWind (power and direction of
// the sway, which #2110's avatar wind follows) and DayCycle's cloud-shadow drift.
import { WIND as W, WEATHER } from './config.js';

const RAD = Math.PI / 180, DAY_MS = 86400000;

/** Meteorological direction (degrees the wind comes FROM) and speed (m/s) → the downwind velocity in the scene { x, z } (m/s). */
export function windVector(fromDeg, speed) {
  const a = fromDeg * RAD;
  return { x: -Math.sin(a) * speed, z: Math.cos(a) * speed };
}

/** The other way round: { from: degrees 0…360 (where it comes from), speed: m/s }. */
export function windFrom(v) {
  const speed = Math.hypot(v.x, v.z);
  return { speed, from: speed > 0 ? (Math.atan2(-v.x, v.z) / RAD + 360) % 360 : 0 };
}

/** SiteWind's power 0…1 for a speed in m/s (WIND.power: a near gale sways fully). */
export function windPower(speed) {
  const P = W.power;
  return Math.min(1, Math.max(0, speed / P.full) ** P.gamma);
}

/** mulberry32 (as weather.js): neighbouring seeds give unrelated sequences. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => (r() + r() + r() + r() - 2) * 1.732; // ~N(0, 1), bounded ±3.5
const ease = (t) => t * t * (3 - 2 * t);

/** The month (fractional, 0 = mid-January … 11 = mid-December) of an hour count, for the seasonal tables (eased between mid-months). */
function seasonal(table, hours) {
  const d = new Date(Math.floor(hours / 24) * DAY_MS), m = d.getUTCMonth(), len = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate();
  const f = (d.getUTCDate() - 0.5) / len - 0.5, n = f >= 0 ? (m + 1) % 12 : (m + 11) % 12;
  return table[m] + (table[n] - table[m]) * Math.abs(f);
}

/** One regime (seeded by its index): unit direction { x, z } (downwind) and a strength factor. */
function regime(i, month) {
  const r = rng(i * 2654435761 + 977), prevail = r() < W.prevail[month];
  const from = prevail ? W.from + gauss(r) * W.spread : W.other + gauss(r) * W.otherSpread;
  const k = Math.exp(gauss(r) * W.regimeSpread - (W.regimeSpread * W.regimeSpread) / 2);
  return { ...windVector(from, 1), k };
}
/** One short step (seeded): a turn (degrees) and a strength factor. */
function nudge(i) {
  const r = rng(i * 1597334677 + 31);
  return { turn: gauss(r) * W.veer, k: Math.exp(gauss(r) * W.gustSpread - (W.gustSpread * W.gustSpread) / 2) };
}

/** Calendar date + hour → hours since 1970 (calendar days, DST-free: the same date always gives the same draw). */
export const hourIndex = (y, m, d, hour) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS) * 24 + hour;

/**
 * The simulated wind at `hour` (fractional) of a date: { x, z } m/s downwind. `rain` 0…1 and `storm` (what falls then, from the draw or
 * the forced weather) add to it. Deterministic: the same date and hour always give the same wind.
 */
export function simWind(y, m, d, hour, { rain = 0, storm = false } = {}) {
  const h = hourIndex(y, m, d, hour);
  // the regime: blended between its two neighbouring control points (vector blend: the direction turns the short way)
  const ri = Math.floor(h / W.regime), rf = ease(h / W.regime - ri), mo = (i) => new Date(i * W.regime * 3600000).getUTCMonth();
  const A = regime(ri, mo(ri)), B = regime(ri + 1, mo(ri + 1));
  let x = A.x + (B.x - A.x) * rf, z = A.z + (B.z - A.z) * rf;
  const l = Math.hypot(x, z) || 1; x /= l; z /= l;
  let k = A.k + (B.k - A.k) * rf;
  // the short steps: a turn and a strength factor, blended likewise
  const si = Math.floor(h / W.step), sf = ease(h / W.step - si), P = nudge(si), Q = nudge(si + 1);
  const turn = (P.turn + (Q.turn - P.turn) * sf) * RAD, c = Math.cos(turn), s = Math.sin(turn);
  [x, z] = [x * c - z * s, x * s + z * c];
  k *= P.k + (Q.k - P.k) * sf;
  // the season's mean, the day's swing, what falls
  const day = 1 + seasonal(W.diurnal, h) * Math.cos(((hour - W.peak) / 24) * Math.PI * 2);
  const speed = Math.min(W.max, seasonal(W.mean, h) * k * day + W.rain * Math.min(1, Math.max(0, rain)) + (storm ? W.storm : 0));
  return { x: x * speed, z: z * speed };
}

/** #2117: how the wind ({ x, z } m/s downwind) slants what falls: rain moves (x, z) m sideways per m of fall, snow drifts (dx, dz) m/s. */
export function fallSlant(wind) {
  const v = Math.hypot(wind?.x ?? 0, wind?.z ?? 0);
  if (!(v > 1e-6)) return { x: 0, z: 0, dx: 0, dz: 0 };
  const sl = Math.min(WEATHER.slant.max, WEATHER.slant.perMs * v) / v, dr = Math.min(WEATHER.snowDrift.max, WEATHER.snowDrift.perMs * v) / v;
  return { x: wind.x * sl, z: wind.z * sl, dx: wind.x * dr, dz: wind.z * dr };
}

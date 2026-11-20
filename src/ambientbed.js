// #2190: the outdoor ambient bed — two quiet noise loops (sfx.ambientBed in audio.js): Höje å babbling near the river, and the far low
// hum of Malmövägen / Lund city that swells in rush hour and nearly dies at night. Pure and config-only (AMBIENT_BED): this turns the
// listener's distance to the river polyline, the hour of day and "indoors" into the loops' gain / filter. Each source has exactly ONE
// indoor model, here (own gain + low-pass, like the wind bed #2177); #2181 occlusion is not applied to these listener-attached beds.
// tools/ambientbedtest.mjs.
import { AMBIENT_BED as A } from './config.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Distance (m, plan view) from (x, z) to the polyline `path` = [[x, z], …] (Infinity for fewer than two points). */
export function distToPolyline(path, x, z) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? clamp01(((x - ax) * dx + (z - az) * dz) / len2) : 0, d = Math.hypot(x - ax - t * dx, z - az - t * dz);
    if (d < best) best = d;
  }
  return best;
}

/** { gain, hz, q } of the babble at `dist` m from the river centreline: full within `full` m, fading with the square of the remaining
 *  share to nothing at `range` m; the farther, the duller. `indoors`: x `indoor.gain`, low-passed. */
export function riverBabbleParams({ dist = Infinity, indoors = false } = {}) {
  const R = A.river, near = 1 - smooth(R.full, R.range, dist), k = near * near;
  let gain = R.gain * k, hz = lerp(R.hz[0], R.hz[1], near);
  if (indoors) { gain *= A.indoor.river; hz = Math.min(hz, A.indoor.hz); }
  return { gain, hz, q: R.q };
}

/** Traffic level 0…1 at `hour` (0…24): a low night floor, a day base from `dayFrom` to `dayTo`, plus the two rush-hour swells. */
export function trafficLevel(hour) {
  const C = A.city, h = ((hour % 24) + 24) % 24, day = smooth(C.dayFrom[0], C.dayFrom[1], h) * (1 - smooth(C.dayTo[0], C.dayTo[1], h));
  const rush = C.rush.reduce((s, [at, w]) => s + Math.exp(-(((h - at) / w) ** 2)), 0);
  return clamp01(lerp(C.night, C.day, day) + C.rushBoost * day * Math.min(1, rush));
}

/** { gain, hz } of the distant hum at `hour`; `indoors` dulls it (own gain and a lower low-pass). */
export function cityHumParams({ hour = 12, indoors = false } = {}) {
  const C = A.city, lv = trafficLevel(hour);
  let gain = C.gain * lv, hz = lerp(C.hz[0], C.hz[1], lv);
  if (indoors) { gain *= A.indoor.city; hz = Math.min(hz, A.indoor.hzCity); }
  return { gain, hz };
}

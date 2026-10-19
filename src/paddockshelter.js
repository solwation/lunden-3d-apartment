// #1316: where the paddock's ponies take shelter and when. No three.js: the places and the rain/snow rules are shared by paddock.js and the node test.
import { PADDOCK as P, SEASON } from './config.js';
import { insideFence } from './paddockgeo.js';

/** The sheltered places: under the field shelter's roof (`shed`, two) and on a ring under each tree's crown (`tree`). `shelter` = {x, z, yaw} (the shelter's frame: open to +z), `keep(x, z)` says a place is usable. */
export function shelterSpots(shelter, keep = () => true) {
  const R = P.rain, out = [];
  if (shelter) {
    const c = Math.cos(shelter.yaw), s = Math.sin(shelter.yaw);
    for (const lx of [-R.shedX, R.shedX]) out.push({ kind: 'shed', x: shelter.x + lx * c, z: shelter.z - lx * s });
  }
  for (const [x, z, sc] of P.trees) for (let k = 0; k < R.treeSpots; k++) {
    const a = (k + 0.5) / R.treeSpots * Math.PI * 2 + x * 0.37, r = R.ring * sc;
    out.push({ kind: 'tree', x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
  }
  return out.filter((p) => keep(p.x, p.z));
}

/** Is the ground white in `month` (1-12)? Then the ponies are not in the paddock. */
export const snowCovered = (month) => SEASON.snowMonths.includes(month);

/** Rain with hysteresis: `wanted` turns on at PADDOCK.rain.on and off once the rain has been under `off` for `dry` s. `update(dt, rain)` returns +1 when a shower begins, -1 when it is over, else 0. */
export class RainWatch {
  constructor() { this.wanted = false; this.dryFor = 0; }
  update(dt, rain) {
    const R = P.rain;
    if (!this.wanted) { if (rain >= R.on) { this.wanted = true; this.dryFor = 0; return 1; } return 0; }
    if (rain < R.off) { this.dryFor += dt; if (this.dryFor >= R.dry) { this.wanted = false; return -1; } } else this.dryFor = 0;
    return 0;
  }
}

/** #1335/#1336: the ground under the shelter's footprint (a `grid` x `grid` lattice over its w x d plus `pad` m, in the shelter's frame, open to +z, yaw as in `shelterSpots`):
 *  `{ min, max, mean, relief }` of `ground(x, z)`. The shelter may only stand where `relief` (max - min) is at most `PADDOCK.shelter.maxRelief`. */
export function footprintGround(ground, x, z, yaw, pad = P.shelter.pad, grid = 5) {
  const S = P.shelter, c = Math.cos(yaw), s = Math.sin(yaw);
  let min = Infinity, max = -Infinity, sum = 0, n = 0;
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const lx = (i / (grid - 1) - 0.5) * (S.w + 2 * pad), lz = (j / (grid - 1) - 0.5) * (S.d + 2 * pad), y = ground(x + lx * c + lz * s, z - lx * s + lz * c);
    min = Math.min(min, y); max = Math.max(max, y); sum += y; n++;
  }
  return { min, max, mean: sum / n, relief: max - min };
}

/** The shelter's site: the nearest point to `target` on a `step` m lattice over [x0..x1] x [z0..z1] whose footprint is flat (`footprintGround`), inside the fence by `edge` m
 *  (corners included), clear of trunks/river (`clear(x, z)`), away from `not` (the trough), with the open side towards `face` (the gate). `ok` null when nothing qualifies. */
export function shelterSite(ground, { target, face, not, clear = () => true, bbox, step = 1.5 }) {
  const S = P.shelter;
  let best = null;
  for (let x = bbox[0]; x <= bbox[2]; x += step) for (let z = bbox[1]; z <= bbox[3]; z += step) {
    const yaw = Math.atan2(face[0] - x, face[1] - z);
    if (!insideFence(x, z, S.edge) || !clear(x, z)) continue;
    if (not && Math.hypot(x - not[0], z - not[1]) < 9) continue;
    const c = Math.cos(yaw), s = Math.sin(yaw), r = Math.hypot(S.w, S.d) / 2 + S.pad;
    if ([[1, 1], [1, -1], [-1, 1], [-1, -1]].some(([a, b]) => !insideFence(x + (a * r) * c + (b * r) * s, z - (a * r) * s + (b * r) * c, 2.5))) continue;
    const g = footprintGround(ground, x, z, yaw);
    if (g.relief > S.maxRelief) continue;
    const score = Math.hypot(x - target[0], z - target[1]) + g.relief * 15;
    if (!best || score < best.score) best = { x, z, yaw, score, ...g };
  }
  return best;
}

// #1316: where the paddock's ponies take shelter and when. No three.js: the places and the rain/snow rules are shared by paddock.js and the node test.
import { PADDOCK as P, SEASON } from './config.js';

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

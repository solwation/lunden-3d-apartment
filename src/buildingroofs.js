// #1294: walkable roofs and walls for every mapped building inside WALK, derived from the same records the backdrops draw them from
// (sitebackdrop.js / southbackdrop.js `userData.buildings`: the outline `polygon` (+ `holes`), `eave`, and `roofY(x, z)` where the
// builder has the drawn roof's height; without it the roof is taken as flat at the eave). One code path for all of them, so a building
// added to the data gets a roof you can land on and walls you cannot fly into. The surfaces are polygon surfaces of src/roofs.js
// (grid-indexed there); nothing here is drawn, so no draw calls. See docs/development/environment.md.
import { WALK, BUILDING_ROOFS } from './config.js';

const ringSegments = (ring) => {
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1], n = closed ? ring.length - 1 : ring.length, out = [];
  for (let i = 0; i < n; i++) out.push([ring[i], ring[(i + 1) % n]]);
  return out;
};

/** Surfaces and walls ({ surfaces, walls }, the shape of `userData.walk`) for the building `records` that reach into WALK. */
export function buildingRoofWalk(records) {
  const surfaces = [], walls = [], B = BUILDING_ROOFS, seen = new Set();
  for (const rec of records) {
    const outer = rec.polygon;
    if (!outer || outer.length < 3 || rec.eave === undefined) continue;
    const xs = outer.map((q) => q[0]), zs = outer.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    if (x1 < WALK.x0 || x0 > WALK.x1 || z1 < WALK.z0 || z0 > WALK.z1) continue; // out of reach
    const holes = rec.holes ?? [], flat = rec.eave + B.flatLift, roofY = rec.roofY ? (x, z) => { const y = rec.roofY(x, z); return Number.isFinite(y) ? y : rec.eave; } : () => flat; // (a wing lower than the building's highest eave keeps its own roof)
    let id = `bld-${rec.source ?? rec.name}`; for (let k = 2; seen.has(id); k++) id = `bld-${rec.source ?? rec.name}-${k}`; seen.add(id);
    surfaces.push({ id, name: `Taket på ${rec.name ?? 'en byggnad'}`, x0, x1, z0, z1, poly: outer, holes, y: roofY });
    for (const ring of [outer, ...holes]) for (const [[ax, az], [bx, bz]] of ringSegments(ring)) {
      let top = -Infinity; // the wall rises to the roof's height along it (a gable end stands higher than the eave)
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / B.wallStep));
      for (let k = 0; k <= n; k++) top = Math.max(top, roofY(ax + (bx - ax) * k / n, az + (bz - az) * k / n));
      walls.push({ s: [ax, az, bx, bz], y0: -B.depth, y1: top + B.wallLift });
    }
  }
  return { surfaces, walls };
}

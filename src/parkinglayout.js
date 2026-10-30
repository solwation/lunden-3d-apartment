// #1278: stalls and parked cars of the east campus' car parks (no THREE: shared by the drawn lines/cars and by the collision in farwalk.js).
// A lot = a SITE.east.access polygon with a `capacity` (OSM way, #1262). Its aisles = the SITE.east.access service ways whose segments
// run inside it. Stalls stand along each aisle on both sides, square to it, `PARKING_LOT.bayD` deep from the aisle's edge; a stall is
// kept only if it lies wholly inside the polygon, clear of other roads, buildings and earlier stalls. All sizes: PARKING_LOT (*guess*).
import { SITE, PARKING_LOT as P } from './config.js';

const ringOf = (p) => (p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1] ? p.slice(0, -1) : p);
export const insidePoly = (x, z, p) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; };
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
const edgeDist = (x, z, ring) => Math.min(...ring.map((a, i) => segDist(x, z, a, ring[(i + 1) % ring.length])));
const rng = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

/** Within a service way's strip (half its width + `margin` m) of SITE.east.access, or inside an east building's outline. */
export const onEastRoad = (x, z, margin = 0) => SITE.east.access.some((r) => r.path && r.path.slice(1).some((q, i) => segDist(x, z, r.path[i], q) < r.w / 2 + margin));
export const onEastBuildingAt = (x, z) => SITE.east.buildings.some((b) => insidePoly(x, z, b.polygon.slice(0, -1)) && !(b.holes ?? []).some((h) => insidePoly(x, z, h.slice(0, -1))));

/** Do two rectangles (centre, unit axis u, n, half sizes) overlap? Separating-axis test on the four axes. */
function rectsOverlap(a, b) {
  for (const ax of [a.u, a.n, b.u, b.n]) {
    const proj = (r) => { const c = r.cx * ax[0] + r.cz * ax[1], e = r.hw * Math.abs(r.u[0] * ax[0] + r.u[1] * ax[1]) + r.hd * Math.abs(r.n[0] * ax[0] + r.n[1] * ax[1]); return [c - e, c + e]; };
    const [a0, a1] = proj(a), [b0, b1] = proj(b);
    if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
  }
  return true;
}

/** Everything the car parks need: `{ lots: [{ source, polygon, bays, runs }], cars }`. A bay = { cx, cz, u, n, side, aisle } (centre,
 * `u` along the aisle, `n` across it, away from it); a run = consecutive stalls along one aisle side (their stall lines). Memoised. */
let memo = null;
export function parkingLots() {
  if (memo) return memo;
  const E = SITE.east, roads = E.access.filter((r) => r.path), inBuilding = onEastBuildingAt, nearRoad = (x, z, shrink) => onEastRoad(x, z, -shrink);
  const lots = [], cars = [], R = rng(P.seed);
  for (const lot of E.access.filter((a) => a.polygon && a.capacity)) {
    const ring = ringOf(lot.polygon), bays = [], runs = [];
    const inner = (x, z) => insidePoly(x, z, ring) && edgeDist(x, z, ring) >= P.edgeClear;
    // #1703: a lot may be a single row of stalls square to a street instead (`row: { path, side }`): a virtual aisle of width 0 along the kerb, one side only, not drawn as road
    const aisles = lot.row ? [{ path: lot.row.path, w: 0, source: lot.source, side: lot.row.side }] : roads;
    for (const road of aisles) for (let i = 1; i < road.path.length; i++) {
      const a = road.path[i - 1], b = road.path[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < P.bayW || !insidePoly((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ring)) continue; // an aisle: a service way segment inside this lot
      const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      for (const side of road.side ? [road.side] : [1, -1]) {
        const n = [-u[1] * side, u[0] * side];
        let run = null;
        for (let k = 0; (k + 1) * P.bayW <= len + 1e-6; k++) {
          const t = (k + 0.5) * P.bayW, off = road.w / 2 + P.bayD / 2;
          const bay = { cx: a[0] + u[0] * t + n[0] * off, cz: a[1] + u[1] * t + n[1] * off, u, n, side, hw: P.bayW / 2, hd: P.bayD / 2, source: road.source, k };
          let ok = true;
          for (const du of [-1, 0, 1]) for (const dn of [-1, 0, 1]) { // corners, edge midpoints and centre
            const x = bay.cx + u[0] * du * bay.hw + n[0] * dn * bay.hd, z = bay.cz + u[1] * du * bay.hw + n[1] * dn * bay.hd;
            if (!inner(x, z) || nearRoad(x, z, 0.1) || inBuilding(x, z)) ok = false;
          }
          if (ok && bays.some((q) => rectsOverlap(bay, q))) ok = false;
          if (!ok) { run = null; continue; }
          bays.push(bay);
          if (!run) { run = { a, u, n, road, side, k0: k, k1: k, bays: [] }; runs.push(run); }
          run.k1 = k; run.bays.push(bay);
        }
      }
    }
    for (const bay of bays) { // a car in some of the stalls, nose to the back (a few the other way)
      if (R() > (lot.fill ?? P.fill)) { R(); R(); continue; } // #1554: a lot may set its own `fill` (the same three draws either way, so the other lots' cars stay put)
      const nose = (R() < (lot.reversed ?? P.reversed) ? -1 : 1) * (lot.noseToAisle ? -1 : 1), jitter = (R() - 0.5) * 0.3;
      const f = [bay.n[0] * nose, bay.n[1] * nose], yaw = Math.atan2(-f[1], f[0]);
      const cx = bay.cx + bay.u[0] * jitter, cz = bay.cz + bay.u[1] * jitter, c = Math.cos(yaw), s = Math.sin(yaw);
      // footprint: the car's local x (length) points along f, local z (width) across; rotateY(yaw) maps +x to (cos, -sin)
      const at = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
      const foot = [at(-P.car.hx, -P.car.hz), at(P.car.hx, -P.car.hz), at(P.car.hx, P.car.hz), at(-P.car.hx, P.car.hz)];
      cars.push({ x: cx, z: cz, yaw, foot, lot: lot.source, color: R() });
    }
    lots.push({ source: lot.source, polygon: ring, bays, runs });
  }
  return (memo = { lots, cars });
}

/** Collision segments [x0, z0, x1, z1] of the parked cars (farwalk.js). */
export const parkedCarSegments = () => parkingLots().cars.flatMap((c) => c.foot.map((p, i) => [...p, ...c.foot[(i + 1) % 4]]));

import { SITE, PATH_LIGHTS as L } from './config.js';
import { along, onRoad } from './roads.js';
import { riverAt, deckUnderAt } from './riverbridge.js';
import { outline, inPoly, ringDist } from './paddockgeo.js';

const segmentDistance = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz || 1)));
  return Math.hypot(x-a[0]-t*dx, z-a[1]-t*dz);
};
/** Deterministic assumed posts beside sourced paths; never in their clear walking strip or in the water. */
export function pathLampSpots(trees = []) {
  const paths = SITE.riverPark.paths, spots = [];
  const clear = (x, z) => {
    if (onRoad(x, z, L.pathClear) || deckUnderAt(x, z) !== null) return false;
    const r = riverAt(x, z);
    if (r.distance < r.width / 2 + L.waterClear) return false;
    if (inPoly(outline, x, z) || ringDist(outline, x, z) < L.fenceClear) return false;
    if (SITE.blocks.some(b => x > b.x0-L.pathClear && x < b.x1+L.pathClear && z > b.z0-L.pathClear && z < b.z1+L.pathClear)) return false;
    if (trees.some(t => Math.hypot(t.x-x, t.z-z) < L.treeClear)) return false;
    if (spots.some(t => Math.hypot(t.x-x, t.z-z) < L.duplicateClear)) return false;
    return paths.every(p => p.path.every((b,i) => i === 0 || segmentDistance(x,z,p.path[i-1],b) >= p.w/2+L.pathClear));
  };
  for (const source of L.sources) {
    const path = paths.find(p => p.source === source);
    if (!path) continue;
    // Try the opposite verge when a junction, tree, field or water occupies the first side.
    const left = along(path, path.path[0], path.path.at(-1), L.step, w => w/2+L.edge);
    const right = along(path, path.path[0], path.path.at(-1), L.step, w => -w/2-L.edge);
    left.forEach((a,i) => {
      for (const [p, side] of [[a,1],[right[i],-1]]) {
        if (!clear(p.x,p.z)) continue;
        spots.push({x:p.x,z:p.z,yaw:Math.atan2(-side*p.nx,-side*p.nz),source});
        break;
      }
    });
  }
  return spots;
}

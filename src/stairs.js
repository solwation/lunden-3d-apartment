import * as THREE from 'three';
import { STAIR, LEVELS } from './config.js';

// The total rise is the finished floor-to-floor height from LEVELS (#344 owns those numbers), never a stair number
// of its own (#352): the risers are equal, N_TREADS + 1 of them, the last one up onto the Övre plan floor at the
// slab edge (STAIR.bX1 = STAIR.hole.x0). Read at call time, so a changed LEVELS is followed without a rebuild of
// this module's constants.
const { a: NA, w: NW, b: NB } = STAIR.treads;
export const N_TREADS = NA + NW + NB;
/** Total rise (m) and the riser height = rise / (treads + 1): a model calculation, not a measured stair dimension. */
export const stairRise = () => LEVELS[1].floor - LEVELS[0].floor;
export const stairRiser = () => stairRise() / (N_TREADS + 1);
const [CX, CZ] = STAIR.center;

// Winder angle θ: 0 = pointing south (+z), π/2 = east, π = north.
function winderAngle(x, z) {
  return Math.atan2(x - CX, z - CZ);
}

/** Index of the tread under (x, z), or -1 when not on the stair. */
function treadIndex(x, z) {
  if (x >= STAIR.aX0 && x < CX && z >= STAIR.aZ[0] && z <= STAIR.aZ[1]) {
    return Math.min(NA - 1, Math.floor(((x - STAIR.aX0) / (CX - STAIR.aX0)) * NA));
  }
  if (x >= CX && x <= STAIR.winderX1 && z >= STAIR.winderZ[0] && z <= STAIR.winderZ[1]) {
    const t = THREE.MathUtils.clamp(winderAngle(x, z) / Math.PI, 0, 0.9999);
    return NA + Math.floor(t * NW);
  }
  if (x >= STAIR.bX1 && x < CX && z >= STAIR.bZ[0] && z <= STAIR.bZ[1]) {
    return NA + NW + Math.min(NB - 1, Math.floor(((CX - x) / (CX - STAIR.bX1)) * NB));
  }
  return -1;
}

/** Walking surface height of the stair at (x, z), or null when not on it. */
export function stairHeight(x, z) {
  const i = treadIndex(x, z);
  return i < 0 ? null : LEVELS[0].floor + (i + 1) * stairRiser();
}

/** Underside of the stair at (x, z), or null when not on it: the Entréplan floor under flight A (solid), else the
 * tread slab's soffit (STAIR.treadSlab under the tread, never below the floor) — what head room and the things in
 * the Klk under flight B / the winders (#338) have to clear. */
export function stairUnderside(x, z) {
  const i = treadIndex(x, z);
  if (i < 0) return null;
  const base = LEVELS[0].floor;
  return i < NA ? base : Math.max(base, base + (i + 1) * stairRiser() - STAIR.treadSlab);
}

/** Tread index under (x, z) (0 = the bottom tread of flight A), or -1. */
export { treadIndex };

// Point where a ray from the winder pivot at angle θ leaves the winder box.
function rayToBox(theta) {
  const dx = Math.sin(theta), dz = Math.cos(theta);
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (STAIR.winderX1 - CX) / dx);
  if (dz > 1e-6) t = Math.min(t, (STAIR.winderZ[1] - CZ) / dz);
  if (dz < -1e-6) t = Math.min(t, (STAIR.winderZ[0] - CZ) / dz);
  if (dx < -1e-6) t = Math.min(t, 0);
  return [CX + dx * t, CZ + dz * t];
}

function prism(points, y0, y1, material) {
  // points: [[x, z], ...] footprint → vertical prism between y0 and y1
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  // group 0 = both caps, the bottom one first: the underside gets the risers' white (seen from the Klk under the
  // stair, #352), only the top is parquet
  const caps = geo.groups.find((g) => g.materialIndex === 0);
  if (caps && Array.isArray(material)) {
    const half = caps.count / 2;
    geo.groups = geo.groups.filter((g) => g !== caps);
    geo.addGroup(caps.start, half, 1);
    geo.addGroup(caps.start + half, half, 0);
  }
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Stair treads as meshes. Flight A is solid to the floor; the rest are STAIR.treadSlab thick slabs. */
export function buildStairs(material) {
  const group = new THREE.Group();
  const base = LEVELS[0].floor, riser = stairRiser();
  const slab = STAIR.treadSlab;
  for (let i = 0; i < N_TREADS; i++) {
    const top = base + (i + 1) * riser;
    let pts;
    if (i < NA) {
      const xa = STAIR.aX0 + ((CX - STAIR.aX0) * i) / NA;
      const xb = STAIR.aX0 + ((CX - STAIR.aX0) * (i + 1)) / NA;
      pts = [[xa, STAIR.aZ[0]], [xb, STAIR.aZ[0]], [xb, STAIR.aZ[1]], [xa, STAIR.aZ[1]]];
      group.add(prism(pts, base, top, material));
      continue;
    }
    if (i < NA + NW) {
      const k = i - NA;
      const t0 = (Math.PI * k) / NW, t1 = (Math.PI * (k + 1)) / NW;
      pts = [[CX, CZ], rayToBox(t0)];
      // box corners swept between the two rays
      for (const c of [[STAIR.winderX1, STAIR.winderZ[1]], [STAIR.winderX1, STAIR.winderZ[0]]]) {
        const a = winderAngle(c[0], c[1]);
        if (a > t0 && a < t1) pts.push(c);
      }
      pts.push(rayToBox(t1));
    } else {
      const k = i - NA - NW;
      const xa = CX - ((CX - STAIR.bX1) * k) / NB;
      const xb = CX - ((CX - STAIR.bX1) * (k + 1)) / NB;
      pts = [[xb, STAIR.bZ[0]], [xa, STAIR.bZ[0]], [xa, STAIR.bZ[1]], [xb, STAIR.bZ[1]]];
    }
    group.add(prism(pts, Math.max(base, top - slab), top, material));
  }
  return group;
}

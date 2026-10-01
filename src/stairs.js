import * as THREE from 'three';
import { STAIR, LEVELS } from './config.js';

const RISE = LEVELS[1].floor - LEVELS[0].floor;
const { a: NA, w: NW, b: NB } = STAIR.treads;
const N_TREADS = NA + NW + NB;
const RISER = RISE / (N_TREADS + 1);
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
  return i < 0 ? null : LEVELS[0].floor + (i + 1) * RISER;
}

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
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Stair treads as meshes. Flight A is solid to the floor; the rest are 25 cm slabs. */
export function buildStairs(material) {
  const group = new THREE.Group();
  const base = LEVELS[0].floor;
  const slab = 0.25;
  for (let i = 0; i < N_TREADS; i++) {
    const top = base + (i + 1) * RISER;
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

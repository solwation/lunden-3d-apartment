import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

// ---- Handrails (#419, STAIR.handrail; every size a guess) ----
// Each run is a plan polyline: [the end in the wall, the main path …, the end in the wall]. The rail follows the pitch
// line through the nosings on its own path (h over them), eased over ±smooth so the winders' longer outer goings blend
// in, horizontal past the first / last nosing (the extension) and in the returns to the wall; the plan corners and the
// returns are rounded over ±bend.

const STEP = 0.01; // m between the samples along a run

// the runs' plan polylines, wall side and nosings ({ x, z, y }: the front edge of a tread on the rail's path, its top)
function runSpecs() {
  const H = STAIR.handrail, o = H.gap + H.r, R = stairRiser(), base = LEVELS[0].floor;
  const O = H.outer, zS = O.south - o, xE = O.east - o, zN = O.north + o;
  const nose = (i) => base + (i + 1) * R; // top of tread i
  // flight A's nosings (west edges) and flight B's (east edges) on a line z
  const flightA = (z) => Array.from({ length: NA }, (_, i) => ({ x: STAIR.aX0 + ((CX - STAIR.aX0) * i) / NA, z, y: nose(i) }));
  const flightB = (z) => Array.from({ length: NB }, (_, k) => ({ x: CX - ((CX - STAIR.bX1) * k) / NB, z, y: nose(NA + NW + k) }));
  const top = LEVELS[1].floor; // the slab edge is the last nosing
  // the winders' front edges: rays from the pivot to the outer rail's rectangle
  const winders = Array.from({ length: NW }, (_, k) => {
    const t = (Math.PI * k) / NW, dx = Math.sin(t), dz = Math.cos(t);
    let d = Infinity;
    if (dx > 1e-6) d = Math.min(d, (xE - CX) / dx);
    if (dz > 1e-6) d = Math.min(d, (zS - CZ) / dz);
    if (dz < -1e-6) d = Math.min(d, (zN - CZ) / dz);
    return { x: CX + dx * d, z: CZ + dz * d, y: nose(NA + k) };
  });
  const x0 = Math.max(STAIR.aX0 - H.ext, O.from + o), x1 = Math.max(STAIR.bX1 - H.ext, O.to + o);
  const outer = {
    name: 'outer', side: 1,
    path: [[x0, O.south + 0.01], [x0, zS], [xE, zS], [xE, zN], [x1, zN], [x1, O.north - 0.01]],
    nosings: [...flightA(zS), ...winders, ...flightB(zN), { x: STAIR.bX1, z: zN, y: top }],
  };
  const A = H.innerA, zA = A.face + o;
  const a0 = Math.max(STAIR.aX0 - H.ext, A.from + H.r + 0.02), a1 = Math.min(CX + H.ext, A.to - H.r - 0.02);
  const innerA = {
    name: 'innerA', side: -1,
    path: [[a0, A.face - 0.01], [a0, zA], [a1, zA], [a1, A.face - 0.01]],
    nosings: [...flightA(zA), { x: CX, z: zA, y: nose(NA) }],
  };
  // flight B's inner side: the balusters (2 cm) on the middle line between the newels (world.js), ends into the newels
  const midZ = (STAIR.aZ[0] + STAIR.bZ[1]) / 2, np = STAIR.newel / 2, zB = midZ - 0.01 - o;
  const b0 = Math.min(CX, A.to - np), b1 = STAIR.hole.x0, zIn = midZ - np + 0.01;
  const innerB = {
    name: 'innerB', side: -1,
    path: [[b0, zIn], [b0, zB], [b1, zB], [b1, zIn]],
    nosings: [...flightB(zB), { x: STAIR.bX1, z: zB, y: top }],
  };
  return [outer, innerA, innerB];
}

// moving average over ±half samples, symmetric (shrinking towards the ends, which stay put)
function smoothArr(a, half) {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const k = Math.min(half, i, a.length - 1 - i);
    let sum = 0;
    for (let j = i - k; j <= i + k; j++) sum += a[j];
    out[i] = sum / (2 * k + 1);
  }
  return out;
}

/** The handrail runs as dense samples: `points` [[x, y, z]] (the rail's axis) at arc lengths `s`, the main path
 * `main` = [s0, s1] (without the returns), `nosings` ({ x, z, y, s }), `pitch(s)` = the pitch line, the wall side
 * `side` (see `wallDir`). */
export function handrailRuns() {
  const H = STAIR.handrail;
  return runSpecs().map((spec) => {
    const P = spec.path, segS = [];
    const xs = [], zs = [], ss = [];
    let s = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / STEP));
      segS.push(s);
      for (let k = 0; k < n; k++) { xs.push(ax + ((bx - ax) * k) / n); zs.push(az + ((bz - az) * k) / n); ss.push(s + (L * k) / n); }
      s += L;
    }
    segS.push(s);
    xs.push(P.at(-1)[0]); zs.push(P.at(-1)[1]); ss.push(s);
    const main = [segS[1], segS[P.length - 2]];
    // nosings → s along the main path (its first / last segment extended past the ends)
    const nosings = spec.nosings.map((n) => {
      let best = Infinity, bs = 0;
      for (let i = 1; i < P.length - 2; i++) {
        const [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az);
        let t = ((n.x - ax) * (bx - ax) + (n.z - az) * (bz - az)) / (L * L);
        if (i > 1) t = Math.max(t, 0);
        if (i < P.length - 3) t = Math.min(t, 1);
        const d = Math.hypot(ax + (bx - ax) * t - n.x, az + (bz - az) * t - n.z);
        if (d < best) { best = d; bs = segS[i] + t * L; }
      }
      return { ...n, s: bs };
    }).sort((p, q) => p.s - q.s);
    const pitch = (q) => {
      if (q <= nosings[0].s) return nosings[0].y;
      for (let i = 1; i < nosings.length; i++) {
        const a = nosings[i - 1], b = nosings[i];
        if (q <= b.s) return a.y + ((b.y - a.y) * (q - a.s)) / Math.max(1e-9, b.s - a.s);
      }
      return nosings.at(-1).y;
    };
    const ys = smoothArr(ss.map((q) => pitch(Math.min(main[1], Math.max(main[0], q))) + H.h), Math.round(H.smooth / STEP));
    const bx = smoothArr(xs, Math.round(H.bend / STEP)), bz = smoothArr(zs, Math.round(H.bend / STEP));
    const points = ss.map((_, i) => [bx[i], ys[i], bz[i]]);
    return { name: spec.name, side: spec.side, s: ss, points, main, nosings, pitch };
  });
}

/** Unit plan direction from a run's axis towards its wall (or the balusters), for the tangent [tx, tz]. */
export function wallDir(side, tx, tz) {
  return side > 0 ? [-tz, tx] : [tz, -tx];
}

/** The handrails as meshes (one per run: the tube + its brackets) in the railing's material, so mergeStatic bakes them
 * in with the railing / the other M.rail parts of their level (no draw call of their own). */
export function buildHandrails(material) {
  const H = STAIR.handrail, B = H.bracket, o = H.gap + H.r;
  const group = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const cyl = (r, len, at, axis) => {
    q.setFromUnitVectors(up, axis.clone().normalize());
    return new THREE.CylinderGeometry(r, r, len, 10, 1).applyMatrix4(m.compose(at, q, one));
  };
  for (const run of handrailRuns()) {
    const P = run.points, last = P.length - 1;
    const pts = P.filter((_, i) => i % 3 === 0 || i === last).map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const geos = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.round(pts.length * 1.5), H.r, 10, false)];
    // brackets on the main path, ~B.every apart, shifted off the plan corners
    const [s0, s1] = run.main, L = s1 - s0 - 0.2, n = Math.max(2, Math.round(L / B.every) + 1);
    const at = (s) => Math.min(last, Math.max(0, Math.round(s / STEP)));
    const tangent = (i) => {
      const a = P[Math.max(0, i - 3)], b = P[Math.min(last, i + 3)], l = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      return [(b[0] - a[0]) / l, (b[2] - a[2]) / l];
    };
    for (let j = 0; j < n; j++) {
      let s = s0 + 0.1 + (L * j) / (n - 1);
      for (let tries = 0; tries < 6; tries++) { // a straight stretch: the same tangent ±0.12 m round it
        const t1 = tangent(at(s - 0.12)), t2 = tangent(at(s + 0.12));
        if (t1[0] * t2[0] + t1[1] * t2[1] > 0.995) break;
        s += (j < n / 2 ? 1 : -1) * 0.1;
      }
      const i = at(s), [x, y, z] = P[i], [tx, tz] = tangent(i), [wx, wz] = wallDir(run.side, tx, tz), yb = y - B.drop;
      const w = new THREE.Vector3(wx, 0, wz);
      geos.push(cyl(B.r, o, new THREE.Vector3(x + (wx * o) / 2, yb, z + (wz * o) / 2), w)); // arm from the wall
      geos.push(cyl(B.r, B.drop, new THREE.Vector3(x, yb + B.drop / 2, z), up)); // stem up into the rail
      geos.push(cyl(B.rose, B.roseT, new THREE.Vector3(x + wx * (o - B.roseT / 2), yb, z + wz * (o - B.roseT / 2)), w)); // rose
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => g.toNonIndexed())), material);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = `handrail-${run.name}`;
    group.add(mesh);
  }
  return group;
}

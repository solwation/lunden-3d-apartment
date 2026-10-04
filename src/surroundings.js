import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE as S, COLORS, SEASON, COURTYARD } from './config.js';
import { registerTrees, registerSnow } from './seasons.js';
import { buildStreet } from './street.js';
import { onRoad, pathStrip, filletGeometry } from './roads.js';

// The rest of Kv. Lunden and its neighbourhood (SITE in config): the brick point blocks Hus A, B, C
// with low hip roofs, the schools and buildings around the plot, Sankt Lars väg and Karpvägen,
// the courtyard walks, the 3 m drop to S:t Lars park, trees and Höje å, plus a sky with clouds.
// Everything is merged/instanced: a handful of draw calls.

const T = S.terrain;
/** On the garage box (the raised courtyard)? */
const onBox = (x, z) => T.box.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
const E = T.east, Wst = T.west, R = T.ramp;
/** Linear in z through [z, y] pairs, flat beyond the ends. */
function profileY(P, z) {
  if (z <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) if (z <= P[i][0]) return P[i - 1][1] + ((z - P[i - 1][0]) / (P[i][0] - P[i - 1][0])) * (P[i][1] - P[i - 1][1]);
  return P[P.length - 1][1];
}
/** The ground along Sankt Lars väg's east leg (#255, #256): T.east.profile, linear in z. */
const eastY = (z) => profileY(E.profile, z);
/** … along Karpvägen (#256): T.west.profile. */
export const westY = (z) => profileY(Wst.profile, z);
/** The ramp from the landing (R.z1, courtyard level) down north to the street by Hus L's gable (#256). */
const onRamp = (x, z) => x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1;
const rampY = (z) => -R.drop * THREE.MathUtils.clamp((R.z1 - z) / (R.z1 - R.z0), 0, 1);
/** West of here the ground follows Karpvägen: the NW stair's top line south to its end, then Hus C's west façade line. */
const westEdge = (z) => (z < Wst.stair.z1 ? Wst.stair.x1 : Wst.x);
/** The Å-husen's entrance recesses as walkable floors (#355): a rectangle inside the house at the recess's lowest
 * storey's floor (the courtyard's level for Hus A's / B's north entrances, the park level for their side doors). */
export const recessFloors = S.blocks.flatMap((b) => (b.recesses ?? []).map((r) => {
  const nz = r.face === 'n' || r.face === 's', line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[r.face], out = r.face === 's' || r.face === 'e' ? 1 : -1;
  const [c0, c1] = [Math.min(line, line - out * r.depth), Math.max(line, line - out * r.depth)];
  return { block: b, r, y: b.base + (r.from ?? 0) * S.storey, ...(nz ? { x0: r.a0, x1: r.a1, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: r.a0, z1: r.a1 }) };
}));
/** The stairs down from the courtyard (T.stairs, terraceStairs below): [x0, x1, z0, z1, y] per tread (#355: walkable). */
const stairTreads = T.stairs.flatMap((St) => {
  const drop = St.drop ?? -T.park, steps = St.steps ?? Math.round(drop / 0.17), rise = drop / steps, half = St.landing ? Math.floor(steps / 2) : -1;
  const out = [];
  let z = St.z;
  for (let k = 0; k < steps; k++) { const run = k === half - 1 ? St.landing : St.step; out.push([St.x0, St.x1, z, z + run, -rise * (k + 1)]); z += run; }
  return out;
});
/** The NW stair's tread height at x (nwStair below: tread k from x0 + k·run to x1 at foot + (k + 1)·rise), or −∞. */
function nwTread(x) {
  const St = Wst.stair;
  if (x < St.x0 || x > St.x1) return -Infinity;
  const foot = westY(St.z1), rise = -foot / St.risers, run = (St.x1 - St.x0) / (St.risers - 1);
  let k = Math.min(St.risers - 1, Math.floor((x - St.x0) / run + 1e-9));
  if (x < Math.min(St.x0 + k * run, St.x1 - 0.03)) k--;
  return foot + (k + 1) * rise;
}
/** Ground height at plan (x, z): the street / courtyard level north of Hus L and on the garage box,
 * the park level around the box, east of it Sankt Lars väg's gentler slope, west of it Karpvägen's (#256).
 * #355: also the stairs' treads and the Å-husen's entrance recesses, so the visitor walks the whole block. */
export function groundY(x, z) {
  for (const [x0, x1, z0, z1, y] of stairTreads) if (x >= x0 && x <= x1 && z > z0 && z <= z1) return y;
  for (const f of recessFloors) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) return f.y;
  if (z <= Wst.stair.z1) return Math.max(terrainY(x, z), nwTread(x)); // the NW stair's treads over the verge
  return terrainY(x, z);
}
/** The terrain itself (the grass / asphalt surface; groundY without the stairs' treads and the recesses' floors). */
function terrainY(x, z) {
  if (onRamp(x, z)) return rampY(z);
  if (onBox(x, z)) return 0;
  const park = T.park * THREE.MathUtils.clamp((z - T.north) / T.slope, 0, 1); // 0 north of Hus L's back
  if (x < westEdge(z)) return westY(z);
  if (z <= T.north ? x <= E.gable : x < E.x0) return z <= T.north ? 0 : park;
  // the east leg: the road's profile from our pavement on; west of it the front yard (level) or the strip along the
  // gable (from the entrance path down to the ramp's foot), joined by a bank between `level` and `walk`
  const road = eastY(z), near = road * THREE.MathUtils.clamp(z / R.z0, 0, 1);
  const street = THREE.MathUtils.lerp(near, road, THREE.MathUtils.clamp((x - E.level) / (E.walk - E.level), 0, 1));
  return THREE.MathUtils.lerp(street, Math.min(park, road), THREE.MathUtils.clamp((x - E.x1) / E.blend, 0, 1)); // never back up
}

/** Where the terrain starts north of Hus L's back (#256): the street side there is world.js's flat plate, except
 * where Sankt Lars väg's east leg or Karpvägen slope (west of `westEdge`, east of Hus L's gable). */
export const terrainNorth = Math.min(E.profile[0][0], Wst.profile[0][0]);
/** Terrain south of Hus L and along the sloping streets: a grid with lines on every box edge, so the step at the edges
 * is vertical. */
function terrainGeometry() {
  const St = Wst.stair, z0 = terrainNorth;
  const xs = new Set([-200, 200, E.x0 - 0.01, E.x0 + 0.01, E.x1, E.x1 + E.blend, E.gable, E.level, E.walk, R.x0 + 0.01, R.x1 - 0.01, R.x1 + 0.01,
      Wst.x - 0.01, Wst.x + 0.01, St.x1 - 0.01, St.x1 + 0.01]),
    zs = new Set([z0, 0, T.north, 260, T.north + T.slope, ...E.profile.map((p) => p[0]), ...Wst.profile.map((p) => p[0]), R.z0, R.z1, St.z1 - 0.01, St.z1 + 0.01]);
  for (let x = -200; x <= 200; x += 4) xs.add(x);
  for (let z = z0; z <= 260; z += 4) zs.add(z);
  for (const b of T.box) { for (const x of [b.x0, b.x1]) { xs.add(x - 0.01); xs.add(x + 0.01); } for (const z of [b.z0, b.z1]) { zs.add(z - 0.01); zs.add(z + 0.01); } }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].filter((z) => z >= z0).sort((a, b) => a - b);
  const pos = [], idx = [];
  for (const z of Z) for (const x of X) pos.push(x, terrainY(x, z) - 0.01, z);
  const nx = X.length;
  for (let j = 0; j < Z.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    const mx = (X[i] + X[i + 1]) / 2, mz = (Z[j] + Z[j + 1]) / 2;
    if (mz < T.north && mx > westEdge(mz) && mx < E.gable) continue; // world.js's flat plate
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Retaining walls of the garage box where the ground outside is lower, a coping and a railing on top,
 * and the garage door in the west face. */
function boxWalls() {
  const walls = [], rails = [], door = [];
  const quad = (ax, az, bx, bz, ya0, yb0, top = 0.12) => { // vertical quad from the outside ground up to y 0
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([ax, ya0, az, bx, yb0, bz, bx, top, bz, ax, ya0, az, bx, top, bz, ax, top, az], 3));
    const ua = (Math.abs(bx - ax) > Math.abs(bz - az) ? ax : az) / 2, ub = (Math.abs(bx - ax) > Math.abs(bz - az) ? bx : bz) / 2; // brick, 2 m per tile (#148)
    g.setAttribute('uv', new THREE.Float32BufferAttribute([ua, ya0 / 2, ub, yb0 / 2, ub, 0.06, ua, ya0 / 2, ub, 0.06, ua, 0.06], 2));
    g.computeVertexNormals();
    return g;
  };
  const slats = [], segments = [];
  const atStairs = (x0, x1, z) => T.stairs.some((St) => Math.abs(z - St.z) < 0.05 && (x0 + x1) / 2 > St.x0 && (x0 + x1) / 2 < St.x1); // (the edge is cut at its sides, #355)
  const edges = [];
  for (const b of T.box) edges.push([b.x0, b.z0, b.x1, b.z0, 0, -1], [b.x1, b.z0, b.x1, b.z1, 1, 0], [b.x1, b.z1, b.x0, b.z1, 0, 1], [b.x0, b.z1, b.x0, b.z0, -1, 0]);
  const NW = T.west.stair; // #256: the forecourt's edge where the NW stair ends, and on to the box (Hus C's west façade line)
  edges.push([NW.x1, NW.z1, NW.x0, NW.z1, 0, -1], [T.west.x, T.box[0].z0, T.west.x, NW.z1, -1, 0]);
  for (const [ax, az, bx, bz, ox, oz] of edges) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 1));
    // ≤ 1 m pieces, also cut where a house's side meets the edge, so the piece beside a façade is guarded right up to
    // it (#346: Hus A's NE corner left a 4 cm unguarded gap on the 1.4 m drop)
    const ts = new Set(Array.from({ length: n + 1 }, (_, k) => k / n));
    const touch = (b) => (oz ? az > b.z0 - 0.2 && az < b.z1 + 0.2 : ax > b.x0 - 0.2 && ax < b.x1 + 0.2); // a house on this edge's line
    for (const b of S.blocks.filter(touch)) for (const t of oz ? [(b.x0 - ax) / (bx - ax), (b.x1 - ax) / (bx - ax)] : [(b.z0 - az) / (bz - az), (b.z1 - az) / (bz - az)])
      if (t > 1e-4 && t < 1 - 1e-4) ts.add(t);
    if (oz) for (const St of T.stairs) if (Math.abs(az - St.z) < 0.05) for (const t of [(St.x0 - ax) / (bx - ax), (St.x1 - ax) / (bx - ax)])
      if (t > 1e-4 && t < 1 - 1e-4) ts.add(t); // … and where a stair leaves it (#355)
    const tl = [...ts].sort((a, b) => a - b);
    for (let k = 0; k < tl.length - 1; k++) {
      const t0 = tl[k], t1 = tl[k + 1];
      if (t1 - t0 < 1e-4) continue;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const mx = (x0 + x1) / 2 + ox * 0.05, mz = (z0 + z1) / 2 + oz * 0.05; // just outside
      if (onBox(mx, mz)) continue; // an inner edge between two box parts
      const y0 = groundY(x0 + ox * 0.05, z0 + oz * 0.05), y1 = groundY(x1 + ox * 0.05, z1 + oz * 0.05);
      if (y0 > -0.005 && y1 > -0.005) continue; // no step here
      if (S.blocks.some((b) => mx > b.x0 && mx < b.x1 && mz > b.z0 && mz < b.z1)) continue; // a house's façade is the edge here (#246)
      if (!(oz && atStairs(x0, x1, z0))) segments.push([x0, z0, x1, z1]); // the visitor stays on the courtyard (#255), except down a stair (#355)
      if (y0 > -0.05 && y1 > -0.05) continue; // too small a step for a wall
      // the walls stand 4 cm outside the box edge, in front of the terrain's own (grass) step
      const wx0 = x0 + ox * 0.04, wz0 = z0 + oz * 0.04, wx1 = x1 + ox * 0.04, wz1 = z1 + oz * 0.04;
      const atDoor = ox < 0 && Math.abs(x0 - T.garageDoor.x) < 0.1 && (z0 + z1) / 2 > T.garageDoor.z0 && (z0 + z1) / 2 < T.garageDoor.z1;
      if (atDoor) { // the garage door: a dark opening with a grey roller door frame
        door.push(quad(wx0 + ox * 0.01, wz0, wx1 + ox * 0.01, wz1, y0, y1));
        walls.push(quad(wx0 + ox * 0.02, wz0, wx1 + ox * 0.02, wz1, y0 + T.garageDoor.h, y1 + T.garageDoor.h));
      } else walls.push(quad(wx0, wz0, wx1, wz1, y0, y1, oz && atStairs(x0, x1, z0) ? 0 : 0.12)); // the stair's top riser: no coping lip (#355)
      if (atStairs(x0, x1, z0)) continue; // the stair goes down here: no railing
      // coping + a light slatted railing (posts every metre, a top rail) on the courtyard side
      const sl = new THREE.PlaneGeometry(Math.hypot(x1 - x0, z1 - z0), 0.85).rotateY(Math.abs(ox) > 0 ? Math.PI / 2 : 0).translate((x0 + x1) / 2 - ox * 0.08, 0.6, (z0 + z1) / 2 - oz * 0.08);
      slats.push(sl);
      const cop = new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.3 * Math.abs(oz), 0.06, Math.abs(z1 - z0) + 0.3 * Math.abs(ox));
      rails.push(cop.translate((x0 + x1) / 2, 0.15, (z0 + z1) / 2));
      rails.push(new THREE.BoxGeometry(0.04, 0.95, 0.04).translate(x0 - ox * 0.08, 0.6, z0 - oz * 0.08));
      rails.push(new THREE.BoxGeometry(Math.abs(x1 - x0) + 0.04, 0.04, Math.abs(z1 - z0) + 0.04).translate((x0 + x1) / 2 - ox * 0.08, 1.06, (z0 + z1) / 2 - oz * 0.08));
    }
  }
  // #256: the ramp's wall along Sankt Lars väg (its top follows the ramp) with a railing, and a plinth under Hus L's east
  // gable where the ground falls along it
  const along = (ax, az, bx, bz, lo, hi, out) => { // a vertical strip from lo(x, z) up to hi(x, z), in ≤ 1 m pieces
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    for (let k = 0; k < n; k++) {
      const [x0, z0, x1, z1] = [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, ax + ((bx - ax) * (k + 1)) / n, az + ((bz - az) * (k + 1)) / n];
      const g = new THREE.BufferGeometry(), y = [lo(x0, z0), lo(x1, z1), hi(x1, z1), hi(x0, z0)];
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y[0], z0, x1, y[1], z1, x1, y[2], z1, x0, y[0], z0, x1, y[2], z1, x0, y[3], z0], 3));
      const ua = (Math.abs(bx - ax) > Math.abs(bz - az) ? x0 : z0) / 2, ub = (Math.abs(bx - ax) > Math.abs(bz - az) ? x1 : z1) / 2;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(out === slats ? [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1] : [ua, y[0] / 2, ub, y[1] / 2, ub, y[2] / 2, ua, y[0] / 2, ub, y[2] / 2, ua, y[3] / 2], 2));
      g.computeVertexNormals();
      out.push(g);
    }
  };
  const R = T.ramp, rx = R.x1, top = (x, z) => groundY(R.x1 - 0.05, z);
  along(rx + 0.04, R.z0, rx + 0.04, R.z1, (x, z) => groundY(rx + 0.06, z), (x, z) => top(x, z) + 0.12, walls);
  along(rx - 0.08, R.z0, rx - 0.08, R.z1, (x, z) => top(x, z) + 0.175, (x, z) => top(x, z) + 1.025, slats);
  const tilt = Math.atan2(R.drop, R.z1 - R.z0), mid = (R.z0 + R.z1) / 2, rlen = Math.hypot(R.drop, R.z1 - R.z0);
  rails.push(new THREE.BoxGeometry(0.3, 0.06, rlen).rotateX(-tilt).translate(rx, top(0, mid) + 0.15, mid),        // coping
    new THREE.BoxGeometry(0.04, 0.04, rlen + 0.04).rotateX(-tilt).translate(rx - 0.08, top(0, mid) + 1.06, mid));  // top rail
  for (let z = R.z0; z <= R.z1 + 1e-6; z += (R.z1 - R.z0) / Math.ceil(R.z1 - R.z0)) rails.push(new THREE.BoxGeometry(0.04, 0.95, 0.04).translate(rx - 0.08, top(0, z) + 0.6, z));
  segments.push([rx, R.z0, rx, R.z1]);
  for (const St of T.stairs) { // #355: down the stairs, their handrails on both sides
    const end = stairTreads.filter((t) => t[0] === St.x0 && t[1] === St.x1).reduce((m, t) => Math.max(m, t[3]), St.z);
    segments.push([St.x0, St.z, St.x0, end], [St.x1, St.z, St.x1, end]);
  }
  along(T.east.gable + 0.01, 0, T.east.gable + 0.01, T.north, (x, z) => groundY(x + 0.05, z), () => 0.02, walls);
  const stairs = T.stairs.map(terraceStairs);
  return { walls, rails, door, slats, segments, stairs: { solid: [...stairs.flatMap((s) => s.solid), ...nwStair()], rails: stairs.flatMap((s) => s.rails), ends: stairs.map((s) => s.end) } };
}

/** A stair from the courtyard going south, down `drop` m (default: to the park level) (#148, #254, #255): treads, a
 * landing halfway if it has one, handrails. */
function terraceStairs(St) {
  const drop = St.drop ?? -T.park, foot = -drop, steps = St.steps ?? Math.round(drop / 0.17), rise = drop / steps, half = St.landing ? Math.floor(steps / 2) : -1;
  const solid = [], rails = [];
  let z = St.z, y = 0;
  for (let k = 0; k < steps; k++) {
    y -= rise;
    const run = k === half - 1 ? St.landing : St.step;
    solid.push(new THREE.BoxGeometry(St.x1 - St.x0, y - foot + 0.02, run).translate((St.x0 + St.x1) / 2, (y + foot) / 2, z + run / 2));
    z += run;
  }
  for (const x of [St.x0 - 0.06, St.x1 + 0.06]) { // handrails following the flight, posts at both ends
    const pts = [new THREE.Vector3(x, 0.95, St.z), new THREE.Vector3(x, foot + 0.95, z)];
    rails.push(new THREE.TubeGeometry(new THREE.LineCurve3(...pts), 1, 0.022, 6));
    for (const [pz, py] of [[St.z + 0.1, 0], [z - 0.1, foot]]) rails.push(new THREE.BoxGeometry(0.04, 0.95, 0.04).translate(x, py + 0.47, pz));
  }
  return { solid, rails, end: z };
}

/** The wide stair by Hus C's NW corner down to Karpvägen (#256, våning 1): risers along z, each tread from where the
 * sloping verge west of it comes up to its height south to the stair's end (the plan's stepped outline). */
function nwStair() {
  const St = T.west.stair, foot = westY(St.z1), rise = -foot / St.risers, run = (St.x1 - St.x0) / (St.risers - 1), out = [];
  const reach = (h) => { let a = T.west.profile[0][0], b = St.z1; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (westY(m) > h) a = m; else b = m; } return a; };
  for (let k = 0; k < St.risers; k++) {
    const h = foot + (k + 1) * rise, x0 = Math.min(St.x0 + k * run, St.x1 - 0.03), z0 = reach(h - 1e-3);
    out.push(new THREE.BoxGeometry(St.x1 - x0, h - foot + 0.05, St.z1 - z0).translate((x0 + St.x1) / 2, (h + foot - 0.05) / 2, (z0 + St.z1) / 2));
  }
  return out;
}

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Bay width and storey height of a block (the old S:t Lars buildings are taller, narrower bays). */
const dims = (b) => (b.style ? S[b.style] ?? S : S); // the style's bay, storey (and rows); the Å-husen: SITE's

/** Old S:t Lars style bay: brick, a white string course at the floor line, a tall white-framed
 * window with a round-arched top (v = 0 is the bottom of the canvas). */
function oldFacadeTexture() {
  const { bay, storey } = S.old;
  const pw = 208, ph = Math.round((pw * storey) / bay), c = document.createElement('canvas');
  c.width = pw; c.height = ph;
  const g = c.getContext('2d');
  const m = pw / bay;
  g.fillStyle = '#d6cfc2';
  g.fillRect(0, 0, pw, ph);
  const rand = rng(23);
  const bw = 0.26 * m, bh = 0.075 * m;
  const base = new THREE.Color(COLORS.brick).offsetHSL(0, 0.02, -0.02);
  for (let row = 0; row * bh < ph; row++) {
    for (let x = (row % 2) * -bw / 2; x < pw; x += bw) {
      g.fillStyle = base.clone().offsetHSL(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08).getStyle();
      g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 1.5);
    }
  }
  g.fillStyle = '#eeeae2'; // string course
  g.fillRect(0, ph - 0.14 * m, pw, 0.14 * m);
  const ww = 1.0 * m, wh = 1.9 * m, wx = (pw - ww) / 2, wy = ph - (0.95 * m + wh);
  const arch = (x, y, w, h) => { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.fill(); };
  g.fillStyle = '#f4f2ec';
  arch(wx - 6, wy - 6, ww + 12, wh + 12);
  const glass = g.createLinearGradient(0, wy, 0, wy + wh);
  glass.addColorStop(0, '#61788a');
  glass.addColorStop(1, '#2a3843');
  g.fillStyle = glass;
  arch(wx, wy, ww, wh);
  g.fillStyle = '#f4f2ec';
  g.fillRect(wx + ww / 2 - 2, wy + ww / 2, 4, wh - ww / 2);           // mullion
  g.fillRect(wx, wy + ww / 2 + wh * 0.18, ww, 4);                      // transom
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const brickCourses = (g, pw, ph, m, seed, base = new THREE.Color(COLORS.brick)) => {
  const rand = rng(seed), bw = 0.26 * m, bh = 0.075 * m;
  for (let row = 0; row * bh < ph; row++) {
    for (let x = (row % 2) * -bw / 2; x < pw; x += bw) {
      g.fillStyle = base.clone().offsetHSL(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08).getStyle();
      g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 1.5);
    }
  }
};
const canvasTex = (c) => {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

/** One bay of the buildings east of us (#127): 'hepcat' = brick with a white pilaster at the bay edge and a
 * pair of white-framed windows; 'hepcatWhite' = white render, a pair below and a small window in the gable;
 * 'longhouse' = brick with a dark window in a yellow frame. */
function sideFacadeTexture(style) {
  const { bay, storey } = S[style];
  const pw = 160, ph = Math.round((pw * storey) / bay), c = document.createElement('canvas');
  c.width = pw; c.height = ph;
  const g = c.getContext('2d'), m = pw / bay, Y = (y) => ph - y * m;
  if (style === 'hepcatWhite') { g.fillStyle = '#efede7'; g.fillRect(0, 0, pw, ph); }
  else { g.fillStyle = '#d6cfc2'; g.fillRect(0, 0, pw, ph); brickCourses(g, pw, ph, m, style === 'hepcat' ? 37 : 41); }
  const win = (cx, y0, w, h, frame, bars = true) => {
    g.fillStyle = frame; g.fillRect(cx - w / 2 - 5, Y(y0 + h) - 5, w + 10, h * m + 10);
    const gr = g.createLinearGradient(0, Y(y0 + h), 0, Y(y0)); gr.addColorStop(0, '#61788a'); gr.addColorStop(1, '#2a3843');
    g.fillStyle = gr; g.fillRect(cx - w / 2, Y(y0 + h), w, h * m);
    if (bars) { g.fillStyle = frame; g.fillRect(cx - 2, Y(y0 + h), 4, h * m); }
  };
  if (style === 'hepcat') {
    g.fillStyle = '#f1efe9'; g.fillRect(0, 0, 0.45 * m, ph);               // pilaster
    g.fillRect(0, Y(0.45), pw, 0.45 * m);                                    // plinth
    g.fillRect(pw / 2 - 0.95 * m, Y(2.65), 1.9 * m, 0.22 * m);               // lintel over the pair
    win(pw / 2 - 0.42 * m, 1.05, 0.62 * m, 1.35, '#f7f6f2'); win(pw / 2 + 0.42 * m, 1.05, 0.62 * m, 1.35, '#f7f6f2');
  } else if (style === 'hepcatWhite') {
    win(pw / 2 - 0.45 * m, 1.05, 0.66 * m, 1.35, '#ffffff'); win(pw / 2 + 0.45 * m, 1.05, 0.66 * m, 1.35, '#ffffff');
    win(pw / 2, 3.9, 0.5 * m, 0.95, '#ffffff');
  } else {
    g.fillStyle = '#6b5d4c'; g.fillRect(0, Y(0.5), pw, 0.5 * m);            // a stone plinth
    win(pw / 2, 0.9, 1.0 * m, 1.45, '#e8c43a', false);
  }
  return canvasTex(c);
}

/** Dormers on the street side (west) of the long brick building's roof (#127). */
function dormers(list) {
  const geos = [];
  for (const b of list) {
    const top = b.base + S.longhouse.storey, n = Math.max(1, Math.round(S.longhouse.dormers * (b.z1 - b.z0) / 37));
    for (let k = 0; k < n; k++) {
      const z = b.z0 + ((k + 0.5) * (b.z1 - b.z0)) / n, x = b.x0 + 1.6;
      geos.push(new THREE.BoxGeometry(1.4, 1.1, 1.6).translate(x, top + 0.75, z));
      const cap = new THREE.CylinderGeometry(0.0001, 1.1, 0.5, 4, 1).rotateY(Math.PI / 4).scale(1.05, 1, 1.15).translate(x, top + 1.55, z);
      geos.push(cap.index ? cap.toNonIndexed() : cap);
    }
  }
  return geos.map((g) => { const x = g.index ? g.toNonIndexed() : g; return x; });
}

/** Plain brick, 2 × 2 m per tile (the wall along the street, #126). */
function brickTexture() {
  const pw = 256, c = document.createElement('canvas');
  c.width = c.height = pw;
  const g = c.getContext('2d');
  g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, pw, pw);
  brickCourses(g, pw, pw, pw / 2, 31, new THREE.Color(COLORS.brick).offsetHSL(0.01, 0.06, 0.04));
  return canvasTex(c);
}

/** The school across the street (#126): one bay over the full two storeys — white plinth, a tall arched window
 * below, a white string course, a square window with a white surround and a cornice line above. */
function schoolFacadeTexture() {
  const { bay, storey } = S.school;
  const pw = 192, ph = Math.round((pw * storey) / bay), c = document.createElement('canvas');
  c.width = pw; c.height = ph;
  const g = c.getContext('2d'), m = pw / bay, Y = (y) => ph - y * m; // y in metres from the ground
  g.fillStyle = '#d6cfc2'; g.fillRect(0, 0, pw, ph);
  brickCourses(g, pw, ph, m, 29, new THREE.Color(COLORS.brick).offsetHSL(0.01, 0.04, 0.02));
  const white = '#f3f1eb';
  g.fillStyle = white;
  g.fillRect(0, Y(0.6), pw, 0.6 * m);               // plinth
  g.fillRect(0, Y(4.35), pw, 0.25 * m);             // string course
  g.fillRect(0, Y(8.6), pw, 0.45 * m);              // frieze under the cornice
  const glass = (y0, y1) => { const gr = g.createLinearGradient(0, Y(y1), 0, Y(y0)); gr.addColorStop(0, '#61788a'); gr.addColorStop(1, '#2a3843'); return gr; };
  const ww = 1.15 * m, wx = (pw - ww) / 2;
  // ground floor: arched, white surround and keystone
  const arch = (x, yb, w, yt) => { const r = w / 2; g.beginPath(); g.moveTo(x, Y(yb)); g.lineTo(x, Y(yt) + r); g.arc(x + r, Y(yt) + r, r, Math.PI, 0); g.lineTo(x + w, Y(yb)); g.closePath(); g.fill(); };
  g.fillStyle = white; arch(wx - 7, 0.85, ww + 14, 3.35);
  g.fillStyle = glass(0.95, 3.25); arch(wx, 0.95, ww, 3.25);
  g.fillStyle = white;
  g.fillRect(wx + ww / 2 - 2, Y(3.25) + ww / 2, 4, (2.3 * m) - ww / 2); // mullion
  g.fillRect(wx, Y(2.45), ww, 4);                                       // transom
  g.fillRect(pw / 2 - 6, Y(3.42), 12, 0.22 * m);                        // keystone
  // upper floor: square-headed, white surround, a small cornice over it
  g.fillStyle = white; g.fillRect(wx - 7, Y(6.95), ww + 14, 2.0 * m + 7);
  g.fillRect(wx - 12, Y(7.12), ww + 24, 0.14 * m);
  g.fillStyle = glass(5.05, 6.85); g.fillRect(wx, Y(6.85), ww, 1.8 * m);
  g.fillStyle = white;
  g.fillRect(wx + ww / 2 - 2, Y(6.85), 4, 1.8 * m);
  g.fillRect(wx, Y(6.3), ww, 4);
  return canvasTex(c);
}

/** White corner quoins on a block: alternating long and short stones up both sides of every corner. */
function quoins(b, h) {
  const geos = [], step = 0.42;
  for (const [x, z, sx, sz] of [[b.x0, b.z0, 1, 1], [b.x1, b.z0, -1, 1], [b.x1, b.z1, -1, -1], [b.x0, b.z1, 1, -1]]) {
    for (let k = 0, y = 0.6; y + step <= h; k++, y += step) {
      const l = k % 2 ? 0.32 : 0.55;
      geos.push(new THREE.BoxGeometry(l, step - 0.05, 0.06).translate(x + sx * l / 2, b.base + y + step / 2, z - sz * 0.03)); // on the x face
      geos.push(new THREE.BoxGeometry(0.06, step - 0.05, l).translate(x - sx * 0.03, b.base + y + step / 2, z + sz * l / 2)); // on the z face
    }
  }
  return geos;
}

/** The brick wall along the far pavement, its black metal coping, the school's chimneys and greenhouse (#126). */
function schoolGrounds() {
  const W = S.school.wall, G = S.school.greenhouse;
  const wall = new THREE.BoxGeometry(W.x1 - W.x0, W.h, W.t).translate((W.x0 + W.x1) / 2, W.h / 2, W.z);
  const p = wall.attributes.position, n = wall.attributes.normal, uv = wall.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i)) / 2, p.getY(i) / 2); // 2 × 2 m per tile
  const coping = new THREE.BoxGeometry(W.x1 - W.x0 + 0.06, 0.06, W.t + 0.08).translate((W.x0 + W.x1) / 2, W.h + 0.03, W.z);
  const chimneys = [], main = S.blocks.find((b) => b.style === 'school'), top = main.base + S.school.storey;
  const rise = S.school.roofPitch * Math.min(main.x1 - main.x0, main.z1 - main.z0) / 2 + 0.3;
  for (const x of S.school.chimneys) chimneys.push(new THREE.BoxGeometry(0.7, 1.6, 0.5).translate(x, top + rise + 0.2, (main.z0 + main.z1) / 2 + (x % 2 ? 0.8 : -0.8)));
  // greenhouse: a dark frame and glass panes under a pitched glass roof
  const frame = [], panes = [], cx = (G.x0 + G.x1) / 2, cz = (G.z0 + G.z1) / 2, d = G.z1 - G.z0;
  for (let x = G.x0; x <= G.x1 + 1e-6; x += (G.x1 - G.x0) / 8) for (const z of [G.z0, G.z1]) frame.push(new THREE.BoxGeometry(0.05, G.h, 0.05).translate(x, G.h / 2, z));
  for (const z of [G.z0, G.z1]) frame.push(new THREE.BoxGeometry(G.x1 - G.x0, 0.05, 0.05).translate(cx, G.h, z));
  frame.push(new THREE.BoxGeometry(G.x1 - G.x0, 0.06, 0.06).translate(cx, G.h + G.ridge, cz));
  const roofLen = Math.hypot(d / 2, G.ridge), tilt = Math.atan2(G.ridge, d / 2);
  for (const sgn of [-1, 1]) panes.push(new THREE.PlaneGeometry(G.x1 - G.x0, roofLen).rotateX(-Math.PI / 2 + sgn * tilt).translate(cx, G.h + G.ridge / 2, cz + sgn * d / 4));
  panes.push(new THREE.PlaneGeometry(G.x1 - G.x0, G.h).translate(cx, G.h / 2, G.z0), new THREE.PlaneGeometry(G.x1 - G.x0, G.h).translate(cx, G.h / 2, G.z1));
  for (const x of [G.x0, G.x1]) panes.push(new THREE.PlaneGeometry(d, G.h).rotateY(Math.PI / 2).translate(x, G.h / 2, cz));
  return { wall: [wall], coping: [coping, ...chimneys], frame, panes };
}

/** One storey × one window bay of brick façade with a white-framed window (`plain`: the bricks only, for the
 * loggias' piers and parapets, #266). */
function facadeTexture(plain = false) {
  const px = 256, c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const m = px / S.bay; // px per metre
  g.fillStyle = '#cfc6b8';
  g.fillRect(0, 0, px, px);
  const rand = rng(11);
  const bw = 0.26 * m, bh = 0.075 * m;
  const base = new THREE.Color(COLORS.brick);
  for (let row = 0; row * bh < px; row++) {
    for (let x = (row % 2) * -bw / 2; x < px; x += bw) {
      g.fillStyle = base.clone().offsetHSL(0, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.08).getStyle();
      g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 1.5);
    }
  }
  if (plain) return canvasTex(c);
  // window: 1.3 × 1.5 m, sill 0.8 m above the storey floor (v = 0 is the bottom of the canvas); like Peab's
  // renders (#146): set back in a deep brick reveal (its shadow on the top and the left), white sashes with a
  // mullion and a transom, a soldier course of upright bricks under it and over it
  const ww = 1.3 * m, wh = 1.5 * m, wx = (px - ww) / 2, wy = px - (0.8 * m + wh);
  const soldiers = (y, h) => {
    for (let x = wx - 0.06 * m; x < wx + ww + 0.06 * m; x += 0.075 * m) {
      g.fillStyle = base.clone().offsetHSL(0, 0, -0.06 + (rand() - 0.5) * 0.06).getStyle();
      g.fillRect(x + 1, y, 0.075 * m - 2, h);
    }
  };
  g.fillStyle = '#cfc6b8'; g.fillRect(wx - 0.07 * m, wy + wh, ww + 0.14 * m, 0.2 * m); // mortar behind the soldiers
  soldiers(wy + wh + 0.01 * m, 0.18 * m);                                              // the sill: upright bricks
  g.fillStyle = '#cfc6b8'; g.fillRect(wx - 0.07 * m, wy - 0.2 * m, ww + 0.14 * m, 0.2 * m);
  soldiers(wy - 0.19 * m, 0.18 * m);                                                   // the lintel
  const glass = g.createLinearGradient(0, wy, 0, wy + wh);
  glass.addColorStop(0, '#6b8293');
  glass.addColorStop(1, '#2c3a45');
  g.fillStyle = '#f4f4f1'; g.fillRect(wx, wy, ww, wh);                                 // the white frame
  g.fillStyle = glass;
  g.fillRect(wx + 0.05 * m, wy + 0.05 * m, ww - 0.1 * m, wh - 0.1 * m);
  g.fillStyle = '#f4f4f1';
  g.fillRect(wx + ww * 0.62 - 3, wy, 6, wh);                 // mullion (a wide and a narrow light)
  g.fillRect(wx, wy + wh * 0.22, ww * 0.62, 5);              // transom over the wide light
  g.fillStyle = 'rgba(0,0,0,0.28)';                          // the deep reveal's shadow
  g.fillRect(wx, wy, ww, 0.07 * m);
  g.fillRect(wx, wy, 0.06 * m, wh);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The Å-husen's listed façade openings (#345) as decals: one atlas — the window of the old grid tile (white frame,
 * mullion, transom, the reveal's shadow) over v WIN…1, a soldier course of upright bricks over v 0…SOLD. */
const WIN = 0.2, SOLD = 0.16;
function openingTexture() {
  const W = 256, H = 320, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), wh = H * (1 - WIN), rand = rng(12), base = new THREE.Color(COLORS.brick);
  const glass = g.createLinearGradient(0, 0, 0, wh);
  glass.addColorStop(0, '#6b8293');
  glass.addColorStop(1, '#2c3a45');
  g.fillStyle = '#f4f4f1'; g.fillRect(0, 0, W, wh);                     // the white frame
  const f = W * 0.05 / 1.3;
  g.fillStyle = glass; g.fillRect(f, f, W - 2 * f, wh - 2 * f);
  g.fillStyle = '#f4f4f1';
  g.fillRect(W * 0.62 - 3, 0, 6, wh);                                   // mullion (a wide and a narrow light)
  g.fillRect(0, wh * 0.22, W * 0.62, 5);                                // transom over the wide light
  g.fillStyle = 'rgba(0,0,0,0.28)';                                     // the deep reveal's shadow
  g.fillRect(0, 0, W, W * 0.07 / 1.3); g.fillRect(0, 0, W * 0.06 / 1.3, wh);
  const sy = H * (1 - SOLD);
  g.fillStyle = '#cfc6b8'; g.fillRect(0, sy, W, H - sy);                // mortar behind the soldiers
  for (let x = 0; x < W; x += W / 20) {
    g.fillStyle = base.clone().offsetHSL(0, 0, -0.06 + (rand() - 0.5) * 0.06).getStyle();
    g.fillRect(x + 1, sy + 2, W / 20 - 2, H - sy - 4);
  }
  const tex = canvasTex(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Light slatted balcony railing (#108): vertical slats under a handrail, transparent between (alphaTest). */
function railTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#b9bdbd';
  for (let x = 1; x < 128; x += 16) g.fillRect(x, 6, 7, 58);
  g.fillRect(0, 0, 128, 9); g.fillRect(0, 57, 128, 7);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Is a recess on storey `st` (-1 = on any)? */
const onStorey = (r, st) => st < 0 || (st >= (r.from ?? 0) && st <= (r.to ?? Infinity));

/** The cuts in an Å-hus façade (#258): [a0, a1] spans along face n|e|s|w (plan x on n/s, z on e/w) taken by a corner
 * loggia or by a recess on storey `st` (-1 = any storey). */
function cuts(b, face, st = -1) {
  const c = b.corners, i = face === 'n' || face === 's' ? 0 : 1;
  const [lo, hi] = i === 0 ? [b.x0, b.x1] : [b.z0, b.z1];
  const [first, last] = { n: [c.nw, c.ne], s: [c.sw, c.se], w: [c.nw, c.sw], e: [c.ne, c.se] }[face];
  return [[lo, lo + first[i]], [hi - last[i], hi], ...(b.recesses ?? []).filter((r) => r.face === face && onStorey(r, st)).map((r) => [r.a0, r.a1])];
}
/** Does [a0, a1] along a face overlap a loggia or recess there? */
const inCut = (b, face, a0, a1, st = -1) => cuts(b, face, st).some(([c0, c1]) => a1 > c0 && a0 < c1)
  || (st < 0 && (S.facades?.[b.name]?.[face] ?? []).some(([o0, o1]) => a1 > o0 - 0.1 && a0 < o1 + 0.1)); // a listed opening (#345)

/** An Å-hus's plan outline on storey `st`: the rectangle with its corner loggias and the recesses of that storey. */
function outline(b, st) {
  const { nw, ne, se, sw } = b.corners;
  const rs = (f, desc) => (b.recesses ?? []).filter((r) => r.face === f && onStorey(r, st)).sort((p, q) => (desc ? q.a0 - p.a0 : p.a0 - q.a0));
  const pts = [[b.x0, b.z0 + nw[1]], [b.x0 + nw[0], b.z0 + nw[1]], [b.x0 + nw[0], b.z0]];
  for (const r of rs('n')) pts.push([r.a0, b.z0], [r.a0, b.z0 + r.depth], [r.a1, b.z0 + r.depth], [r.a1, b.z0]);
  pts.push([b.x1 - ne[0], b.z0], [b.x1 - ne[0], b.z0 + ne[1]], [b.x1, b.z0 + ne[1]]);
  for (const r of rs('e')) pts.push([b.x1, r.a0], [b.x1 - r.depth, r.a0], [b.x1 - r.depth, r.a1], [b.x1, r.a1]);
  pts.push([b.x1, b.z1 - se[1]], [b.x1 - se[0], b.z1 - se[1]], [b.x1 - se[0], b.z1]);
  for (const r of rs('s', true)) pts.push([r.a1, b.z1], [r.a1, b.z1 - r.depth], [r.a0, b.z1 - r.depth], [r.a0, b.z1]);
  pts.push([b.x0 + sw[0], b.z1], [b.x0 + sw[0], b.z1 - sw[1]], [b.x0, b.z1 - sw[1]]);
  for (const r of rs('w', true)) pts.push([b.x0, r.a1], [b.x0 + r.depth, r.a1], [b.x0 + r.depth, r.a0], [b.x0, r.a0]);
  return pts;
}

/** An Å-hus's outline where the visitor walks (#355): the rectangle (the corner loggias are closed by their parapets and
 * railings in the façade line) with every entrance recess cut in. */
function groundOutline(b) {
  const rs = (f, desc) => (b.recesses ?? []).filter((r) => r.face === f).sort((p, q) => (desc ? q.a0 - p.a0 : p.a0 - q.a0));
  const pts = [[b.x0, b.z0]];
  for (const r of rs('n')) pts.push([r.a0, b.z0], [r.a0, b.z0 + r.depth], [r.a1, b.z0 + r.depth], [r.a1, b.z0]);
  pts.push([b.x1, b.z0]);
  for (const r of rs('e')) pts.push([b.x1, r.a0], [b.x1 - r.depth, r.a0], [b.x1 - r.depth, r.a1], [b.x1, r.a1]);
  pts.push([b.x1, b.z1]);
  for (const r of rs('s', true)) pts.push([r.a1, b.z1], [r.a1, b.z1 - r.depth], [r.a0, b.z1 - r.depth], [r.a0, b.z1]);
  pts.push([b.x0, b.z1]);
  for (const r of rs('w', true)) pts.push([b.x0, r.a1], [b.x0 + r.depth, r.a1], [b.x0 + r.depth, r.a0], [b.x0, r.a0]);
  return pts;
}

/** An Å-hus face's outer line: [the plan coordinate across it, +1 / −1 = it looks towards +z|+x / −z|−x]. */
const faceLine = (b, f) => ({ n: [b.z0, -1], s: [b.z1, 1], w: [b.x0, -1], e: [b.x1, 1] })[f];

/** An Å-hus's façade openings from SITE.facades (#345), one per storey and opening above the ground there:
 * { face, kind, st, a0, a1, x0, z0, x1, z1 (a line on the façade), n (facing [x, z]), y0, y1 }. */
function facadeOpenings(b) {
  const F = S.facades?.[b.name], Z = S.openingSize, out = [];
  for (const [f, list] of Object.entries(F ?? {})) {
    const [c, s] = faceLine(b, f), alongX = f === 'n' || f === 's';
    for (const [a0, a1, from, to, kind = 'window'] of list) {
      for (let st = from; st <= Math.min(to, b.storeys - 1); st++) {
        const fl = b.base + st * S.storey, door = kind === 'door', y0 = fl + (door ? 0 : Z.sill), y1 = fl + (door ? Z.door : Z.head);
        const am = (a0 + a1) / 2, g = alongX ? groundY(am, c + s * 0.6) : groundY(c + s * 0.6, am);
        if (y1 < g + 0.3) continue; // below the ground outside
        out.push({ face: f, kind, st, a0, a1, y0, y1, n: alongX ? [0, s] : [s, 0], ...(alongX ? { x0: a0, z0: c, x1: a1, z1: c } : { x0: c, z0: a0, x1: c, z1: a1 }) });
      }
    }
  }
  return out;
}

/** The listed openings as decals (#345) on the openingTexture() atlas, 15 mm proud of the brick (the lit-window quads 5 cm): the window (or glazed
 * door) and a soldier course over it (and under a window, as the sill). */
function openingDecals(b) {
  const geos = [];
  const quad2 = (o, a0, a1, y0, y1, v0, v1) => {
    const [nx, nz] = o.n, len = a1 - a0, alongX = nz !== 0, am = (a0 + a1) / 2;
    const g = new THREE.PlaneGeometry(len, y1 - y0).rotateY(Math.atan2(nx, nz));
    g.translate(alongX ? am : o.x0 + nx * 0.015, (y0 + y1) / 2, alongX ? o.z0 + nz * 0.015 : am);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
    geos.push(g);
  };
  for (const o of facadeOpenings(b)) {
    quad2(o, o.a0, o.a1, o.y0, o.y1, WIN + 0.01, 1);
    quad2(o, o.a0 - 0.06, o.a1 + 0.06, o.y1 + 0.01, o.y1 + 0.19, 0, SOLD);   // the lintel
    if (o.kind !== 'door') quad2(o, o.a0 - 0.06, o.a1 + 0.06, o.y0 - 0.19, o.y0 - 0.01, 0, SOLD); // the sill
  }
  return geos;
}

/** Split a non-indexed geometry's triangles by `pick(nx, nz, x, z)` → [picked, rest] (either may be null). */
function splitTris(geo, pick) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv, sets = [[], []];
  for (let t = 0; t < p.count; t += 3) {
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    sets[pick(n.getX(t), n.getZ(t), cx, cz) ? 0 : 1].push(t);
  }
  return sets.map((ts) => {
    if (!ts.length) return null;
    const g = new THREE.BufferGeometry();
    for (const [name, a] of [['position', p], ['normal', n], ['uv', uv]]) {
      const arr = new Float32Array(ts.length * 3 * a.itemSize);
      ts.forEach((t, i) => { for (let k = 0; k < 3 * a.itemSize; k++) arr[i * 3 * a.itemSize + k] = a.array[t * a.itemSize + k]; });
      g.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    return g;
  });
}

/** Is the triangle (normal nx, nz, centre x, z) on an outer face of `b` that has no opening list (#345: the grid)? */
function onGridFace(b, nx, nz, x, z) {
  const F = S.facades?.[b.name] ?? {}, e = 0.02;
  if (nz < -0.9 && Math.abs(z - b.z0) < e) return !F.n;
  if (nz > 0.9 && Math.abs(z - b.z1) < e) return !F.s;
  if (nx < -0.9 && Math.abs(x - b.x0) < e) return !F.w;
  if (nx > 0.9 && Math.abs(x - b.x1) < e) return !F.e;
  return false; // the loggias' and recesses' walls (covered by the white render), the caps
}

/** An Å-hus's brick body (#145, #258): its outline extruded band by band (a band = a run of storeys with the same
 * recesses), with the façade UVs of block(). #345: split into { grid } (outer faces without an opening list: the old
 * window grid texture) and { plain } (plain brick; the listed openings are decals). */
function aHouseParts(b) {
  const grid = [], plain = [];
  for (const g of aHouse(b)) {
    const [a, r] = splitTris(g.index ? g.toNonIndexed() : g, (nx, nz, x, z) => onGridFace(b, nx, nz, x, z));
    if (a) grid.push(a);
    if (r) plain.push(r);
  }
  return { grid, plain };
}

/** The bands of an Å-hus's outline, extruded (see aHouseParts). */
function aHouse(b) {
  const geos = [], key = (st) => (b.recesses ?? []).map((r) => +onStorey(r, st)).join();
  for (let st = 0; st < b.storeys;) {
    let end = st + 1;
    while (end < b.storeys && key(end) === key(st)) end++;
    const shape = new THREE.Shape(outline(b, st).map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: (end - st) * S.storey, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2).translate(0, b.base + st * S.storey, 0); // shape (x, -z) → plan (x, z), extruded up
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const along = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
      uv.setXY(i, along / S.bay, (p.getY(i) - b.base) / S.storey);
    }
    geo.clearGroups();
    geos.push(geo);
    st = end;
  }
  return geos;
}

/** A vertical quad from (xa, za) to (xb, zb), y0…y1, facing (nx, nz), 1 cm proud of the wall behind it. */
function quad(xa, za, xb, zb, nx, nz, y0, y1) {
  return new THREE.PlaneGeometry(Math.abs(xb - xa) + Math.abs(zb - za), y1 - y0).rotateY(Math.atan2(nx, nz))
    .translate((xa + xb) / 2 + nx * 0.01, (y0 + y1) / 2, (za + zb) / 2 + nz * 0.01);
}

/** A slatted railing panel from (xa, za) to (xb, zb) standing on y (a slat every 12 cm). */
function railPanel(xa, za, xb, zb, y) {
  const len = Math.hypot(xb - xa, zb - za), rail = S.loggia.rail;
  const g = new THREE.PlaneGeometry(len, rail).rotateY(-Math.atan2(zb - za, xb - xa)).translate((xa + xb) / 2, y + rail / 2, (za + zb) / 2);
  const uv = g.attributes.uv;
  for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * len);
  return g;
}

/** The four corner loggias of an Å-hus: (cx, cz) = the outer corner, (sx, sz) point into the block, the loggia is
 * lx along x and lz along z; (ix, iz) = the inner corner. */
function cornerLoggias(b) {
  const C = b.corners;
  return [[b.x0, b.z0, 1, 1, C.nw], [b.x1, b.z0, -1, 1, C.ne], [b.x1, b.z1, -1, -1, C.se], [b.x0, b.z1, 1, -1, C.sw]]
    .map(([cx, cz, sx, sz, [lx, lz]]) => ({ cx, cz, sx, sz, lx, lz, ix: cx + sx * lx, iz: cz + sz * lz }));
}

/** The ground just outside a loggia's longer front (the courtyard in front of Hus A's north loggias, #266). */
const frontGround = (l) => (l.lx >= l.lz ? groundY((l.cx + l.ix) / 2, l.cz - l.sz * 0.6) : groundY(l.cx - l.sx * 0.6, (l.cz + l.iz) / 2));

/** What a loggia storey with its floor at y (st = storeys: the roof) has at its edge (#266), g = the ground there:
 * 'buried', 'ground' (at the ground: the flat's uteplats with a brick parapet), 'rail' (up in the air), 'roof'. */
function loggiaKind(b, st, y, g) {
  if (st >= b.storeys) return 'roof';
  if (y < g - 1.2) return 'buried';
  return y < g + 1.2 ? 'ground' : 'rail';
}

/** The door and window on a loggia's longer inner wall on each storey above the ground (#266): { kind, x0, z0, x1,
 * z1 (a line along the wall), n (facing [x, z]), y0, y1 }. */
function loggiaOpenings(b) {
  const D = S.loggia.door, W = S.loggia.window, out = [];
  for (const l of cornerLoggias(b)) {
    const g = frontGround(l), alongX = l.lx >= l.lz;
    // along the long wall: a = 0 at the façade line … len at the inner corner; at(a) → [x, z]
    const len = alongX ? l.lx : l.lz, s = alongX ? l.sx : l.sz;
    const at = (a) => (alongX ? [l.cx + s * a, l.iz] : [l.ix, l.cz + s * a]), n = alongX ? [0, -l.sz] : [-l.sx, 0];
    const d1 = len - D.gap, d0 = d1 - D.w, w0 = W.from, w1 = Math.min(W.from + W.max, d0 - W.gap);
    for (let st = 0; st < b.storeys; st++) {
      const y = b.base + st * S.storey;
      if (loggiaKind(b, st, y, g) === 'buried') continue;
      const line = (kind, a0, a1, y0, y1) => { const [xa, za] = at(a0), [xb, zb] = at(a1); out.push({ kind, x0: xa, z0: za, x1: xb, z1: zb, n, y0: y + y0, y1: y + y1 }); };
      line('door', d0, d1, 0, D.h);
      if (w1 - w0 > 0.5) line('window', w0, w1, W.sill, W.head);
    }
  }
  return out;
}

/** A box from the line (xa, za)–(xb, zb), `t` thick towards (nx, nz), y0…y1 — UVs in façade bays / storeys from
 * `base` (for the plain brick tile, #266). */
function brickBox(xa, za, xb, zb, nx, nz, t, y0, y1, base) {
  const x0 = Math.min(xa, xb, xa + nx * t), x1 = Math.max(xa, xb, xa + nx * t), z0 = Math.min(za, zb, za + nz * t), z1 = Math.max(za, zb, za + nz * t);
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i)) / S.bay, (p.getY(i) - base) / S.storey);
  return g.toNonIndexed();
}

/** A glazed opening on a wall line (#266): a frame box and a glass pane in front of it (a mullion on a wide window,
 * a push bar on a door). */
function glazing(o, frames, glass) {
  const len = Math.hypot(o.x1 - o.x0, o.z1 - o.z0), ang = Math.atan2(o.n[0], o.n[1]), [nx, nz] = o.n;
  const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, h = o.y1 - o.y0, f = 0.06, ux = (o.x1 - o.x0) / len, uz = (o.z1 - o.z0) / len;
  const box = (w, hh, d, along, y, off) => new THREE.BoxGeometry(w, hh, d).rotateY(ang).translate(cx + ux * along + nx * off, y, cz + uz * along + nz * off);
  frames.push(box(len + 2 * f, h + f, 0.05, 0, o.y0 + (h + f) / 2, 0.025));
  glass.push(box(len - 2 * f, h - 2 * f, 0.02, 0, o.y0 + h / 2, 0.055));
  if (o.kind === 'window' && len > 1.5) frames.push(box(0.05, h - 2 * f, 0.03, len * 0.12, o.y0 + h / 2, 0.07)); // a mullion
  if (o.kind === 'door') frames.push(box(len - 2 * f, 0.05, 0.04, 0, o.y0 + 1.0, 0.08)); // a push bar
}

/** The house letters (#266): A | B | C side by side on one canvas, white plates with a dark letter. */
function letterTexture(letters) {
  const c = document.createElement('canvas'); c.width = 64 * letters.length; c.height = 64;
  const g = c.getContext('2d');
  letters.forEach((ch, i) => {
    g.fillStyle = '#f4f4f1'; g.fillRect(i * 64 + 2, 2, 60, 60);
    g.fillStyle = '#23292e'; g.font = 'bold 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, i * 64 + 32, 35);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** The entrance openings of the Å-husen's recesses (#266): the door and the sidelight on the back wall. */
function entranceOpenings(b, r) {
  const E = S.loggia.entrance, nz = r.face === 'n' || r.face === 's', out = r.face === 's' || r.face === 'e' ? 1 : -1;
  const back = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[r.face] - out * r.depth, y = b.base + r.door * S.storey;
  const wide = r.a1 - r.a0 > E.w + E.side + 0.25, d0 = (r.a0 + r.a1) / 2 - (wide ? (E.w + E.side) / 2 : E.w / 2);
  const at = (a) => (nz ? [a, back] : [back, a]), n = nz ? [0, out] : [out, 0];
  const opening = (kind, a0, a1) => { const [xa, za] = at(a0), [xb, zb] = at(a1); return { kind, x0: xa, z0: za, x1: xb, z1: zb, n, y0: y, y1: y + E.h }; };
  return [opening('door', d0, d0 + E.w), ...(wide ? [opening('side', d0 + E.w + 0.06, d0 + E.w + E.side)] : [])];
}

/** The Å-husen's loggias and entrances (#145, #258, #266): slabs, white-rendered inner walls with a glazed door and a
 * window, plain brick piers, a brick parapet with an opening at the ground and railings above, a few plants, the
 * entrance doors with a sidelight, a canopy and the house letter. */
function loggias(blocks) {
  const L = S.loggia, p = L.pier, P = L.parapet, E = L.entrance;
  const slabs = [], walls = [], bricks = [], rails = [], plants = [], frames = [], glass = [], metal = [], signs = [];
  const letters = blocks.map((b) => b.name.slice(-1));
  const rand = rng(43);
  const pier = (b, x0, x1, z0, z1) => bricks.push(brickBox(x0, z0, x1, z0, 0, Math.sign(z1 - z0), Math.abs(z1 - z0), b.base, b.base + b.storeys * S.storey, b.base));
  const plant = (x, y, z) => {
    if (rand() < L.plants) plants.push(new THREE.CylinderGeometry(0.17, 0.13, 0.38, 8).translate(x, y + 0.19, z), new THREE.IcosahedronGeometry(0.34, 0).translate(x, y + 0.62, z));
  };
  // a brick parapet along the façade line (xa, za)–(xb, zb) on y, P.t thick into the loggia (towards (nx, nz)), a coping on it
  const parapet = (b, xa, za, xb, zb, nx, nz, y) => {
    if (Math.hypot(xb - xa, zb - za) < 0.05) return;
    bricks.push(brickBox(xa, za, xb, zb, nx, nz, P.t, y, y + P.h, b.base));
    const x0 = Math.min(xa, xb, xa + nx * P.t), x1 = Math.max(xa, xb, xa + nx * P.t), z0 = Math.min(za, zb, za + nz * P.t), z1 = Math.max(za, zb, za + nz * P.t);
    metal.push(new THREE.BoxGeometry(x1 - x0 + 0.04, P.coping, z1 - z0 + 0.04).translate((x0 + x1) / 2, y + P.h + P.coping / 2, (z0 + z1) / 2));
  };
  for (const b of blocks) {
    const top = b.base + b.storeys * S.storey;
    for (const { cx, cz, sx, sz, lx, lz, ix, iz } of cornerLoggias(b)) {
      const mx = (cx + ix) / 2, mz = (cz + iz) / 2, g = frontGround({ cx, cz, sx, sz, lx, lz, ix, iz });
      pier(b, cx, cx + sx * p, cz, cz + sz * p);
      if (lx > L.mid) pier(b, cx + sx * (L.midAt - p / 2), cx + sx * (L.midAt + p / 2), cz, cz + sz * p); // part-way along a long front
      if (lz > L.mid) pier(b, cx, cx + sx * p, cz + sz * (L.midAt - p / 2), cz + sz * (L.midAt + p / 2));
      walls.push(quad(cx, iz, ix, iz, 0, -sz, b.base, top), quad(ix, cz, ix, iz, -sx, 0, b.base, top)); // the rendered inner walls
      for (let st = 0; st <= b.storeys; st++) {
        const y = b.base + st * S.storey, kind = loggiaKind(b, st, y, g);
        if (st > 0) slabs.push(new THREE.BoxGeometry(lx, 0.22, lz).translate(mx, y - 0.11, mz)); // floor above / ceiling below
        else if (kind === 'ground') slabs.push(new THREE.BoxGeometry(lx, 0.06, lz).translate(mx, y + 0.03, mz)); // over the plinth
        if (kind === 'ground') { // brick, with the opening next to the flat's wall on the longer front (#266)
          const ox = lx >= lz ? P.open : 0, oz = lx >= lz ? 0 : P.open, py = Math.max(y, g);
          parapet(b, cx + sx * p, cz, ix - sx * ox, cz, 0, sz, py);
          parapet(b, cx, cz + sz * p, cx, iz - sz * oz, sx, 0, py);
        } else if (kind === 'rail') rails.push(railPanel(cx + sx * p, cz + sz * 0.06, ix, cz + sz * 0.06, y), railPanel(cx + sx * 0.06, cz + sz * p, cx + sx * 0.06, iz, y));
        if (kind === 'ground' || kind === 'rail') plant(cx + sx * (p + 0.45), y, iz - sz * 0.45);
      }
    }
    for (const o of loggiaOpenings(b)) glazing(o, frames, glass);
    for (const r of b.recesses ?? []) {
      // `out` = +1 when the face looks towards +x / +z; `at(along, across)` → plan [x, z]
      const nz = r.face === 'n' || r.face === 's', out = r.face === 's' || r.face === 'e' ? 1 : -1;
      const line = { n: b.z0, s: b.z1, w: b.x0, e: b.x1 }[r.face], back = line - out * r.depth;
      const at = (a, c) => (nz ? [a, c] : [c, a]), nrm = (k) => (nz ? [0, k] : [k, 0]), side = (k) => (nz ? [k, 0] : [0, k]);
      const s0 = r.from ?? 0, s1 = Math.min(r.to ?? Infinity, b.storeys - 1), y0 = b.base + s0 * S.storey, y1 = b.base + (s1 + 1) * S.storey;
      walls.push(quad(...at(r.a0, back), ...at(r.a1, back), ...nrm(out), y0, y1), // the back wall and the sides
        quad(...at(r.a0, back), ...at(r.a0, line), ...side(1), y0, y1), quad(...at(r.a1, back), ...at(r.a1, line), ...side(-1), y0, y1));
      const [mx, mz] = at((r.a0 + r.a1) / 2, (line + back) / 2), [w, d] = nz ? [r.a1 - r.a0, r.depth] : [r.depth, r.a1 - r.a0];
      for (let st = s0; st <= s1 + 1; st++) {
        const y = b.base + st * S.storey;
        if (st > s0) slabs.push(new THREE.BoxGeometry(w, 0.22, d).translate(mx, y - 0.11, mz)); // a ceiling, a loggia floor
        else slabs.push(new THREE.BoxGeometry(w, 0.04, d).translate(mx, y + 0.02, mz)); // the floor (over a storey below, or the plinth, #266)
        if (st > s1 || st === r.door || y < groundY(mx, mz) + 1.2) continue;
        const f = line - out * 0.06;
        rails.push(railPanel(...at(r.a0, f), ...at(r.a1, f), y));
        const [px, pz] = at(r.a0 + 0.5, back + out * 0.45);
        plant(px, y, pz);
      }
      if (r.door != null) { // the entrance (#258, #266): a glazed door + sidelight on the back wall, a canopy, the letter
        const y = b.base + r.door * S.storey, C = E.canopy;
        for (const o of entranceOpenings(b, r)) glazing(o, frames, glass);
        const [kx, kz] = at((r.a0 + r.a1) / 2, line + out * (C.out - 0.3) / 2), [kw, kd] = nz ? [r.a1 - r.a0 + 0.4, C.out + 0.3] : [C.out + 0.3, r.a1 - r.a0 + 0.4];
        metal.push(new THREE.BoxGeometry(kw, C.t, kd).translate(kx, y + C.at + C.t / 2, kz)); // the canopy over the mouth
        const [lx2, lz2] = at(r.a1 + 0.5, line + out * 0.012), u = letters.indexOf(b.name.slice(-1)); // the letter beside the mouth
        const plate = new THREE.PlaneGeometry(E.sign, E.sign).rotateY(Math.atan2(...nrm(out))).translate(lx2, y + 2.3, lz2);
        const uv = plate.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, (u + uv.getX(i)) / letters.length);
        signs.push(plate);
      }
    }
  }
  return { slabs, walls, bricks, rails, plants, frames, glass, metal, signs, letters };
}

/** The lowest ground under a block's footprint (sampled every 2 m). */
function lowestGround(b) {
  let lo = Infinity;
  for (let x = b.x0; x <= b.x1 + 1e-6; x += Math.max(0.5, (b.x1 - b.x0) / Math.ceil((b.x1 - b.x0) / 2)))
    for (let z = b.z0; z <= b.z1 + 1e-6; z += Math.max(0.5, (b.z1 - b.z0) / Math.ceil((b.z1 - b.z0) / 2))) lo = Math.min(lo, groundY(x, z));
  return lo;
}

/** A plinth under a block that stands on a slope, down to the lowest ground under it (#142), or null. */
function plinth(b) {
  const foot = lowestGround(b);
  if (foot > b.base - 0.05) return null;
  return new THREE.BoxGeometry(b.x1 - b.x0, b.base - foot + 0.05, b.z1 - b.z0).translate((b.x0 + b.x1) / 2, (foot + b.base) / 2, (b.z0 + b.z1) / 2);
}

/** Box with façade UVs: u along the wall in bays, v in storeys from the ground. */
function block(b) {
  const { bay, storey } = dims(b), h = b.storeys * storey;
  const geo = new THREE.BoxGeometry(b.x1 - b.x0, h, b.z1 - b.z0);
  geo.translate((b.x0 + b.x1) / 2, b.base + h / 2, (b.z0 + b.z1) / 2);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const along = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
    uv.setXY(i, along / bay, (p.getY(i) - b.base) / storey);
  }
  return geo;
}

/** An Å-hus's own roof (#348): SITE.hipRoof's defaults with the block's `hip` over them, and where its eaves are:
 * { rise, overhang, edge (the metal edge's top over the wall top), box?, eave (y), top (the wall top, y) }. */
function roofSpec(b) {
  const R = { ...S.hipRoof, ...b.hip }, top = b.base + b.storeys * S.storey;
  return { ...R, top, eave: top + R.edge };
}

/** Low hip roof (Å-husen: flat-looking, the plans draw the hips, #348: per house). */
function hipRoof(b) {
  const ah = !b.style, R = ah ? roofSpec(b) : null, o = ah ? R.overhang : 0.3; // the Å-husen's eaves sit on the metal edge (#258)
  const h = ah ? R.eave : b.base + b.storeys * dims(b).storey;
  const x0 = b.x0 - o, x1 = b.x1 + o, z0 = b.z0 - o, z1 = b.z1 + o;
  const r = Math.min(x1 - x0, z1 - z0) / 2;
  const rise = ah ? R.rise : dims(b).roofPitch * r; // the Å-husen look nearly flat, the old ones are steep
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const [ra0, ra1] = x1 - x0 >= z1 - z0 ? [[x0 + r, cz], [x1 - r, cz]] : [[cx, z0 + r], [cx, z1 - r]];
  const v = (x, y, z) => [x, y, z];
  const A = v(x0, h, z0), B = v(x1, h, z0), C = v(x1, h, z1), Dd = v(x0, h, z1);
  const P = v(ra0[0], h + rise, ra0[1]), Q = v(ra1[0], h + rise, ra1[1]);
  // P is the ridge end nearer x0/z0
  const tris = x1 - x0 >= z1 - z0
    ? [[A, P, Q], [A, Q, B], [B, Q, C], [C, Q, P], [C, P, Dd], [Dd, P, A]]
    : [[A, P, B], [B, P, Q], [B, Q, C], [C, Q, Dd], [Dd, Q, P], [Dd, P, A]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(tris.length * 6).fill(0), 2));
  geo.computeVertexNormals();
  return geo;
}

/** Gable roof along the block's long side. */
function roof(b) {
  if (b.roof === 'hip') return hipRoof(b);
  const h = b.base + b.storeys * dims(b).storey, alongX = b.x1 - b.x0 >= b.z1 - b.z0;
  const [a0, a1] = alongX ? [b.z0, b.z1] : [b.x0, b.x1];
  const len = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
  const ridge = Math.min(4, (a1 - a0) * 0.35);
  const shape = new THREE.Shape([new THREE.Vector2(-a0 + 0.3, 0), new THREE.Vector2(-a1 - 0.3, 0), new THREE.Vector2(-(a0 + a1) / 2, ridge)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len + 0.6, bevelEnabled: false });
  if (alongX) {
    geo.rotateY(Math.PI / 2); // (sx, sy, d) → (d, sy, −sx)
    geo.translate(b.x0 - 0.3, h, 0);
  } else {
    geo.scale(-1, 1, 1); // shape x = +x for blocks along z
    geo.translate(0, h, b.z0 - 0.3);
  }
  return geo; // ExtrudeGeometry is already non-indexed
}

function trees(rand) {
  // the trees the situation plan draws in the courtyard and the green (COURTYARD.trees), then the areas;
  // young street maples are slim, the big old trees by the school have broad crowns of several lobes (#130)
  const spots = COURTYARD.trees.map(([x, z]) => ({ x, z, y: groundY(x, z), s: 0.85 + rand() * 0.35, kind: 'tree' }));
  for (const area of S.treeAreas) {
    for (let i = 0; i < area.n; i++) {
      const x = area.x0 + rand() * (area.x1 - area.x0), z = area.z0 + rand() * (area.z1 - area.z0);
      if (S.blocks.some((b) => x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2)) continue;
      if (onRoad(x, z, 1)) continue;
      if (area.skip?.some(([a, b]) => x > a && x < b)) continue; // a drive (#260)
      if (z > S.river.z0 - 2 && z < S.river.z1 + 2) continue;
      if (T.box.some((b) => Math.min(Math.abs(x - b.x0), Math.abs(x - b.x1)) < 1.5 && z > b.z0 && z < b.z1)) continue; // not on a retaining wall
      const birch = !area.young && rand() < S.birchShare; // slim birches with white trunks among the others (#115)
      spots.push({ x, z, y: groundY(x, z), s: area.young ? 0.8 + rand() * 0.25 : 0.75 + rand() * 0.6, kind: area.young ? 'young' : birch ? 'birch' : 'tree' });
    }
  }
  for (const [x, z, s] of S.bigTrees) spots.push({ x, z, y: groundY(x, z), s, kind: 'big' });
  for (const [x, z] of S.vergeTrees) spots.push({ x, z, y: groundY(x, z), s: 0.8 + rand() * 0.3, kind: 'tree' }); // by Karpvägen (#257)
  for (const [x, z, s] of S.life.trees) spots.push({ x, z, y: groundY(x, z), s, kind: 'tree' }); // the bike yard's, by Hus L's east end (#260)
  // crowns: one per tree, three to five lobes per big tree, an ellipsoid per young maple
  const lobes = [];
  const trunkM = [], birchM = [], m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (const t of spots) {
    const r = { r1: rand(), r2: rand(), r3: rand(), r4: rand() }; // one tree, one colour (seasons.js)
    if (t.kind === 'big') {
      const h = 4.6 * t.s;
      trunkM.push(m.clone().compose(new THREE.Vector3(t.x, t.y, t.z), q.identity(), new THREE.Vector3(2.0 * t.s, h, 2.0 * t.s)));
      const n = 4 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.28 + rand() * 0.6, d = (k === 0 ? 0 : 1.9) * t.s;
        lobes.push({ pos: new THREE.Vector3(t.x + Math.cos(a) * d, t.y + h + (k === 0 ? 3.0 : 1.8 + rand() * 1.4) * t.s, t.z + Math.sin(a) * d),
          rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), scale: new THREE.Vector3(3.0, 2.6, 3.0).multiplyScalar(t.s * (0.8 + rand() * 0.3)), ...r });
      }
    } else if (t.kind === 'birch') { // a tall white trunk, a narrow crown high up
      const h = 4.4 * t.s;
      birchM.push(m.clone().compose(new THREE.Vector3(t.x, t.y, t.z), q.identity(), new THREE.Vector3(0.55 * t.s, h, 0.55 * t.s)));
      lobes.push({ pos: new THREE.Vector3(t.x, t.y + h + 1.2 * t.s, t.z), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), scale: new THREE.Vector3(1.4, 2.6, 1.4).multiplyScalar(t.s), ...r, r1: 0.75 + r.r1 * 0.25 }); // r1 high: they go yellow in autumn
    } else {
      const young = t.kind === 'young', h = (young ? 2.6 : 3.2) * t.s;
      trunkM.push(m.clone().compose(new THREE.Vector3(t.x, t.y, t.z), q.identity(), new THREE.Vector3(young ? 0.6 * t.s : t.s, h, young ? 0.6 * t.s : t.s)));
      const sc = young ? new THREE.Vector3(1.3, 2.1, 1.3).multiplyScalar(t.s) : new THREE.Vector3(2.4, 2.6, 2.4).multiplyScalar(t.s);
      lobes.push({ pos: new THREE.Vector3(t.x, t.y + h + (young ? 1.7 : 1.6) * t.s, t.z), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), scale: sc, ...r });
    }
  }
  // ornamental shrubs along our pavement: small round bushes, coloured with the season like the trees
  const sh = S.shrubs;
  for (let x = sh.x0; x <= sh.x1; x += sh.step) {
    if (sh.gaps.some(([a, b]) => x > a && x < b)) continue;
    const s = 0.45 + rand() * 0.2;
    lobes.push({ pos: new THREE.Vector3(x + (rand() - 0.5) * 0.2, 0.42 * s / 0.55, sh.z + (rand() - 0.5) * 0.15), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)),
      scale: new THREE.Vector3(s * 1.2, s, s * 1.1), r1: 0.2 + rand() * 0.15, r2: 0.9, r3: 0.15 + rand() * 0.2, r4: 1 }); // one red-brown hedge; r2 high: some leaves stay; r4: no blossom
  }
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1, 7).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }), trunkM.length);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), lobes.length);
  trunkM.forEach((mm, i) => trunk.setMatrixAt(i, mm));
  const col = new THREE.Color();
  lobes.forEach((l, i) => { crown.setMatrixAt(i, m.compose(l.pos, l.rot, l.scale)); crown.setColorAt(i, col.setHSL(0.27, 0.45, 0.3)); });
  // colours and leaf cover come from the season (seasons.js); keep each tree's own variation
  registerTrees(crown, lobes);
  const birches = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.9 }), Math.max(1, birchM.length));
  birchM.forEach((mm, i) => birches.setMatrixAt(i, mm));
  birches.count = birchM.length;
  trunk.castShadow = crown.castShadow = birches.castShadow = true;
  return [trunk, birches, crown];
}

/** Sky for scene.background: vertical gradient with a few soft clouds (equirectangular). */
export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5f97cf');
  grad.addColorStop(1, `#${COLORS.sky.toString(16).padStart(6, '0')}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = `#${COLORS.sky.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 256, 1024, 256);
  const rand = rng(5);
  for (let i = 0; i < 26; i++) {
    const cx = rand() * 1024, cy = 120 + rand() * 120, r = 18 + rand() * 40;
    for (let k = 0; k < 5; k++) {
      const x = cx + (rand() - 0.5) * r * 2.5, y = cy + (rand() - 0.5) * r * 0.5, rr = r * (0.6 + rand() * 0.6);
      const rg = g.createRadialGradient(x, y, 0, x, y, rr);
      rg.addColorStop(0, 'rgba(255,255,255,0.75)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Clouds only (alpha), equirectangular, for the day-cycle sky shader (row 0 = straight up). */
export function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const rand = rng(5);
  for (let i = 0; i < 30; i++) {
    const cx = rand() * 1024, cy = 110 + rand() * 130, r = 18 + rand() * 40;
    for (let k = 0; k < 5; k++) {
      const x = cx + (rand() - 0.5) * r * 2.5, y = cy + (rand() - 0.5) * r * 0.5, rr = r * (0.6 + rand() * 0.6);
      for (const xx of [x, x - 1024, x + 1024]) { // wrap around
        const rg = g.createRadialGradient(xx, y, 0, xx, y, rr);
        rg.addColorStop(0, 'rgba(255,255,255,0.8)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg;
        g.fillRect(xx - rr, y - rr, rr * 2, rr * 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  // no mipmaps: the atan() seam in the sky shader would pick the smallest mip there (a dashed line)
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/**
 * Lit windows in the neighbouring blocks: one additive quad per window (instanced), each with
 * its own evening routine, so windows light up and go dark one by one as the day passes.
 */
export function buildWindowLights() {
  const spots = [];
  for (const b of S.blocks) {
    const faces = [
      { along: 'x', c: b.z0 - 0.03, a0: b.x0, a1: b.x1, n: [0, -1], f: 'n' }, { along: 'x', c: b.z1 + 0.03, a0: b.x0, a1: b.x1, n: [0, 1], f: 's' },
      { along: 'z', c: b.x0 - 0.03, a0: b.z0, a1: b.z1, n: [-1, 0], f: 'w' }, { along: 'z', c: b.x1 + 0.03, a0: b.z0, a1: b.z1, n: [1, 0], f: 'e' },
    ];
    for (const f of faces) {
      if (S.facades?.[b.name]?.[f.f]) continue; // listed openings (#345): below
      // window centres sit mid-bay in the façade texture (u = along / bay)
      const { bay, storey } = dims(b), old = b.style === 'old';
      // window rows: one per storey (the old windows are narrow and tall), or the school's own two (#126)
      const rows = dims(b).rows ? dims(b).rows.map((r) => ({ y: b.base + r.y, s: r.s }))
        : [...Array(b.storeys)].map((_, st) => ({ y: b.base + st * storey + (old ? 1.9 : 1.55), s: old ? [0.78, 1.3, 1] : [1, 1, 1], st }));
      for (let k = Math.ceil(f.a0 / bay - 0.5); (k + 0.5) * bay < f.a1; k++) {
        const a = (k + 0.5) * bay;
        if (a - 0.7 < f.a0 || a + 0.7 > f.a1) continue;
        const [px, pz] = f.along === 'x' ? [a, f.c] : [f.c, a];
        if (b.style === 'school' && S.blocks.some((o) => o !== b && o.style === 'school' && px > o.x0 && px < o.x1 && pz > o.z0 && pz < o.z1)) continue; // inside a pavilion
        for (const { y, s, st } of rows) {
          if (b.corners && inCut(b, f.f, a - 0.95, a + 0.95, st)) continue; // a loggia or an entrance recess there (#145, #258)
          if (y < groundY(f.along === 'x' ? a : f.c, f.along === 'x' ? f.c : a) + 0.8) continue; // below the ground
          spots.push(f.along === 'x' ? { x: a, y, z: f.c, n: f.n, s } : { x: f.c, y, z: a, n: f.n, s });
        }
      }
    }
  }
  // the loggias' windows and the lit stair halls behind the entrance doors (#266); the listed façade openings (#345)
  for (const b of S.blocks.filter((o) => o.corners)) {
    for (const o of facadeOpenings(b)) {
      const len = o.a1 - o.a0, h = o.y1 - o.y0 - 0.1;
      if (o.y0 + h / 2 < (o.n[1] ? groundY((o.a0 + o.a1) / 2, o.z0 + o.n[1] * 0.6) : groundY(o.x0 + o.n[0] * 0.6, (o.a0 + o.a1) / 2)) + 0.8) continue;
      spots.push({ x: (o.x0 + o.x1) / 2 + o.n[0] * 0.05, y: o.y0 + 0.05 + h / 2, z: (o.z0 + o.z1) / 2 + o.n[1] * 0.05, n: o.n, s: [(len - 0.1) / 1.25, h / 1.45, 1] });
    }
    const glazed = [...loggiaOpenings(b).filter((o) => o.kind === 'window'), ...(b.recesses ?? []).filter((r) => r.door != null).flatMap((r) => entranceOpenings(b, r))];
    for (const o of glazed) {
      const len = Math.hypot(o.x1 - o.x0, o.z1 - o.z0), h = o.y1 - o.y0 - 0.12;
      spots.push({ x: (o.x0 + o.x1) / 2 + o.n[0] * 0.075, y: o.y0 + 0.06 + h / 2, z: (o.z0 + o.z1) / 2 + o.n[1] * 0.075, n: o.n, s: [(len - 0.12) / 1.25, h / 1.45, 1], hall: o.kind !== 'window' });
    }
  }
  const geo = new THREE.PlaneGeometry(1.25, 1.45);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }); // fog would add its colour to black (unlit) quads
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const rand = rng(17);
  const habits = spots.map((p, i) => {
    q.setFromAxisAngle(up, Math.atan2(p.n[0], p.n[1]));
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y, p.z), q, one.set(...p.s)));
    mesh.setColorAt(i, new THREE.Color(0, 0, 0));
    const home = rand() > 0.2; // some flats are empty tonight
    return {
      home, hall: p.hall, // a stair hall: lit all night (#266)
      on: 15.5 + rand() * 4, off: 21 + rand() * 3.5, // evening
      early: rand() < 0.4, wake: 5.5 + rand() * 1.5, leave: 7 + rand() * 1.5, // morning
      tint: rand(), // warm … cool (TV)
    };
  });
  const col = new THREE.Color();
  let last = -1;
  return {
    object: mesh,
    /** hour 0–24, night 0 (day) … 1 (night): switch windows as their routines say. */
    update(hour, night) {
      if (Math.abs(hour - last) < 0.05 && last >= 0) return;
      last = hour;
      habits.forEach((h, i) => {
        const lit = h.home && ((hour > h.on && hour < h.off) || (h.off > 24 && hour < h.off - 24) || (h.early && hour > h.wake && hour < h.leave));
        const k = h.hall ? 0.85 * night : lit ? 0.25 + 0.75 * night : 0;
        col.setRGB(1.0 * k, (0.78 + 0.12 * h.tint) * k, (0.5 + 0.45 * h.tint) * k);
        mesh.setColorAt(i, col);
      });
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

/** Horizontal strip that follows the ground (its height at the strip's centre line in x). */
function groundStrip(x0, x1, z0, z1, lift) {
  const cx = (x0 + x1) / 2;
  const cuts = [z0, z1, T.north, T.north + T.slope, ...E.profile.map((p) => p[0]), ...T.box.flatMap((b) => [b.z0, b.z1])];
  for (let z = Math.ceil(z0); z < z1; z += 2) cuts.push(z);
  const zs = [...new Set(cuts)].filter((z) => z >= z0 && z <= z1).sort((a, b) => a - b);
  const pos = [];
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1];
    if (zb - za < 1e-3) continue;
    const ya = groundY(cx, za + 1e-3) + lift, yb = groundY(cx, zb - 1e-3) + lift;
    pos.push(x0, ya, za, x0, yb, zb, x1, ya, za, x1, ya, za, x0, yb, zb, x1, yb, zb);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.computeVertexNormals();
  return geo;
}

export function buildSurroundings({ grass }) {
  const group = new THREE.Group();
  const flat = (geos, color, snow) => {
    const mat = color.isMaterial ? color : new THREE.MeshStandardMaterial({ color, roughness: 1 });
    if (snow) registerSnow(mat, snow);
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  // the ground south of Hus L: the raised courtyard on the garage box and the park level around it (the
  // street side north of Hus L is world.js's ground); retaining walls, railings and the garage door
  flat([terrainGeometry()], grass, SEASON.snow.ground);
  const bw = boxWalls();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b4ab, roughness: 0.95, side: THREE.DoubleSide });
  flat(bw.walls, new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95, side: THREE.DoubleSide })); // brick retaining walls (#148)
  const lightRail = new THREE.MeshStandardMaterial({ color: 0xb9bdbd, roughness: 0.5, metalness: 0.3 });
  flat([...bw.rails, ...bw.stairs.rails.map((g) => g.toNonIndexed())].map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }), lightRail);
  group.add(new THREE.Mesh(mergeGeometries(bw.slats.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ map: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 })));
  flat(bw.stairs.solid, concrete, SEASON.snow.paving); // the stairs down to the park level (#148, #254)
  flat(T.stairs.filter((St) => St.walk).map((St) => groundStrip(St.walk.x0, St.walk.x1, St.walk.z0, St.walk.z1, 0.01)), COLORS.paving); // from a stair's foot on
  // collision for the courtyard (world.js keeps those near OUTDOOR): the box edge, and the Å-husen's outer walls (#259)
  // (#355: the outline at the ground — the loggias' parapets / railings stand in the façade line, the entrance recesses
  // are walked into; `recessFloors` gives their floors)
  group.userData.segments = [...bw.segments, ...S.blocks.filter((b) => !b.style).flatMap((b) => {
    const pts = groundOutline(b);
    return pts.map((p, i) => [...p, ...pts[(i + 1) % pts.length]]);
  })];
  flat(bw.door, new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.8, side: THREE.DoubleSide }));
  // roads (#257, src/roads.js): rectangles, centre lines with rounded corners, fillets at the junctions
  const gd = T.garageDoor; // + the drive from Karpvägen to the garage door (#254)
  const asphalt = [...S.roads, { x0: gd.drive, x1: gd.x + 0.05, z0: gd.z0 - 0.5, z1: gd.z1 + 0.5 }].flatMap((r) => r.path ? [pathStrip(r, (w) => -w / 2, (w) => w / 2, 0.012, groundY)]
    : r.fillets ? r.fillets.map((f) => filletGeometry(f, 0.012, groundY)) : [groundStrip(r.x0, r.x1, r.z0, r.z1, 0.012)]);
  flat(asphalt, new THREE.MeshStandardMaterial({ color: COLORS.asphalt, roughness: 0.7 }), 0xd9dfe4); // ploughed, a little grey; damp (#128)
  // pavements along the roads (left out where they would lie on another road's asphalt: a junction's mouth)
  const walks = S.roads.flatMap((r) => (r.walks || []).map((k) => k.side > 0
    ? pathStrip(r, (w) => w / 2, (w) => w / 2 + k.w, 0.008, groundY, true) : pathStrip(r, (w) => -w / 2 - k.w, (w) => -w / 2, 0.008, groundY, true)));
  flat([...S.paving.map((r) => groundStrip(r.x0, r.x1, r.z0, r.z1, 0.008)), ...walks], COLORS.paving, SEASON.snow.paving);
  flat([groundStrip(S.river.x0, S.river.x1, S.river.z0, S.river.z1, 0.02)],
    new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: 0.15, metalness: 0.2 }));
  // Kv. Lunden's own blocks and the old S:t Lars buildings: own façade texture and roof colour each,
  // plus a white cornice under the old roofs (#47)
  const modern = S.blocks.filter((b) => !b.style), oldB = S.blocks.filter((b) => b.style === 'old'), school = S.blocks.filter((b) => b.style === 'school');
  const side = (st) => S.blocks.filter((b) => b.style === st);
  const mesh = (geos, material, snow) => {
    if (snow) registerSnow(material, snow);
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.receiveShadow = true;
    group.add(m);
  };
  const lg = loggias(modern); // corner loggias and entrances (#145, #258, #266)
  const bodies = modern.map(aHouseParts), grid = bodies.flatMap((p) => p.grid); // #345: listed faces plain, the rest the old grid
  if (grid.length) mesh(grid, new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.95 }));
  mesh([...bodies.flatMap((p) => p.plain), ...lg.bricks.map((g) => g.index ? g.toNonIndexed() : g)], new THREE.MeshStandardMaterial({ map: facadeTexture(true), roughness: 0.95 })); // + piers, parapets (#266)
  mesh(modern.flatMap(openingDecals), new THREE.MeshStandardMaterial({ map: openingTexture(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1 })); // the listed windows (#345)
  const white = new THREE.MeshStandardMaterial({ color: 0xf0efeb, roughness: 0.85, side: THREE.DoubleSide });
  mesh([...lg.slabs.map((g) => g.toNonIndexed()), ...lg.walls.map((g) => g.toNonIndexed())].map((g) => { g.deleteAttribute('uv'); return g; }), white);
  const railMesh = new THREE.Mesh(mergeGeometries(lg.rails.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ map: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
  group.add(railMesh);
  if (lg.plants.length) mesh(lg.plants.map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; }), new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 0.9, flatShading: true }));
  const bare = (gs) => gs.map((g) => { g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; });
  mesh(bare(lg.frames), new THREE.MeshStandardMaterial({ color: 0x4a5056, roughness: 0.5, metalness: 0.3 })); // anthracite frames (#266)
  mesh(bare(lg.glass), new THREE.MeshStandardMaterial({ color: 0x4f6574, roughness: 0.12, metalness: 0.25 })); // glazing: loggia doors, windows, entrances
  mesh(lg.signs, new THREE.MeshStandardMaterial({ map: letterTexture(lg.letters), roughness: 0.6 })); // the house letters
  // low hip roofs of roofing felt (#258; Peab's aerial render, Q&A) over the light metal edge, a few vent hoods along the ridge;
  // #348: each house its own (roofSpec), with the roof box the roof plans draw (in the sheet metal below)
  const roofBoxes = [];
  mesh(modern.flatMap((b) => {
    const R = roofSpec(b), o = R.overhang, eave = R.eave, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, r = rng(Math.round(b.x0 * 7 + b.z0 * 13));
    const hx = (b.x1 - b.x0) / 2 + o, hz = (b.z1 - b.z0) / 2 + o, k = R.rise / Math.min(hx, hz);
    const roofY = (x, z) => eave + k * Math.min(hx - Math.abs(x - cx), hz - Math.abs(z - cz)); // on the hip roof
    if (R.box) { // from the eave line up to `h` over the highest point of the roof under it
      const B = R.box, hi = roofY(THREE.MathUtils.clamp(cx, B.x0, B.x1), THREE.MathUtils.clamp(cz, B.z0, B.z1)); // its point nearest the ridge
      roofBoxes.push(new THREE.BoxGeometry(B.x1 - B.x0, hi + B.h - eave, B.z1 - B.z0).translate((B.x0 + B.x1) / 2, (eave + hi + B.h) / 2, (B.z0 + B.z1) / 2));
    }
    const geos = [hipRoof(b)];
    for (let i = 0; i < 5; i++) {
      const s2 = 0.6 + r() * 0.9, hgt = 0.5 + r() * 0.7, x = cx + (r() - 0.5) * 3, z = cz + (r() - 0.5) * Math.max(2, 2 * (hz - hx) + 2);
      geos.push(new THREE.BoxGeometry(s2, hgt, s2 * (0.7 + r() * 0.6)).translate(x, roofY(x, z) - 0.15 + hgt / 2, z).toNonIndexed());
    }
    return geos.map((g) => { g.deleteAttribute('uv'); return g; });
  }), new THREE.MeshStandardMaterial({ color: 0x6d7175, roughness: 0.9, side: THREE.DoubleSide }), SEASON.snow.roof);
  // details (#109, #146): a light grey metal edge round the flat roofs, grey downpipes at the corners and every ~12 m
  mesh(modern.map((b) => { // #348: as far out as the house's eaves, its top at the eave line
    const R = roofSpec(b), o = R.overhang, d = R.edge + 0.1;
    return new THREE.BoxGeometry(b.x1 - b.x0 + 2 * o, d, b.z1 - b.z0 + 2 * o).translate((b.x0 + b.x1) / 2, R.eave - 0.01 - d / 2, (b.z0 + b.z1) / 2);
  }).concat(lg.metal, roofBoxes), new THREE.MeshStandardMaterial({ color: 0xc7cacb, roughness: 0.45, metalness: 0.2 })); // light grey sheet metal (#146)
  const pipes = [];
  for (const b of modern) {
    const h = b.storeys * S.storey, y = b.base + h / 2;
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]) pipes.push(new THREE.CylinderGeometry(0.05, 0.05, h, 6).translate(x + Math.sign((b.x0 + b.x1) / 2 - x) * 0.35, y, z + Math.sign((b.z0 + b.z1) / 2 - z) * -0.07));
    // (none in front of a loggia or a recess, #258)
    for (const [z, sgn, f] of [[b.z0, -1, 'n'], [b.z1, 1, 's']]) for (let x = b.x0 + 12; x < b.x1 - 4; x += 12) if (!inCut(b, f, x - 0.1, x + 0.1)) pipes.push(new THREE.CylinderGeometry(0.05, 0.05, h, 6).translate(x, y, z + sgn * 0.07));
    for (const [x, sgn, f] of [[b.x0, -1, 'w'], [b.x1, 1, 'e']]) for (let z = b.z0 + 12; z < b.z1 - 4; z += 12) if (!inCut(b, f, z - 0.1, z + 0.1)) pipes.push(new THREE.CylinderGeometry(0.05, 0.05, h, 6).translate(x + sgn * 0.07, y, z));
  }
  mesh(pipes, new THREE.MeshStandardMaterial({ color: 0x8f9396, roughness: 0.5, metalness: 0.3 }));
  if (school.length) { // the school across the street, its wall and greenhouse (#126)
    const white = new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.8 });
    mesh(school.map(block), new THREE.MeshStandardMaterial({ map: schoolFacadeTexture(), roughness: 0.95 }));
    mesh(school.map(roof), new THREE.MeshStandardMaterial({ color: 0x5c6369, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }), SEASON.snow.roof);
    mesh(school.flatMap((b) => [...quoins(b, S.school.storey), new THREE.BoxGeometry(b.x1 - b.x0 + 0.36, 0.32, b.z1 - b.z0 + 0.36)
      .translate((b.x0 + b.x1) / 2, b.base + S.school.storey - 0.16, (b.z0 + b.z1) / 2)]), white); // quoins + cornice
    const sg = schoolGrounds();
    mesh(sg.wall, new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95 }));
    mesh(sg.coping, new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.5, metalness: 0.3 }), SEASON.snow.roof);
    mesh(sg.frame, new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.4 }));
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ec, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const gm = new THREE.Mesh(mergeGeometries(sg.panes), glassMat);
    group.add(gm);
  }
  if (side('hepcat').length) { // HepCat Store and the long brick building behind it (#127)
    const metal = new THREE.MeshStandardMaterial({ color: 0x737a81, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }); // standing-seam grey
    for (const st of ['hepcat', 'hepcatWhite', 'longhouse']) mesh(side(st).map(block), new THREE.MeshStandardMaterial({ map: sideFacadeTexture(st), roughness: 0.95 }));
    mesh([...['hepcat', 'hepcatWhite', 'longhouse'].flatMap((st) => side(st).map(roof)), ...dormers(side('longhouse'))], metal, SEASON.snow.roof);
    mesh(side('hepcat').flatMap((b) => (b.chimneys ?? []).map((dz) => new THREE.BoxGeometry(0.6, 1.4, 0.6).translate((b.x0 + b.x1) / 2, b.base + S.hepcat.storey + 2.3, (b.z0 + b.z1) / 2 + dz))),
      new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.8 }));
  }
  if (oldB.length) {
    mesh(oldB.map(block), new THREE.MeshStandardMaterial({ map: oldFacadeTexture(), roughness: 0.95 }));
    mesh(oldB.map(roof), new THREE.MeshStandardMaterial({ color: 0x33383c, roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide }), SEASON.snow.roof);
    mesh(oldB.map((b) => {
      const h = b.base + b.storeys * S.old.storey, o = 0.18;
      const g = new THREE.BoxGeometry(b.x1 - b.x0 + 2 * o, 0.32, b.z1 - b.z0 + 2 * o);
      return g.translate((b.x0 + b.x1) / 2, h - 0.16, (b.z0 + b.z1) / 2);
    }), new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.8 }));
  }
  // blocks on the slope south of Hus L stand on a plinth down to the ground (#142)
  const plinths = S.blocks.map(plinth).filter(Boolean);
  if (plinths.length) mesh(plinths, new THREE.MeshStandardMaterial({ color: 0x6e3326, roughness: 0.95 }));
  group.add(...trees(rng(3)));
  const windows = buildWindowLights(), street = buildStreet(groundY); // street lamps, crossing, curbs … (#128)
  group.add(windows.object, street.object);
  group.userData.windows = { object: windows.object, update(hour, night) { windows.update(hour, night); street.update(night); } };
  return group;
}

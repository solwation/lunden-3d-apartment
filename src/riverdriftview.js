// #1952: the drifting flecks on Höje å and the specks under its surface, drawn (config.js RIVER_DRIFT; the rules: src/riverdrift.js).
// Two independent classes, one draw call each, no light, no shadow, no downloaded texture (one generated 32 px dot shared by both):
//  - `RiverDriftSurface`: flat quads lying on the water (flecks of foam stretched along the flow, a leaf now and then). It needs only the
//    river (riverbridge.js `riverPath`, `waterYAt`, `pierBoxes`) and RIVER_DRIFT: nothing of swimming or diving.
//  - `RiverDriftUnder`: points in the water for a diver (#1944), shown only while the caller says the eye is under the surface.
// Every frame the positions are written anew from `DriftField.particle` (a pure function of time) into one preallocated buffer: nothing
// is simulated and nothing is allocated. Away from the river both are invisible and cost one station lookup at most.
import * as THREE from 'three';
import { SITE, RIVER_DRIFT } from './config.js';
import { riverPath, waterYAt, pierBoxes } from './riverbridge.js';
import { driftPath, driftObstacles, DriftField, driftDepth } from './riverdrift.js';

const R = SITE.river, D = RIVER_DRIFT;

let shared = null;
/** The smoothed centre line (from the east edge's join), the piers in its frame and the water line at each of its samples; built once. */
export function driftRiver() {
  if (shared) return shared;
  const points = [R.upstream.boundary, ...riverPath], w = (i) => (R.widths ? R.widths[Math.min(i, R.widths.length - 1)] : R.width),
    path = driftPath(points, [w(0), ...riverPath.map((_, i) => w(i))], D.path), y = new Float64Array(path.n + 1);
  for (let k = 0; k <= path.n; k++) y[k] = waterYAt(path.x[k], path.z[k]);
  /** The water line at chainage `s`. */
  const waterY = (s) => { const q = Math.max(0, Math.min(path.length, s)) / path.step, i = Math.min(path.n - 1, Math.floor(q)); return y[i] + (y[i + 1] - y[i]) * (q - i); };
  return (shared = { path, waterY, obstacles: driftObstacles(path, pierBoxes(), D.pier.clear) });
}

let dot = null;
/** A soft round dot (white, alpha falling off to the rim), generated: 32 x 32 px. */
function dotTexture() {
  if (dot) return dot;
  const n = 32, data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const r = Math.hypot(i + 0.5 - n / 2, j + 0.5 - n / 2) / (n / 2), a = Math.max(0, Math.min(1, (1 - r) / 0.45)), k = (j * n + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = Math.round(255 * a * a * (3 - 2 * a));
  }
  dot = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  dot.magFilter = THREE.LinearFilter; dot.minFilter = THREE.LinearMipmapLinearFilter; dot.generateMipmaps = true; dot.needsUpdate = true;
  return dot;
}

const field = (c, seed) => { const r = driftRiver(); return new DriftField({ path: r.path, speed: D.speed, obstacles: r.obstacles, bend: D.pier.bend, seed, ...c }); };

export class RiverDriftSurface {
  constructor({ scene, cfg = D.surface } = {}) {
    const C = this.C = cfg, n = C.count, r = this.river = driftRiver();
    this.field = field(C, 1); this.t = 0; this.o = {}; this.near = {};
    const g = new THREE.BufferGeometry(), uv = new Float32Array(n * 8), nor = new Float32Array(n * 12), index = new Uint16Array(n * 6);
    for (let i = 0; i < n; i++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); for (let k = 0; k < 4; k++) nor[i * 12 + k * 3 + 1] = 1;
      index.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
    }
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 12), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 16), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos); g.setAttribute('color', this.col); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), C.range + 4); // (positions are relative to the window's centre, where the mesh stands)
    // Lit like the water it lies on (so it darkens at night) and fogged; drawn after the opaque water, writing no depth.
    const m = new THREE.MeshLambertMaterial({ map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const mesh = this.mesh = new THREE.Mesh(g, m); mesh.name = 'river-drift'; mesh.visible = false; mesh.castShadow = mesh.receiveShadow = false; mesh.matrixAutoUpdate = false;
    this.fleck = new THREE.Color(C.color); this.leaves = C.leaf.colors.map((c) => new THREE.Color(c));
    scene?.add(mesh);
  }

  /** Each frame. `eye`: the camera's world position; `hidden`: nothing is drawn (indoors below ground, the eye under the surface …).
   * Returns true while the flecks are drawn. */
  update(dt, eye, hidden = false) {
    this.t += dt;
    const C = this.C, mesh = this.mesh, { path, waterY } = this.river, near = this.near;
    // (one scan of the line's samples: a few hundred comparisons)
    const on = !hidden && path.nearest(eye.x, eye.z, near).d < C.drawDist;
    if (!on) { mesh.visible = false; return false; }
    const F = this.field, o = this.o, sc = near.s, c0 = path.at(sc, o), cx = c0.x, cz = c0.z, cy = waterY(sc), P = this.pos.array, K = this.col.array, L = C.leaf;
    for (let i = 0; i < C.count; i++) {
      F.particle(i, this.t, sc, o);
      const leaf = o.r2 < L.share, S = leaf ? L.size : C.size, rb = S[0] + (S[1] - S[0]) * o.r1, ra = rb * (leaf ? L.stretch : C.stretch),
        col = leaf ? this.leaves[Math.floor(o.r3 * this.leaves.length) % this.leaves.length] : this.fleck,
        a = o.alpha * (leaf ? L.alpha : C.alpha[0] + (C.alpha[1] - C.alpha[0]) * o.r3);
      // the long axis: along the flow for a fleck, askew (fixed per leaf) for a leaf
      let ax = o.tx, az = o.tz; if (leaf) { const w = o.r1 * 2 - 1, l = Math.hypot(1, w); ax = (o.tx - o.tz * w) / l; az = (o.tz + o.tx * w) / l; }
      const x = o.x - cx, z = o.z - cz, y = waterY(o.s) - cy + C.lift, ux = ax * ra, uz = az * ra, vx = -az * rb, vz = ax * rb, p = i * 12, k = i * 16;
      P[p] = x - ux - vx; P[p + 1] = y; P[p + 2] = z - uz - vz; P[p + 3] = x + ux - vx; P[p + 4] = y; P[p + 5] = z + uz - vz;
      P[p + 6] = x + ux + vx; P[p + 7] = y; P[p + 8] = z + uz + vz; P[p + 9] = x - ux + vx; P[p + 10] = y; P[p + 11] = z - uz + vz;
      for (let q = 0; q < 16; q += 4) { K[k + q] = col.r; K[k + q + 1] = col.g; K[k + q + 2] = col.b; K[k + q + 3] = a; }
    }
    this.pos.needsUpdate = this.col.needsUpdate = true;
    mesh.position.set(cx, cy, cz); mesh.updateMatrix(); mesh.visible = true;
    return true;
  }
}

/** #1944's diver sees the water move: specks (pale bubbles, darker silt) drifting past between the surface and the bed. Separate from the
 * surface part: construct and update it only where there is diving. */
export class RiverDriftUnder {
  constructor({ scene, cfg = D.under } = {}) {
    const C = this.C = cfg, n = C.count; this.river = driftRiver();
    this.field = field(C, 2); this.t = 0; this.o = {}; this.c = {}; this.near = {};
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos); g.setAttribute('color', this.col); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), C.range + 4);
    // Unlit points (the dive's pulled-in fog fades them with distance); the caller's `light` dims them at night.
    this.material = new THREE.PointsMaterial({ map: dotTexture(), size: C.size, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false });
    const points = this.points = new THREE.Points(g, this.material); points.name = 'river-drift-under'; points.visible = false; points.matrixAutoUpdate = false;
    this.pale = new THREE.Color(C.color); this.silt = new THREE.Color(C.siltColor);
    scene?.add(points);
  }

  /** Each frame. `under`: the eye is under the river's surface (divelook.js `update`); `light` 0 … 1 the daylight. True while drawn. */
  update(dt, eye, under, light = 1) {
    this.t += dt;
    const C = this.C, points = this.points;
    if (!under) { points.visible = false; return false; }
    const { path, waterY } = this.river, near = path.nearest(eye.x, eye.z, this.near), F = this.field, o = this.o, sc = near.s,
      c0 = path.at(sc, o), cx = c0.x, cz = c0.z, cy = waterY(sc), P = this.pos.array, K = this.col.array, B = SITE.bridges, edge = B.waterY - B.bedY, w = this.t * Math.PI * 2 * C.bobHz;
    for (let i = 0; i < C.count; i++) {
      F.particle(i, this.t, sc, o);
      const hw = path.at(o.s, this.c).hw, deep = Math.max(C.top, driftDepth(o.u, hw, edge, B.pool ?? 0) - C.bed), col = o.r2 < C.silt ? this.silt : this.pale, p = i * 3, k = i * 4;
      P[p] = o.x - cx; P[p + 1] = waterY(o.s) - cy - (C.top + (deep - C.top) * o.r3) + C.bob * Math.sin(w + o.r1 * 6.283) * Math.min(1, o.r3 * 4); P[p + 2] = o.z - cz;
      K[k] = col.r; K[k + 1] = col.g; K[k + 2] = col.b; K[k + 3] = o.alpha * (C.alpha[0] + (C.alpha[1] - C.alpha[0]) * o.r1);
    }
    this.pos.needsUpdate = this.col.needsUpdate = true;
    this.material.color.setScalar(C.night + (1 - C.night) * Math.max(0, Math.min(1, light)));
    points.position.set(cx, cy, cz); points.updateMatrix(); points.visible = true;
    return true;
  }
}

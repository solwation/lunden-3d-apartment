import * as THREE from 'three';
import { PADDOCK as P } from './config.js';
import { outline, fenceLine, posts, gateSpan, insideFence, insetRing, ringDist, centre } from './paddockgeo.js';
import { riverAt } from './riverbridge.js';

// #1280: the pony paddock on the kidney-shaped meadow south of the timber footbridge: a merged post-and-rail fence with a closed gate, a
// water trough and a three-sided shelter (ONE mesh, vertex colours, no textures), two C ponies (Zoey, white; Princess, brown) as ONE
// instanced mesh whose legs, neck, head and tail are moved in the vertex shader (two instances, ~200 triangles each, one draw call), and
// the worn track along the fence (merged into the south backdrop's land mesh, `paddockLandParts`). The plan geometry (fence line, posts,
// collision) lives in paddockgeo.js; sizes, speeds and colours in config.js PADDOCK (all *guess*).
// Behaviour: each pony grazes, stands or walks between waypoints (a 5 m grid of flat places clear of trees, the river and the fence);
// when the eye is within `curious` m the ponies walk to the places nearest to it and watch. Nothing is simulated or drawn beyond
// `viewDist` m. The ponies are not targets: their mesh has no raycast (like the gulls), so rays, Nerf darts and arrows pass through.

const mulberry = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A triangle soup with flat faces: positions, normals, a colour per face and (for the ponies) the part id and pivot. */
class Soup {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.part = []; this.pivot = []; this.m = null; this.partId = 0; this.pv = [0, 0, 0]; this.rot = new THREE.Matrix3(); }
  /** Transform everything added next by `m` (a Matrix4 of rotation + translation), or none. */
  at(m) { this.m = m; if (m) this.rot.setFromMatrix4(m); return this; }
  tri(a, b, c, color) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const q of [a, b, c]) {
      const p = this.m ? q.clone().applyMatrix4(this.m) : q;
      this.pos.push(p.x, p.y, p.z);
      const nn = this.m ? n.clone().applyMatrix3(this.rot) : n;
      this.nor.push(nn.x, nn.y, nn.z); this.col.push(color[0], color[1], color[2]);
      this.part.push(this.partId); this.pivot.push(...this.pv);
    }
  }
  quad(a, b, c, d, center, color) { // wound so its normal points away from `center`
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)), mid = a.clone().add(c).multiplyScalar(0.5).sub(center);
    if (n.dot(mid) >= 0) { this.tri(a, b, c, color); this.tri(a, c, d, color); } else { this.tri(a, c, b, color); this.tri(a, d, c, color); }
  }
  /** A box with centre `c` and half-extent vectors ex, ey, ez; `skip`: faces left out ('-y' the underside). */
  box(c, ex, ey, ez, color, skip = '') {
    const p = (i) => c.clone().addScaledVector(ex, i & 1 ? 1 : -1).addScaledVector(ey, i & 2 ? 1 : -1).addScaledVector(ez, i & 4 ? 1 : -1);
    const f = { '+x': [1, 5, 7, 3], '-x': [0, 2, 6, 4], '+y': [2, 3, 7, 6], '-y': [0, 4, 5, 1], '+z': [4, 6, 7, 5], '-z': [0, 1, 3, 2] };
    for (const [k, i] of Object.entries(f)) if (!skip.includes(k)) this.quad(p(i[0]), p(i[1]), p(i[2]), p(i[3]), c, color);
  }
  /** An axis-aligned box turned by `rx` about x (a neck leaning forward, a head pointing down). */
  boxA(cx, cy, cz, sx, sy, sz, color, rx = 0, skip = '') {
    const r = new THREE.Matrix4().makeRotationX(rx);
    this.box(V(cx, cy, cz), V(sx / 2, 0, 0).applyMatrix4(r), V(0, sy / 2, 0).applyMatrix4(r), V(0, 0, sz / 2).applyMatrix4(r), color, skip);
  }
  /** A bar from `a` to `b`, `w` wide (horizontal, across) and `h` thick, always level across. */
  beam(a, b, w, h, color, ends = true) {
    const d = new THREE.Vector3().subVectors(b, a), side = new THREE.Vector3(0, 1, 0).cross(d).normalize().multiplyScalar(w / 2);
    const up = d.clone().normalize().cross(side).normalize().multiplyScalar(h / 2), mid = a.clone().add(b).multiplyScalar(0.5), half = d.clone().multiplyScalar(0.5);
    this.box(mid, half, side, up, color, ends ? '' : '-z');
  }
  geometry(extra = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (extra) { g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1)); g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.pivot, 3)); }
    return g;
  }
}

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

/** The fence, gate, trough and shelter as one geometry. `ground(x, z)` → y; `spots` = {trough, shelter}, each {x, z, yaw}. */
export function fenceGeometry(ground, spots = {}) {
  const s = new Soup(), rnd = mulberry(1280), wood = P.wood.map(lin), gateWood = lin(0xa98558), post = P.post, n = posts.length;
  const inward = (a, b) => { // the horizontal unit normal of the span a→b that points into the paddock
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    return insideFence(mx + nx * 0.6, mz + nz * 0.6) ? [nx, nz] : [-nx, -nz];
  };
  const gateA = gateSpan, gateB = (gateSpan + 1) % n;
  posts.forEach((a, i) => {
    const gate = i === gateA || i === gateB, h = post.h + (gate ? 0.18 : 0), y = ground(a[0], a[1]);
    s.boxA(a[0], y + h / 2 - 0.15, a[1], post.w, h + 0.3, post.w, gate ? gateWood : wood[Math.floor(rnd() * wood.length)], 0, '-y');
  });
  for (let i = 0; i < n; i++) {
    const a = posts[i], b = posts[(i + 1) % n], ya = ground(a[0], a[1]), yb = ground(b[0], b[1]), gate = i === gateSpan;
    const [ix, iz] = inward(a, b), off = gate ? 0 : post.w / 2 + P.rail.w / 2, col = gate ? gateWood : wood[i % wood.length];
    const at = (q, y, k) => V(q[0] + ix * off, y + k, q[1] + iz * off);
    for (const r of (gate ? [0.25, 0.6, 0.95, 1.3] : P.rails)) s.beam(at(a, ya, r), at(b, yb, r), P.rail.w, P.rail.h, col);
    if (gate) s.beam(at(a, ya, 0.25), at(b, yb, 1.3), P.rail.w, 0.1, col); // the diagonal brace
  }
  const dark = lin(0x5b4330), water = lin(0x56737c), felt = lin(0x5a3d2d);
  if (spots.trough) { // a plank trough with water in it
    const { x, z, yaw } = spots.trough, T = P.trough, y = ground(x, z);
    s.at(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
    s.boxA(0, T.h / 2, 0, T.w, T.h, T.d, dark, 0, '+y');
    s.boxA(0, T.h - 0.03, 0, T.w - 0.1, 0.04, T.d - 0.1, water);
    for (const k of [-1, 1]) { s.boxA(k * (T.w / 2 - 0.1), 0.1, 0, 0.1, 0.2, T.d + 0.08, wood[0]); }
    s.at(null);
  }
  if (spots.shelter) { // a field shelter: back and side walls, a sloping felt roof on two front posts, open to the front (+z)
    const { x, z, yaw } = spots.shelter, S = P.shelter, y = ground(x, z) - 0.1, hs = S.h - 0.35;
    s.at(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
    s.boxA(0, S.h / 2, -S.d / 2, S.w, S.h, 0.1, wood[1], 0);
    for (const k of [-1, 1]) {
      s.boxA(k * (S.w / 2 - 0.05), hs / 2, 0, 0.1, hs, S.d, wood[2], 0);
      s.boxA(k * (S.w / 2 - 0.07), hs / 2, S.d / 2, 0.14, hs, 0.14, wood[0], 0, '-y');
    }
    s.beam(V(0, S.h + 0.02, -S.d / 2 - 0.25), V(0, hs + 0.02, S.d / 2 + 0.35), S.w + 0.5, 0.1, felt);
    s.at(null);
  }
  return s.geometry();
}

/** One C pony (unit: m, nose +z, ground y 0, withers 1.32): body, neck + mane, head, four legs, tail; `aPart` says which moves. */
export function ponyGeometry() {
  const s = new Soup(), COAT = [1, 0, 0], ACC = [0, 0, 0], BLACK = [2, 0, 0], MUZ = [0.45, 0, 0], SOCK = [0.3, 0, 0], neck = P.pony.neck;
  const base = V(...neck), lean = 0.66, dir = V(0, Math.cos(lean), Math.sin(lean)), back = V(0, Math.sin(lean), -Math.cos(lean));
  s.partId = 0; // body
  s.boxA(0, 0.98, -0.28, 0.5, 0.66, 0.74, COAT); s.boxA(0, 0.95, 0.3, 0.44, 0.62, 0.62, COAT); s.boxA(0, 1.27, 0.33, 0.2, 0.1, 0.3, COAT);
  s.boxA(0, 0.67, 0.0, 0.3, 0.1, 0.9, [0.8, 0, 0]); // the belly, a little darker
  s.partId = 1; s.pv = neck; // neck and mane (pivot: the neck's base)
  const nc = base.clone().addScaledVector(dir, 0.36), mc = nc.clone().addScaledVector(back, 0.14);
  s.boxA(nc.x, nc.y, nc.z, 0.2, 0.72, 0.26, COAT, lean); s.boxA(mc.x, mc.y, mc.z, 0.05, 0.72, 0.1, ACC, lean);
  const tip = base.clone().addScaledVector(dir, 0.72), pitch = 0.91, hd = V(0, -Math.sin(pitch), Math.cos(pitch)); // the head hangs 52° below level
  s.partId = 2; s.pv = [tip.x, tip.y, tip.z]; // head, ears, eyes, forelock, muzzle (pivot: the neck's top)
  const at = (k, up = 0, side = 0) => V(side, tip.y + hd.y * k + up, tip.z + hd.z * k);
  const hc = at(0.2); s.boxA(hc.x, hc.y, hc.z, 0.2, 0.24, 0.48, COAT, pitch);
  const mz = at(0.5); s.boxA(mz.x, mz.y, mz.z, 0.15, 0.17, 0.16, MUZ, pitch);
  for (const k of [-1, 1]) {
    const e = at(0.02, 0.12, k * 0.07), ey = at(0.17, 0.05, k * 0.11);
    s.boxA(e.x, e.y, e.z, 0.05, 0.13, 0.04, COAT, -0.15); s.boxA(ey.x, ey.y, ey.z, 0.03, 0.04, 0.05, BLACK);
  }
  const fl = at(0.08, 0.08); s.boxA(fl.x, fl.y, fl.z, 0.07, 0.12, 0.08, ACC, pitch);
  const legs = [[3, -0.16, 0.5, 0.14, 0.18], [4, 0.16, 0.5, 0.14, 0.18], [5, -0.17, -0.55, 0.16, 0.22], [6, 0.17, -0.55, 0.16, 0.22]];
  for (const [id, x, z, w, d] of legs) { // legs swing about the hip (pivot y 0.68)
    s.partId = id; s.pv = [x, 0.68, z];
    s.boxA(x, 0.53, z, w, 0.3, d, COAT); s.boxA(x, 0.235, z, 0.09, 0.29, 0.11, SOCK); s.boxA(x, 0.045, z + 0.01, 0.12, 0.09, 0.15, BLACK, 0, '-y');
  }
  s.partId = 7; s.pv = [0, 1.22, -0.66]; // tail swishes about its root
  s.boxA(0, 0.924, -0.752, 0.08, 0.62, 0.1, ACC, 0.3);
  return s.geometry(true);
}

/** The ponies' material: lit, vertex tones mixed per instance between a coat and an accent colour; `aAnim` = (leg phase, leg swing, neck pitch, tail sway). */
function ponyMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNeck = { value: V(...P.pony.neck) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPart; attribute vec3 aPivot; attribute vec3 aCoat; attribute vec3 aAccent; attribute vec4 aAnim; uniform vec3 uNeck;
        vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
        vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
        vec3 animate(vec3 v, bool isPos) {
          float p = aPart;
          if (p < 0.5) return v;
          if (p < 1.5) { vec3 q = isPos ? v - uNeck : v; q = rotX(q, aAnim.z); return isPos ? q + uNeck : q; }
          if (p < 2.5) {
            vec3 q = isPos ? v - aPivot : v; q = rotX(q, -aAnim.z * 0.55); q = isPos ? q + aPivot : q;
            q = isPos ? q - uNeck : q; q = rotX(q, aAnim.z); return isPos ? q + uNeck : q;
          }
          if (p < 6.5) { float ph = (p > 3.5 && p < 5.5) ? 3.14159 : 0.0; if (p > 4.5 && p < 5.5) ph = 3.14159; float a = sin(aAnim.x + ph) * aAnim.y; vec3 q = isPos ? v - aPivot : v; q = rotX(q, a); return isPos ? q + aPivot : q; }
          vec3 q = isPos ? v - aPivot : v; q = rotZ(q, aAnim.w); return isPos ? q + aPivot : q;
        }`)
      .replace('#include <color_vertex>', 'vColor = color.r > 1.5 ? vec3(0.03) : mix(aAccent, aCoat, clamp(color.r, 0.0, 1.0));')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = animate(objectNormal, false);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = animate(transformed, true);');
  };
  return m;
}

/** The worn track just inside the fence (soil colour) as land-mesh geometry for southbackdrop.js: `ground(x, z)` → y. Empty when too short. */
export function paddockLandParts(ground) {
  const ring = insetRing(outline, P.inset + P.track.inset), pos = [], col = [], c = new THREE.Color(P.track.color), w = P.track.w / 2;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    if (!l) continue;
    const nx = -dz / l * w, nz = dx / l * w, q = [[a[0] - nx, a[1] - nz], [a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz]];
    for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k][0], ground(q[k][0], q[k][1]) + 0.07, q[k][1]);
  }
  if (!pos.length) return [];
  for (let i = 0; i < pos.length / 3; i++) col.push(c.r, c.g, c.b);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return [g];
}

export class Paddock {
  /** `ground(x, z)` → the surface y; `trees`: [{x, z}] trunks to keep clear of (surroundings' treeFeet). */
  constructor({ scene, camera, ground, trees = [] }) {
    Object.assign(this, { camera, ground, time: 0 });
    const xs = fenceLine.map((q) => q[0]), zs = fenceLine.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    this.trees = trees.filter((t) => t.x > x0 - 5 && t.x < x1 + 5 && t.z > z0 - 5 && t.z < z1 + 5);
    this.waypoints = [];
    const g = P.waypoint, h = 0.5;
    for (let x = Math.ceil(x0 / g) * g; x < x1; x += g) for (let z = Math.ceil(z0 / g) * g; z < z1; z += g) {
      if (!insideFence(x, z, P.keep) || this.treeNear(x, z, P.treeClear)) continue;
      const r = riverAt(x, z);
      if (r.distance < r.width / 2 + P.riverClear) continue;
      const sx = (ground(x + h, z) - ground(x - h, z)) / (2 * h), sz = (ground(x, z + h) - ground(x, z - h)) / (2 * h);
      if (Math.hypot(sx, sz) <= P.maxSlope) this.waypoints.push([x, z]);
    }
    // the gate, the trough and the shelter stand on waypoints near the footpath side
    const a = posts[gateSpan], b = posts[(gateSpan + 1) % posts.length], gm = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    let nx = dz / l, nz = -dx / l; if (!insideFence(gm[0] + nx, gm[1] + nz)) { nx = -nx; nz = -nz; }
    this.gate = { x: gm[0], z: gm[1], nx, nz };
    const near = (px, pz, not) => this.waypoints.filter((w) => !not || Math.hypot(w[0] - not[0], w[1] - not[1]) > 9).sort((u, v) => Math.hypot(u[0] - px, u[1] - pz) - Math.hypot(v[0] - px, v[1] - pz))[0];
    const tw = near(gm[0] + nx * 9, gm[1] + nz * 9), sw = near(gm[0] + nx * 12 - nz * 16, gm[1] + nz * 12 + nx * 16, tw);
    const face = (w) => Math.atan2(gm[0] - w[0], gm[1] - w[1]);
    this.spots = { trough: tw && { x: tw[0], z: tw[1], yaw: face(tw) + Math.PI / 2 }, shelter: sw && { x: sw[0], z: sw[1], yaw: face(sw) } };
    this.fence = new THREE.Mesh(fenceGeometry(ground, this.spots), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.fence.name = 'paddock-fence'; this.fence.raycast = () => {}; this.fence.userData.noDetail = true; // the fence is seen from afar; fence collision is farwalk.js's
    scene.add(this.fence);
    // the ponies: one instanced mesh, two instances
    const animals = P.pony.animals, n = animals.length, geo = ponyGeometry();
    geo.setAttribute('aCoat', new THREE.InstancedBufferAttribute(new Float32Array(animals.flatMap((q) => lin(q.coat))), 3));
    geo.setAttribute('aAccent', new THREE.InstancedBufferAttribute(new Float32Array(animals.flatMap((q) => lin(q.accent))), 3));
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.anim.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAnim', this.anim);
    this.mesh = new THREE.InstancedMesh(geo, ponyMaterial(), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'paddock-ponies'; this.mesh.raycast = () => {}; this.mesh.userData.noDetail = true; this.mesh.userData.warmDraw = true; // not a target; drawn once by the warm-up
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(centre.x, 0, centre.z), centre.r + 10); // (the whole paddock: culled by the frustum as one)
    this.mesh.boundingSphere.center.y = ground(centre.x, centre.z);
    this.mesh.visible = false;
    scene.add(this.mesh);
    const start = [near(gm[0] + nx * 14, gm[1] + nz * 14), near(gm[0] + nx * 18 + nz * 12, gm[1] + nz * 18 - nx * 12)];
    this.ponies = animals.map((a, i) => {
      const w = start[i] ?? this.waypoints[i] ?? [centre.x, centre.z], rnd = mulberry(a.seed * 1000 + 1280);
      return { name: a.name, rnd, x: w[0], z: w[1], y: ground(w[0], w[1]), yaw: rnd() * 6.283, state: 'graze', left: 2 + rnd() * 8, target: null, goal: null, phase: rnd() * 6.283, amp: 0, neck: 1.2, tail: 0, tailT: rnd() * 6, chew: rnd() * 6, scale: P.pony.withers / 1.32 };
    });
    this.matrix = new THREE.Matrix4(); this.quat = new THREE.Quaternion(); this.pos = new THREE.Vector3(); this.scl = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.write();
  }

  treeNear(x, z, r) { for (const t of this.trees) if (Math.abs(t.x - x) < r && Math.abs(t.z - z) < r && Math.hypot(t.x - x, t.z - z) < r) return true; return false; }
  /** Is the straight walk (x0, z0) → (x1, z1) inside the fence (at least `keep` - 0.8 m from it) and clear of trunks? */
  clear(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.ceil(len / 1.5));
    for (let i = 1; i <= k; i++) { const x = x0 + (x1 - x0) * i / k, z = z0 + (z1 - z0) * i / k; if (!insideFence(x, z, P.keep - 0.8) || this.treeNear(x, z, 1.6)) return false; }
    return true;
  }
  /** The next place to walk to on the way to (gx, gz): the goal itself when the way is clear, else the clear waypoint that gets nearest. */
  hop(p, gx, gz) {
    if (this.clear(p.x, p.z, gx, gz)) return [gx, gz];
    let best = null, bd = Math.hypot(gx - p.x, gz - p.z) - 1;
    for (const w of this.waypoints) { const d = Math.hypot(gx - w[0], gz - w[1]); if (d < bd && Math.hypot(w[0] - p.x, w[1] - p.z) < 30 && this.clear(p.x, p.z, w[0], w[1])) { bd = d; best = w; } }
    if (best) return best;
    for (let i = 0; i < 8; i++) { const w = this.waypoints[Math.floor(p.rnd() * this.waypoints.length)]; if (w && Math.hypot(w[0] - p.x, w[1] - p.z) < 35 && this.clear(p.x, p.z, w[0], w[1])) return w; }
    return null;
  }
  /** Pick what a pony does next: walk to the nearest place to the visitor (when near), else graze / stand / wander. */
  decide(p, i) {
    const c = this.camera.position, R = P.pony, r = p.rnd, d = Math.hypot(c.x - p.x, c.z - p.z), curious = d < P.curious && this.waypoints.length;
    if (curious) {
      const taken = this.ponies.filter((q, j) => j !== i && q.goal).map((q) => q.goal);
      let best = null, bd = Infinity;
      for (const w of this.waypoints) { const dd = Math.hypot(w[0] - c.x, w[1] - c.z); if (dd < bd && taken.every((t) => Math.hypot(t[0] - w[0], t[1] - w[1]) > R.gap * 2.5)) { bd = dd; best = w; } }
      if (best && Math.hypot(best[0] - p.x, best[1] - p.z) > 1.2) { p.goal = best; p.target = this.hop(p, best[0], best[1]); if (p.target) { p.state = 'walk'; return; } }
      p.goal = best; p.state = 'watch'; p.left = 5 + r() * 6; return;
    }
    p.goal = null;
    const u = r();
    if (u < 0.5) { p.state = 'graze'; p.left = R.graze[0] + r() * (R.graze[1] - R.graze[0]); return; }
    if (u < 0.7) { p.state = 'idle'; p.left = R.idle[0] + r() * (R.idle[1] - R.idle[0]); return; }
    const w = this.waypoints[Math.floor(r() * this.waypoints.length)];
    const t = w && Math.hypot(w[0] - p.x, w[1] - p.z) < 40 ? this.hop(p, w[0], w[1]) : null;
    if (t) { p.state = 'walk'; p.target = t; } else { p.state = 'idle'; p.left = 2; }
  }
  stepPony(p, i, dt) {
    const R = P.pony, c = this.camera.position;
    p.left -= dt; p.tailT += dt; p.chew += dt;
    let walking = false;
    if (p.state === 'walk') {
      const tx = p.target[0] - p.x, tz = p.target[1] - p.z, dist = Math.hypot(tx, tz);
      if (dist < 0.5) { if (p.goal && Math.hypot(p.goal[0] - p.x, p.goal[1] - p.z) > 1.2) { p.target = this.hop(p, p.goal[0], p.goal[1]); if (!p.target) { p.state = 'idle'; p.left = 1; } } else { p.state = p.goal ? 'watch' : 'idle'; p.left = 3 + p.rnd() * 5; } }
      else {
        let da = Math.atan2(tx, tz) - p.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
        p.yaw += Math.max(-R.turn * dt, Math.min(R.turn * dt, da));
        if (Math.abs(da) < 0.7) {
          const s = R.speed * Math.min(1, dist / 1.5 + 0.3) * dt, nx = p.x + Math.sin(p.yaw) * s, nz = p.z + Math.cos(p.yaw) * s;
          if (insideFence(nx, nz, P.keep - 1) || !insideFence(p.x, p.z, P.keep - 1)) { p.x = nx; p.z = nz; walking = true; } else { p.state = 'idle'; p.left = 1; }
        }
        walking ||= Math.abs(da) >= 0.7;
      }
    } else if (p.state === 'watch') { // facing the visitor
      let da = Math.atan2(c.x - p.x, c.z - p.z) - p.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      p.yaw += Math.max(-0.8 * dt, Math.min(0.8 * dt, da));
    }
    if (p.state !== 'walk' && p.left <= 0) this.decide(p, i);
    // keep apart: a gentle push when two ponies stand closer than `gap`
    for (let j = 0; j < this.ponies.length; j++) {
      if (j === i) continue;
      const q = this.ponies[j], dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
      if (d < R.gap && d > 1e-3) { const k = (R.gap - d) * Math.min(1, 1.5 * dt) * 0.5, nx = p.x + dx / d * k, nz = p.z + dz / d * k; if (insideFence(nx, nz, P.keep - 1.2)) { p.x = nx; p.z = nz; } }
    }
    p.y = this.ground(p.x, p.z);
    // poses: legs swing while walking (diagonal pairs); the neck is down while grazing; the tail swishes now and then
    const k = Math.min(1, dt * 4), moving = walking ? 1 : 0;
    p.amp += (moving * 0.5 - p.amp) * k;
    p.phase += dt * (walking ? (R.speed / 0.95) * 6.2832 : 0);
    const grazing = p.state === 'graze';
    const neckT = grazing ? 1.5 + Math.sin(p.chew * 6) * 0.04 : walking ? 0.12 : 0.08 + Math.sin(p.tailT * 0.8) * 0.03;
    p.neck += (neckT - p.neck) * Math.min(1, dt * (grazing ? 1.4 : 2.2));
    p.tail = Math.sin(p.tailT * 2.3) * Math.max(0, Math.sin(p.tailT * 0.45)) * 0.35;
  }
  write() {
    const a = this.anim.array, e = this.mesh.instanceMatrix;
    this.ponies.forEach((p, i) => {
      this.quat.setFromAxisAngle(this.up, p.yaw); this.pos.set(p.x, p.y, p.z); this.scl.setScalar(p.scale);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.pos, this.quat, this.scl));
      a[i * 4] = p.phase; a[i * 4 + 1] = p.amp; a[i * 4 + 2] = p.neck; a[i * 4 + 3] = p.tail;
    });
    e.needsUpdate = true; this.anim.needsUpdate = true;
  }
  /** Per frame: nothing is simulated or drawn beyond PADDOCK.viewDist m from the paddock, or underground. No allocations. */
  update(dt, hidden = false) {
    const c = this.camera.position, show = !hidden && Math.hypot(c.x - centre.x, c.z - centre.z) < P.viewDist;
    this.mesh.visible = show;
    if (!show) return;
    dt = Math.min(dt, 0.1); this.time += dt;
    this.ponies.forEach((p, i) => this.stepPony(p, i, dt));
    this.write();
  }
}

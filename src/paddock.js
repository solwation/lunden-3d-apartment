import * as THREE from 'three';
import { PADDOCK as P, SEASON } from './config.js';
import { outline, fenceLine, posts, gateSpan, stile, insideFence, insetRing, ringDist, centre } from './paddockgeo.js';
import { stileBase } from './farwalk.js';
import { riverAt } from './riverbridge.js';
import { sfx } from './audio.js';
import { Hearts } from './pingping.js';
import { registerSeasonal } from './seasons.js';

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
    const cut = stile && i === stile.span, along = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], yAt = (t) => ya + (yb - ya) * t; // the stile's opening leaves the rails short of it
    for (const r of (gate ? [0.25, 0.6, 0.95, 1.3] : P.rails)) {
      if (cut) { s.beam(at(a, ya, r), at(along(stile.t0), yAt(stile.t0), r), P.rail.w, P.rail.h, col); s.beam(at(along(stile.t1), yAt(stile.t1), r), at(b, yb, r), P.rail.w, P.rail.h, col); }
      else s.beam(at(a, ya, r), at(b, yb, r), P.rail.w, P.rail.h, col);
    }
    if (gate) s.beam(at(a, ya, 0.25), at(b, yb, 1.3), P.rail.w, 0.1, col); // the diagonal brace
  }
  if (stile) { // #1295: the stile: steep steps up both sides of the fence line to a small platform, stepped side cheeks and a post and rail at each side of the platform (local z = into the paddock)
    const S = P.stile, y0 = stileBase(), W = S.w / 2, col = wood[1], tread = wood[2];
    s.at(new THREE.Matrix4().makeRotationY(Math.atan2(stile.nx, stile.nz)).setPosition(stile.x, 0, stile.z));
    for (const side of [-1, 1]) for (let k = 1; k <= 3; k++) { // k 3 = the platform (its half-length `platform`), 2 and 1 the treads either side
      const s0 = k === 3 ? 0 : S.platform + (k === 2 ? 0 : S.tread), s1 = k === 3 ? S.platform : S.platform + (k === 2 ? 1 : 2) * S.tread, h = k * S.rise;
      if (k === 3 && side === 1) continue; // (the platform is drawn once, centred)
      const len = k === 3 ? S.platform * 2 : s1 - s0, mid = k === 3 ? 0 : side * (s0 + s1) / 2;
      s.boxA(0, y0 + h - 0.03, mid, S.w - 0.02, 0.06, len + 0.04, tread, 0); // the tread / platform plank
      for (const e of [-1, 1]) s.boxA(e * (W - 0.04), y0 + h / 2 - 0.03, mid, 0.07, h, len, col, 0, '-y'); // a stepped cheek under it, both edges
    }
    for (const e of [-1, 1]) for (const f of [-1, 1]) s.boxA(e * (W - 0.04), y0 + 3 * S.rise + S.post / 2 - 0.03, f * (S.platform - 0.04), 0.1, S.post, 0.1, wood[0], 0, '-y'); // four posts round the platform
    for (const e of [-1, 1]) s.boxA(e * (W - 0.04), y0 + 3 * S.rise + S.post - 0.06, 0, 0.07, 0.07, S.platform * 2 + 0.12, wood[0], 0); // the hand rail along each side
    s.at(null);
  }
  const dark = lin(0x5b4330), water = lin(0x56737c);
  if (spots.trough) { // a plank trough with water in it
    const { x, z, yaw } = spots.trough, T = P.trough, y = ground(x, z);
    s.at(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
    s.boxA(0, T.h / 2, 0, T.w, T.h, T.d, dark, 0, '+y');
    s.boxA(0, T.h - 0.03, 0, T.w - 0.1, 0.04, T.d - 0.1, water);
    for (const k of [-1, 1]) { s.boxA(k * (T.w / 2 - 0.1), 0.1, 0, 0.1, 0.2, T.d + 0.08, wood[0]); }
    s.at(null);
  }
  if (spots.shelter) { // the field shelter after the photo in #1293: dark heavy timber posts and beams, diagonal braces, plank walls (back and sides), a green sedum roof; open to the front (+z)
    const { x, z, yaw } = spots.shelter, S = P.shelter, y = ground(x, z) - 0.1, tim = lin(0x4b382b), plank = lin(0x5f3d2c), sedum = lin(0x6c8446), sedum2 = lin(0xb5703a), hs = S.h - 0.4;
    s.at(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z));
    for (let k = 0; k < 5; k++) s.boxA(0, 0.3 + k * 0.4, -S.d / 2, S.w, 0.36, 0.08, plank, 0); // plank walls: the back …
    for (const k of [-1, 1]) for (let r = 0; r < 5; r++) s.boxA(k * (S.w / 2 - 0.04), 0.3 + r * 0.4, 0, 0.08, 0.36, S.d, plank, 0); // … and the two sides
    for (const px of [-S.w / 2, 0, S.w / 2]) s.boxA(px, hs / 2, S.d / 2 - 0.1, 0.22, hs, 0.2, tim, 0, '-y'); // the front posts
    s.boxA(0, hs + 0.1, S.d / 2 - 0.1, S.w + 0.24, 0.28, 0.22, tim, 0); // the front beam
    for (const px of [-S.w / 2, S.w / 2]) s.boxA(px, hs / 2, -S.d / 2 + 0.1, 0.22, hs, 0.2, tim, 0, '-y'); // the back corner posts
    for (const sx of [-S.w / 4, S.w / 4]) for (const dir of [-1, 1]) s.beam(V(sx, hs - 0.05, S.d / 2 - 0.1), V(sx + dir * 0.7, hs - 0.7, S.d / 2 - 0.1), 0.14, 0.12, tim); // the diagonal braces under the beam
    for (let k = 0; k < 4; k++) s.boxA(-S.w / 2 + 0.3 + k * (S.w - 0.6) / 3, hs + 0.14, 0, 0.16, 0.16, S.d + 0.2, tim, 0); // the rafters
    s.beam(V(0, S.h - 0.06, -S.d / 2 - 0.2), V(0, S.h - 0.1, S.d / 2 + 0.35), S.w + 0.5, 0.1, tim); // the roof boards
    s.beam(V(0, S.h + 0.03, -S.d / 2 - 0.15), V(0, S.h, S.d / 2 + 0.3), S.w + 0.4, 0.1, sedum); // the sedum roof
    s.beam(V(0, S.h + 0.07, S.d / 2 + 0.3), V(0, S.h + 0.06, S.d / 2 + 0.35), S.w + 0.4, 0.06, sedum2); // a rim of red-brown sedum along the front edge
    s.at(null);
  }
  return s.geometry();
}

/** A lofted tube through `secs` = [{p: [x, y, z], w: half-width (x), d: half-depth}] (an octagonal ring per section, square ends): one colour per segment
 *  (`cols[i]` for secs i → i+1, else `cols[0]`). The ring's depth axis is perpendicular to the path and to x (necks, legs, tails, a barrel all use it). */
Soup.prototype.tube = function (secs, cols) {
  const RING = [[0.6, 1], [1, 0.6], [1, -0.6], [0.6, -1], [-0.6, -1], [-1, -0.6], [-1, 0.6], [-0.6, 1]], X = V(1, 0, 0);
  const pts = (s, i) => {
    const a = V(...secs[Math.max(0, i - 1)].p), b = V(...secs[Math.min(secs.length - 1, i + 1)].p), t = b.sub(a).normalize(), v = X.clone().cross(t).normalize().multiplyScalar(s.d), c = V(...s.p);
    return RING.map(([k, l]) => c.clone().addScaledVector(X, k * s.w).addScaledVector(v, l));
  };
  const rings = secs.map(pts);
  for (let i = 0; i + 1 < secs.length; i++) {
    const mid = V(...secs[i].p).add(V(...secs[i + 1].p)).multiplyScalar(0.5), col = cols[i] ?? cols[0];
    for (let k = 0; k < 8; k++) this.quad(rings[i][k], rings[i][(k + 1) % 8], rings[i + 1][(k + 1) % 8], rings[i + 1][k], mid, col);
  }
  for (const [ri, s, out] of [[0, secs[0], V(...secs[0].p).sub(V(...secs[1].p))], [secs.length - 1, secs[secs.length - 1], V(...secs[secs.length - 1].p).sub(V(...secs[secs.length - 2].p))]]) {
    const c = V(...s.p);
    for (let k = 0; k < 8; k++) {
      const a = rings[ri][k], b = rings[ri][(k + 1) % 8], n = b.clone().sub(a).cross(c.clone().sub(a));
      if (n.dot(out) >= 0) this.tri(a, b, c, cols[0]); else this.tri(b, a, c, cols[0]);
    }
  }
};

/** One C pony (unit: m, nose +z, ground y 0, withers 1.32; the C-pony proportions after the photo in #1293): a lofted barrel, a crested neck with a
 *  mane, a long head with muzzle, forelock, eyes, a blaze-star mark and two ears, four jointed legs (hock, cannon, fetlock) with black hooves and a tail.
 *  Colour codes: 1 = coat, 0 = the accent (mane, tail, lower legs), 0.45 muzzle, 2 = black, 3 = the white star (only where `aMark`). `aPart` says which part moves:
 *  0 body, 1 neck + mane, 2 head, 3–6 legs, 7 tail, 8 ears. */
export function ponyGeometry() {
  const s = new Soup(), COAT = [1, 0, 0], ACC = [0, 0, 0], BLACK = [2, 0, 0], MUZ = [0.45, 0, 0], STAR = [3, 0, 0], neck = P.pony.neck, base = V(...neck);
  const lean = 0.66, dir = V(0, Math.cos(lean), Math.sin(lean)), back = V(0, Math.sin(lean), -Math.cos(lean)), at = (t, o = 0) => base.clone().addScaledVector(dir, t).addScaledVector(back, o);
  s.partId = 0; // the barrel: croup, loin, belly, withers, shoulder, chest (z, belly y, back y, half-width)
  s.tube([[-0.78, 0.78, 1.18, 0.14], [-0.64, 0.68, 1.30, 0.22], [-0.3, 0.62, 1.27, 0.26], [0.05, 0.6, 1.29, 0.26], [0.35, 0.66, 1.34, 0.24], [0.58, 0.76, 1.26, 0.2], [0.72, 0.9, 1.15, 0.12]]
    .map(([z, y0, y1, w]) => ({ p: [0, (y0 + y1) / 2, z], w, d: (y1 - y0) / 2 })), [COAT]);
  s.partId = 1; s.pv = neck; // the neck: thick at the shoulder, slim under the ears (about its base)
  s.tube([[-0.06, 0.17, 0.25], [0.3, 0.13, 0.17], [0.55, 0.105, 0.13], [0.74, 0.09, 0.115]].map(([t, w, d]) => ({ p: at(t).toArray(), w, d })), [COAT]);
  s.tube([[0.0, 0.2], [0.25, 0.2], [0.5, 0.19], [0.78, 0.14]].map(([t, o], i) => ({ p: at(t, o + 0.02).toArray(), w: i === 3 ? 0.012 : 0.025, d: 0.07 })), [ACC]); // the mane along the crest
  const tip = at(0.72), pitch = 0.91, hd = V(0, -Math.sin(pitch), Math.cos(pitch)), hu = V(0, Math.cos(pitch), Math.sin(pitch));
  const hp = (k, o = 0, x = 0) => tip.clone().addScaledVector(hd, k).addScaledVector(hu, o).add(V(x, 0, 0)).toArray();
  s.partId = 2; s.pv = tip.toArray(); // the head, hanging about 50° below level (about the neck's top)
  s.tube([{ p: hp(-0.04), w: 0.085, d: 0.1 }, { p: hp(0.14, -0.015), w: 0.1, d: 0.125 }, { p: hp(0.38), w: 0.065, d: 0.085 }, { p: hp(0.5), w: 0.068, d: 0.075 }, { p: hp(0.58), w: 0.06, d: 0.062 }], [COAT, COAT, MUZ, MUZ]);
  s.tube([{ p: hp(0.1, 0.118), w: 0.02, d: 0.04 }, { p: hp(0.3, 0.092), w: 0.022, d: 0.04 }], [STAR]); // the star on the forehead (shown on Princess)
  s.tube([{ p: hp(-0.02, 0.1), w: 0.07, d: 0.03 }, { p: hp(0.06, 0.13), w: 0.045, d: 0.055 }], [ACC]); // the forelock
  for (const k of [-1, 1]) { // eyes
    const c = V(...hp(0.12, 0.03, k * 0.1)), e = V(k * 0.012, 0, 0);
    s.box(c, e, hu.clone().multiplyScalar(0.03), hd.clone().multiplyScalar(0.03), BLACK);
  }
  s.partId = 8; // the ears (about their roots)
  for (const k of [-1, 1]) {
    const r = hp(-0.01, 0.1, k * 0.055), up = V(k * 0.12, 0.98, 0.1).normalize(), r1 = V(...r).addScaledVector(up, 0.07).toArray(), r2 = V(...r).addScaledVector(up, 0.15).toArray();
    s.pv = r; s.tube([{ p: r, w: 0.03, d: 0.02 }, { p: r1, w: 0.03, d: 0.02 }, { p: r2, w: 0.008, d: 0.008 }], [COAT, COAT]);
  }
  // legs, swinging about the hip (pivot y 0.68): y, z range, half-width; the lower leg takes the accent, the hoof black
  const leg = (id, x, rows) => {
    s.partId = id; s.pv = [x, 0.68, (rows[0][1] + rows[0][2]) / 2];
    s.tube(rows.map(([y, z0, z1, w]) => ({ p: [x, y, (z0 + z1) / 2], w, d: (z1 - z0) / 2 })), [COAT, COAT, COAT, ACC, ACC, ACC, BLACK, BLACK]);
  };
  const fore = [[0.92, 0.34, 0.66, 0.1], [0.62, 0.42, 0.62, 0.075], [0.47, 0.43, 0.6, 0.07], [0.4, 0.46, 0.58, 0.05], [0.13, 0.47, 0.57, 0.045], [0.07, 0.45, 0.59, 0.058], [0.06, 0.45, 0.59, 0.065], [0, 0.42, 0.64, 0.08]];
  const hind = [[1.0, -0.78, -0.36, 0.12], [0.72, -0.74, -0.42, 0.095], [0.5, -0.8, -0.58, 0.07], [0.42, -0.74, -0.6, 0.05], [0.13, -0.68, -0.56, 0.045], [0.07, -0.7, -0.54, 0.058], [0.06, -0.7, -0.54, 0.065], [0, -0.72, -0.52, 0.08]];
  leg(3, -0.15, fore); leg(4, 0.15, fore); leg(5, -0.16, hind); leg(6, 0.16, hind);
  s.partId = 7; s.pv = [0, 1.2, -0.72]; // the tail, a dock and a hanging switch, swishing about its root
  s.tube([{ p: [0, 1.2, -0.72], w: 0.045, d: 0.05 }, { p: [0, 1.12, -0.85], w: 0.06, d: 0.06 }, { p: [0, 0.8, -0.92], w: 0.07, d: 0.05 }, { p: [0, 0.4, -0.9], w: 0.045, d: 0.035 }], [ACC]);
  return s.geometry(true);
}

/** The ponies' material: lit, vertex tones mixed per instance between a coat and an accent colour; `aAnim` = (leg phase, leg swing, neck pitch, tail sway),
 *  `aAnim2` = (ear flick, head turn, 0, 0), `aMark` = the star on the forehead (0 / 1). */
function ponyMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    const neck = V(...P.pony.neck), lean = 0.66;
    sh.uniforms.uNeck = { value: neck };
    sh.uniforms.uTip = { value: neck.clone().addScaledVector(V(0, Math.cos(lean), Math.sin(lean)), 0.72) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPart; attribute vec3 aPivot; attribute vec3 aCoat; attribute vec3 aAccent; attribute vec4 aAnim; attribute vec4 aAnim2; attribute float aMark; uniform vec3 uNeck; uniform vec3 uTip;
        vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
        vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
        vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
        vec3 about(vec3 v, vec3 o, bool isPos, int axis, float a) { vec3 q = isPos ? v - o : v; q = axis == 0 ? rotX(q, a) : axis == 1 ? rotY(q, a) : rotZ(q, a); return isPos ? q + o : q; }
        vec3 animate(vec3 v, bool isPos) {
          float p = aPart;
          if (p < 0.5) return v;
          if (p < 1.5) return about(about(v, uNeck, isPos, 0, aAnim.z), uNeck, isPos, 1, aAnim2.y * 0.4);
          if (p < 2.5 || p > 7.5) { // head and ears: counter-pitch and turn about the neck's top, then the neck's own movement
            vec3 q = v;
            if (p > 7.5) q = about(q, aPivot, isPos, 0, -aAnim2.x);
            q = about(about(q, uTip, isPos, 0, -aAnim.z * 0.55), uTip, isPos, 1, aAnim2.y * 0.6);
            return about(about(q, uNeck, isPos, 0, aAnim.z), uNeck, isPos, 1, aAnim2.y * 0.4);
          }
          if (p < 6.5) { float ph = (p > 3.5 && p < 5.5) ? 3.14159 : 0.0; if (p > 4.5 && p < 5.5) ph = 3.14159; return about(v, aPivot, isPos, 0, sin(aAnim.x + ph) * aAnim.y); }
          return about(v, aPivot, isPos, 2, aAnim.w);
        }`)
      .replace('#include <color_vertex>', 'vColor = color.r > 2.5 ? mix(aCoat, vec3(0.9), aMark) : color.r > 1.5 ? vec3(0.03) : mix(aAccent, aCoat, clamp(color.r, 0.0, 1.0));')
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

/** The long-grass tufts (#1315): ONE instanced mesh, `n` tufts of three crossed tapered blades (6 triangles). Their height comes from the mask texture in the vertex shader. */
function grassGeometry() {
  const G = P.grass, pos = [], col = [], nor = [], a = new THREE.Color(G.colors[0]), b = new THREE.Color(G.colors[1]);
  for (let k = 0; k < 3; k++) {
    const ang = k * Math.PI / 3, c = Math.cos(ang) * G.w / 2, s = Math.sin(ang) * G.w / 2, tc = 0.2;
    const q = [[-c, 0, -s, a], [c, 0, s, a], [c * tc, 1, s * tc, b], [-c * tc, 1, -s * tc, b]];
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i][0], q[i][1], q[i][2]); col.push(q[i][3].r, q[i][3].g, q[i][3].b); nor.push(0, 1, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function grassMaterial(mask, box) {
  const G = P.grass, m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask }; sh.uniforms.uBox = { value: box }; sh.uniforms.uLen = { value: new THREE.Vector2(G.short, G.long) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n uniform sampler2D uMask; uniform vec4 uBox; uniform vec2 uLen;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 gp = instanceMatrix[3].xz; float gm = texture2D(uMask, (gp - uBox.xy) * uBox.zw).r;
        transformed.y *= mix(uLen.x, uLen.y, smoothstep(0.1, 0.9, gm));`);
  };
  return m;
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
    geo.setAttribute('aMark', new THREE.InstancedBufferAttribute(new Float32Array(animals.map((q) => q.star ? 1 : 0)), 1));
    geo.setAttribute('aAccent', new THREE.InstancedBufferAttribute(new Float32Array(animals.flatMap((q) => lin(q.accent))), 3));
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.anim.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAnim', this.anim);
    this.anim2 = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.anim2.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAnim2', this.anim2);
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
      return { name: a.name, rnd, x: w[0], z: w[1], y: ground(w[0], w[1]), yaw: rnd() * 6.283, state: 'graze', left: 2 + rnd() * 8, target: null, goal: null, phase: rnd() * 6.283, amp: 0, neck: 1.2, tail: 0, tailT: rnd() * 6, chew: rnd() * 6, ear: 0, earP: -1, earT: 2 + rnd() * 6, headYaw: 0, petT: 0, scale: P.pony.withers / 1.32 };
    });
    // "Klappa" (#1293): an invisible pick box per pony, kept out of the scene (so darts and other rays never see it); only main.js's focus ray tests them
    this.picks = this.ponies.map((p, i) => {
      const pick = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.5, 2.1), new THREE.MeshBasicMaterial()); pick.visible = false;
      pick.userData.door = { name: p.name, kind: 'pony', verb: 'klappa', pickable: pick, pet: () => this.pet(i) };
      return pick;
    });
    this.hearts = this.ponies.map(() => new Hearts(scene, P.pony.hearts, P.pony.heartScale)); // #1320: pink hearts rise from a petted pony's head
    this.onPet = null; // set by main.js: scores a pat (#1320)
    this.matrix = new THREE.Matrix4(); this.quat = new THREE.Quaternion(); this.pos = new THREE.Vector3(); this.scl = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.initGrass(scene, ground);
    this.write();
  }

  /** The grass-length mask (#1315) and its tufts: random grazed patches per session, the places the ponies stand most grazed short. */
  initGrass(scene, ground) {
    const G = P.grass, xs = fenceLine.map((q) => q[0]), zs = fenceLine.map((q) => q[1]), x0 = Math.min(...xs) - 2, z0 = Math.min(...zs) - 2;
    const W = Math.ceil((Math.max(...xs) + 2 - x0) / G.cell), H = Math.ceil((Math.max(...zs) + 2 - z0) / G.cell);
    this.gm = { x0, z0, W, H, v: new Float32Array(W * H).fill(1), t: 0, dirty: false, acc: 0 };
    const rnd = mulberry((Math.random() * 1e9) | 0), eat = (x, z, r, lvl) => this.eatAt(x, z, r, lvl, 1);
    for (let i = 0; i < G.patches && this.waypoints.length; i++) { const w = this.waypoints[Math.floor(rnd() * this.waypoints.length)]; eat(w[0] + (rnd() - 0.5) * 4, w[1] + (rnd() - 0.5) * 4, G.radius[0] + rnd() * (G.radius[1] - G.radius[0]), G.level); }
    for (const sp of [this.spots.trough, this.spots.shelter]) if (sp) eat(sp.x, sp.z, G.around, G.level);
    this.maskTex = new THREE.DataTexture(new Uint8Array(W * H), W, H, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.minFilter = this.maskTex.magFilter = THREE.LinearFilter; this.maskTex.wrapS = this.maskTex.wrapT = THREE.ClampToEdgeWrapping;
    this.uploadGrass();
    const spots = [];
    for (let x = Math.ceil(x0 / G.spacing) * G.spacing; x < x0 + W * G.cell; x += G.spacing) for (let z = Math.ceil(z0 / G.spacing) * G.spacing; z < z0 + H * G.cell; z += G.spacing) {
      const px = x + (rnd() - 0.5) * G.spacing * 0.9, pz = z + (rnd() - 0.5) * G.spacing * 0.9;
      if (!insideFence(px, pz, G.margin)) continue;
      const r = riverAt(px, pz); if (r.distance < r.width / 2 + 2) continue;
      spots.push([px, pz, rnd() * 6.283, 0.75 + rnd() * 0.6]);
    }
    const mesh = new THREE.InstancedMesh(grassGeometry(), grassMaterial(this.maskTex, new THREE.Vector4(x0, z0, 1 / (W * G.cell), 1 / (H * G.cell))), Math.max(1, spots.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach((t, i) => mesh.setMatrixAt(i, m.compose(v.set(t[0], ground(t[0], t[1]) + 0.02, t[1]), q.setFromAxisAngle(up, t[2]), sc.set(t[3], t[3], t[3]))));
    mesh.count = spots.length; mesh.name = 'paddock-grass'; mesh.raycast = () => {}; mesh.userData.noDetail = true; mesh.userData.warmDraw = true; mesh.visible = false;
    mesh.boundingSphere = this.mesh.boundingSphere.clone(); mesh.castShadow = false; mesh.receiveShadow = false;
    registerSeasonal((month) => { this.snowy = SEASON.snowMonths.includes(month); });
    this.grass = mesh; scene.add(mesh);
  }
  inside(x, z) { return insideFence(x, z, P.grass.margin); }
  /** The mask value (0 grazed .. 1 long) at a world point; 1 outside the mask. */
  grassAt(x, z) {
    const g = this.gm, i = Math.floor((x - g.x0) / P.grass.cell), j = Math.floor((z - g.z0) / P.grass.cell);
    return i < 0 || j < 0 || i >= g.W || j >= g.H ? 1 : g.v[j * g.W + i];
  }
  /** Graze the mask round (x, z): cells within `r` m lose `amount` (`lvl` mode: set at most to `amount`), softer towards the rim. */
  eatAt(x, z, r, amount, mode = 0) {
    const g = this.gm, c = P.grass.cell, i0 = Math.max(0, Math.floor((x - r - g.x0) / c)), i1 = Math.min(g.W - 1, Math.floor((x + r - g.x0) / c)), j0 = Math.max(0, Math.floor((z - r - g.z0) / c)), j1 = Math.min(g.H - 1, Math.floor((z + r - g.z0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(g.x0 + (i + 0.5) * c - x, g.z0 + (j + 0.5) * c - z); if (d > r) continue;
      const k = j * g.W + i, f = 1 - 0.6 * (d / r);
      g.v[k] = mode ? Math.min(g.v[k], amount + (1 - amount) * (d / r) ** 4) : Math.max(0, g.v[k] - amount * f);
    }
    g.dirty = true;
  }
  uploadGrass() { const g = this.gm, a = this.maskTex.image.data; for (let i = 0; i < g.v.length; i++) a[i] = Math.round(g.v[i] * 255); this.maskTex.needsUpdate = true; g.dirty = false; }

  /** What E can aim at: the ponies' pick boxes while the paddock is within view distance. */
  targets() { return this.mesh.visible ? this.picks : []; }
  /** Pat pony `i`: it stops, turns its head to the hand, flicks its ears, lowers its muzzle and nickers (a short sound), its tail swishes. */
  pet(i) {
    const p = this.ponies[i]; if (!p) return false;
    const fresh = p.state !== 'pet'; // a pat while it is already being petted renews it but scores and nickers once
    p.state = 'pet'; p.petT = p.left = P.pony.pet; p.target = null; p.goal = null; p.earP = 0; p.earT = 0.5;
    if (fresh) {
      const head = this.headPos(p);
      sfx.whinny(head, i ? 0.92 : 1.08); // a happy whinny (#1320)
      this.hearts[i].burst(head);
      this.onPet?.(p.name);
    }
    return true;
  }
  /** World point just above pony `p`'s head (the muzzle end of the neck, lifted a little so hearts rise clear of it). */
  headPos(p) {
    const s = p.scale, n = P.pony.neck, c = this.camera.position, d = Math.hypot(c.x - p.x, c.z - p.z) || 1; // it turns to face the visitor while petted, so its head ends up on that side
    return new THREE.Vector3(p.x + (c.x - p.x) / d * n[2] * s, p.y + (n[1] + 0.25) * s, p.z + (c.z - p.z) / d * n[2] * s);
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
    const G = P.grass, mx = p.x + Math.sin(p.yaw) * G.reach * p.scale, mz = p.z + Math.cos(p.yaw) * G.reach * p.scale;
    if (u < 0.5 && this.grassAt(mx, mz) >= G.hungry) { p.state = 'graze'; p.left = R.graze[0] + r() * (R.graze[1] - R.graze[0]); return; }
    if (u < 0.5) { const w = this.longPlace(p); if (w) { const t = this.hop(p, w[0], w[1]); if (t) { p.state = 'walk'; p.target = t; p.eat = true; return; } } p.state = 'graze'; p.left = R.graze[0] + r() * (R.graze[1] - R.graze[0]); return; } // the grass here is short: walk to a longer place to graze (#1315)
    if (u < 0.7) { p.state = 'idle'; p.left = R.idle[0] + r() * (R.idle[1] - R.idle[0]); return; }
    const w = this.longPlace(p) ?? this.waypoints[Math.floor(r() * this.waypoints.length)];
    const t = w && Math.hypot(w[0] - p.x, w[1] - p.z) < 40 ? this.hop(p, w[0], w[1]) : null;
    if (t) { p.state = 'walk'; p.target = t; } else { p.state = 'idle'; p.left = 2; }
  }
  /** The longest-grass waypoint among a few random ones within walking range (#1315), or null. */
  longPlace(p) {
    let best = null, bv = -1;
    for (let k = 0; k < P.grass.tries && this.waypoints.length; k++) {
      const w = this.waypoints[Math.floor(p.rnd() * this.waypoints.length)], d = Math.hypot(w[0] - p.x, w[1] - p.z);
      if (d < 2 || d > 40) continue;
      const v = this.grassAt(w[0], w[1]) - d * 0.004; if (v > bv) { bv = v; best = w; }
    }
    return best;
  }
  stepPony(p, i, dt) {
    const R = P.pony, c = this.camera.position;
    p.left -= dt; p.tailT += dt; p.chew += dt;
    let walking = false;
    if (p.state === 'walk') {
      const tx = p.target[0] - p.x, tz = p.target[1] - p.z, dist = Math.hypot(tx, tz);
      if (dist < 0.5) { if (p.goal && Math.hypot(p.goal[0] - p.x, p.goal[1] - p.z) > 1.2) { p.target = this.hop(p, p.goal[0], p.goal[1]); if (!p.target) { p.state = 'idle'; p.left = 1; } } else { p.state = p.goal ? 'watch' : p.eat ? 'graze' : 'idle'; p.eat = false; p.left = p.state === 'graze' ? P.pony.graze[0] + p.rnd() * (P.pony.graze[1] - P.pony.graze[0]) : 3 + p.rnd() * 5; } }
      else {
        let da = Math.atan2(tx, tz) - p.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
        p.yaw += Math.max(-R.turn * dt, Math.min(R.turn * dt, da));
        if (Math.abs(da) < 0.7) {
          const s = R.speed * Math.min(1, dist / 1.5 + 0.3) * dt, nx = p.x + Math.sin(p.yaw) * s, nz = p.z + Math.cos(p.yaw) * s;
          if (insideFence(nx, nz, P.keep - 1) || !insideFence(p.x, p.z, P.keep - 1)) { p.x = nx; p.z = nz; walking = true; } else { p.state = 'idle'; p.left = 1; }
        }
        walking ||= Math.abs(da) >= 0.7;
      }
    } else if (p.state === 'watch' || p.state === 'pet') { // facing the visitor
      let da = Math.atan2(c.x - p.x, c.z - p.z) - p.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      const turn = p.state === 'pet' ? 1.4 : 0.8;
      p.yaw += Math.max(-turn * dt, Math.min(turn * dt, da));
    }
    {
      let da = Math.atan2(c.x - p.x, c.z - p.z) - p.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      const t = (p.state === 'pet' ? 1 : p.state === 'watch' ? 0.6 : 0) * Math.max(-0.8, Math.min(0.8, da));
      p.headYaw += (t - p.headYaw) * Math.min(1, dt * 3); // the head turns to the visitor while it is petted or watching
    }
    if (p.petT > 0) p.petT -= dt;
    if (p.earP >= 0) { p.earP += dt / 0.35; if (p.earP > 1) p.earP = -1; } else { p.earT -= dt; if (p.earT <= 0) { p.earP = 0; p.earT = p.state === 'pet' ? 0.6 : 3 + p.rnd() * 7; } }
    p.ear = p.earP >= 0 ? 0.6 * Math.sin(p.earP * Math.PI) : 0;
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
    const neckT = p.state === 'pet' ? 0.5 + Math.sin(p.petT * 7) * 0.06 : grazing ? 1.5 + Math.sin(p.chew * 6) * 0.04 : walking ? 0.12 : 0.08 + Math.sin(p.tailT * 0.8) * 0.03;
    p.neck += (neckT - p.neck) * Math.min(1, dt * (grazing ? 1.4 : 2.2));
    if (grazing && p.neck > 1.1) { const G = P.grass, e = G.reach * p.scale; this.eatAt(p.x + Math.sin(p.yaw) * e, p.z + Math.cos(p.yaw) * e, G.bite, G.rate * dt); } // the muzzle crops the grass in front of it (#1315)
    p.tail = Math.sin(p.tailT * (p.state === 'pet' ? 5 : 2.3)) * (p.state === 'pet' ? 0.4 : Math.max(0, Math.sin(p.tailT * 0.45)) * 0.35);
  }
  write() {
    const a = this.anim.array, b = this.anim2.array, e = this.mesh.instanceMatrix;
    this.ponies.forEach((p, i) => {
      this.quat.setFromAxisAngle(this.up, p.yaw); this.pos.set(p.x, p.y, p.z); this.scl.setScalar(p.scale);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.pos, this.quat, this.scl));
      a[i * 4] = p.phase; a[i * 4 + 1] = p.amp; a[i * 4 + 2] = p.neck; a[i * 4 + 3] = p.tail;
      b[i * 4] = p.ear; b[i * 4 + 1] = p.headYaw;
      const pk = this.picks[i], s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      pk.position.set(p.x + s * 0.15, p.y + 0.8, p.z + c * 0.15); pk.rotation.y = p.yaw; pk.updateMatrixWorld(true);
    });
    e.needsUpdate = true; this.anim.needsUpdate = true; this.anim2.needsUpdate = true;
  }
  /** Per frame: nothing is simulated or drawn beyond PADDOCK.viewDist m from the paddock, or underground. No allocations. */
  update(dt, hidden = false) {
    for (const h of this.hearts) h.update(dt);
    const c = this.camera.position, show = !hidden && Math.hypot(c.x - centre.x, c.z - centre.z) < P.viewDist;
    this.mesh.visible = show; this.grass.visible = show && !this.snowy;
    if (!show) return;
    dt = Math.min(dt, 0.1); this.time += dt;
    this.ponies.forEach((p, i) => this.stepPony(p, i, dt));
    const g = this.gm; g.acc += dt; g.t += dt;
    if (g.acc >= 1) { const up = g.acc * P.grass.regrow; g.acc = 0; for (let k = 0; k < g.v.length; k++) if (g.v[k] < 1) g.v[k] = Math.min(1, g.v[k] + up); g.dirty = true; } // slow regrowth
    if (g.dirty && g.t >= P.grass.period) { g.t = 0; this.uploadGrass(); }
    this.write();
  }
}

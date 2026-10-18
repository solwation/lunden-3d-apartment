import * as THREE from 'three';
import { PADDOCK as P } from './config.js';
import { outline, fenceLine, posts, gateSpan, insideFence, insetRing, ringDist, centre } from './paddockgeo.js';
import { riverAt } from './riverbridge.js';
import { sfx } from './audio.js';

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
    this.matrix = new THREE.Matrix4(); this.quat = new THREE.Quaternion(); this.pos = new THREE.Vector3(); this.scl = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.write();
  }

  /** What E can aim at: the ponies' pick boxes while the paddock is within view distance. */
  targets() { return this.mesh.visible ? this.picks : []; }
  /** Pat pony `i`: it stops, turns its head to the hand, flicks its ears, lowers its muzzle and nickers (a short sound), its tail swishes. */
  pet(i) {
    const p = this.ponies[i]; if (!p) return false;
    p.state = 'pet'; p.petT = p.left = P.pony.pet; p.target = null; p.goal = null; p.earP = 0; p.earT = 0.5;
    sfx.nicker({ x: p.x, y: p.y + 1.3, z: p.z }, i ? 0.92 : 1.08);
    return true;
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
    const c = this.camera.position, show = !hidden && Math.hypot(c.x - centre.x, c.z - centre.z) < P.viewDist;
    this.mesh.visible = show;
    if (!show) return;
    dt = Math.min(dt, 0.1); this.time += dt;
    this.ponies.forEach((p, i) => this.stepPony(p, i, dt));
    this.write();
  }
}

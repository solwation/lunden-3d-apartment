import * as THREE from 'three';
import { CAUGHT_FISH as C } from './config.js';
import { buildFishSurface } from './fishsurface.js';

// #1765: the caught fish's own model (CaughtFish in src/fishing.js), built per RIVER_FISH species from CAUGHT_FISH (all *guess*). One geometry
// per species, cached and shared by every fish of that species; one mesh and one draw call per fish, up to 900 triangles for the six #1922 surfaces, no texture: the
// skin, its bars and spots, the fins and the eyes are vertex colours (the material's colour stays white raw and tints the whole fish golden /
// charred when it is cooked, #1754). Units: the fish's length, the nose at z = +0.5, the tail tips at z = -0.5, the back up (+y).
// - The body is a loft of elliptical cross-sections from the caudal peduncle (u = 0) to the nose (u = 1): it swells to `depth` at `peak`,
//   narrows to `ped` at the peduncle and tapers to the nose by the `nose` exponents (the pike's flat beak: pointed seen from the side, wide
//   from above). Barred species get a section at every bar and gap, every species one at the gill line (a darker band behind the head).
// - Fins are flat, double-sided polygons: a forked (or, for the eel, rounded) tail fin, dorsal / second dorsal / adipose fins on the back
//   (the perch's first dorsal spiny), an anal fin underneath, pairs of pectoral and pelvic fins, and the eel's long fin round its tail.
// - Eyes: an iris ring round a black pupil on each side of the head.

// The builder below preserves the #1765 custom-spec path (including the shark);
// the six registered species return the shared #1922 surface recipe before it.
const col = (hex) => new THREE.Color(hex);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (...v) => { let h = 2166136261; for (const x of v) { h ^= x >>> 0; h = Math.imul(h, 16777619); h ^= h >>> 13; } return (h >>> 0) / 4294967296; };

/** The body of species spec `s`: its section radii and points as functions of u (0 = peduncle, 1 = nose) and the angle round. */
export function fishBody(s) {
  const zt = -0.5 + s.tail, len = 0.5 - zt;
  const shape = (u, k, ped) => {
    if (u <= s.peak) return ped + (1 - ped) * Math.sin((u / s.peak) * Math.PI / 2);
    const t = Math.min(1, (u - s.peak) / (1 - s.peak));
    return Math.pow(Math.max(0, 1 - Math.pow(t, k)), 1 / k);
  };
  const rt = (u) => s.depth * s.top * shape(u, s.nose[0], s.ped), rb = (u) => s.depth * (1 - s.top) * shape(u, s.nose[0], s.ped);
  const hw = (u) => s.width / 2 * shape(u, s.nose[1], s.ped * 0.75);
  const z = (u) => zt + u * len;
  const at = (u, a, o = new THREE.Vector3()) => { const sn = Math.sin(a); return o.set(hw(u) * Math.cos(a), sn * (sn >= 0 ? rt(u) : rb(u)), z(u)); };
  return { zt, len, rt, rb, hw, z, at };
}

/** The sections' u values: uniform ones, a section at every bar and gap of a barred pattern (no uniform ones between them) and the gill line. */
function sections(s) {
  const n = C.rings, uni = Array.from({ length: n }, (_, k) => k / (n - 1)), special = [1 - s.head];
  let lo = 2, hi = -1;
  if (s.bars) {
    const [count, from, to] = s.bars, step = (to - from) / (count * 2);
    for (let k = 0; k <= count * 2; k++) special.push(from + k * step);
    lo = from - step / 2; hi = to + step / 2;
  }
  const gap = 0.45 / (n - 1);
  const keep = uni.filter((u) => u === 0 || u === 1 || (!(u > lo && u < hi) && special.every((q) => Math.abs(q - u) > gap)));
  return [...new Set([...keep, ...special.filter((q) => q > 0.01 && q < 0.99)])].sort((a, b) => a - b);
}

/** The skin colour (linear) of species `s` at section u (index k), angle round `a` (vertex j). */
function skin(s, u, k, a, j, out) {
  const sn = Math.sin(a), back = col(s.back), side = col(s.side), belly = col(s.belly);
  out.copy(side).lerp(back, smooth(0.2, 0.85, sn)).lerp(belly, smooth(-0.2, -0.75, sn));
  if (s.bars) {
    const [count, from, to, dark] = s.bars, step = (to - from) / (count * 2), i = Math.round((u - from) / step);
    if (u >= from - 1e-6 && u <= to + 1e-6 && Math.abs(from + i * step - u) < 1e-6 && i % 2 === 1) out.lerp(col(dark), 0.8 * smooth(-0.5, 0.15, sn));
  }
  if (Math.abs(u - (1 - s.head)) < 1e-6 && sn > -0.75 && sn < 0.85) out.multiplyScalar(C.gill);
  return out;
}

class Builder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vert(p, n, c) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(c.r, c.g, c.b); return this.count - 1; }
  /** A flat polygon: points, colours, triangles as index triples into them; the normal from the first triangle. */
  flat(pts, cols, tris) {
    const [a, b, c] = tris[0].map((i) => pts[i]), n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const base = this.count;
    pts.forEach((p, i) => this.vert(p, n, cols[i]));
    for (const t of tris) this.idx.push(base + t[0], base + t[1], base + t[2]);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const cache = new Map();
/** The caught-fish geometry of RIVER_FISH species `name` (cached, shared: never dispose it). userData.lum = the skin's mean luminance
 *  (linear), so cooking can tint every species to the same golden brown. */
export function caughtFishGeometry(name, spec = null) { // (#1769: `spec` = a body spec of the same shape that is no RIVER_FISH species: the shark's carcass, SHARK.look)
  let g = cache.get(name);
  if (g) return g;
  if (!spec && C.species[name]) { g=buildFishSurface(name);cache.set(name,g);return g; }
  const s = spec ?? C.species[name] ?? Object.values(C.species)[0], B = fishBody(s), M = C.around, us = sections(s), out = new Builder();
  const V = () => new THREE.Vector3(), c = new THREE.Color(), fin = s.fins;

  // the body: an indexed loft (smooth normals), the last section the nose's point, a fan closing the peduncle
  const body = [], bcol = [];
  let lum = 0, ln = 0;
  us.forEach((u, k) => {
    if (u === 1) return;
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2;
      body.push(B.at(u, a, V()));
      skin(s, u, k, a, j, c); bcol.push(c.clone()); lum += c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722; ln++;
    }
  });
  const R = us.length - 1, nose = body.length, tailC = nose + 1;
  body.push(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, 0, B.zt)); bcol.push(col(C.mouth), bcol[Math.floor(M / 2)].clone());
  const bidx = [];
  for (let k = 0; k < R - 1; k++) for (let j = 0; j < M; j++) {
    const a = k * M + j, b = k * M + (j + 1) % M, cc = a + M, d = b + M;
    bidx.push(a, b, cc, b, d, cc);
  }
  for (let j = 0; j < M; j++) {
    bidx.push((R - 1) * M + j, (R - 1) * M + (j + 1) % M, nose); // the nose
    bidx.push((j + 1) % M, j, tailC);                           // the peduncle's end (inside the tail fin)
  }
  const bg = new THREE.BufferGeometry().setFromPoints(body);
  bg.setIndex(bidx); bg.computeVertexNormals();
  const bn = bg.attributes.normal, n = V();
  body.forEach((p, i) => out.vert(p, n.fromBufferAttribute(bn, i), bcol[i]));
  out.idx.push(...bidx);

  const mix = (hex, t) => col(s.back).lerp(col(hex), t);
  const top = (u) => new THREE.Vector3(0, B.rt(u) * 0.9, B.z(u)), bottom = (u) => new THREE.Vector3(0, -B.rb(u) * 0.9, B.z(u));
  // a fin along the back (up = 1) or the belly (up = -1) from u0 (back end) to u1 (front), heights h1 (front) → h0, `seg` panels
  const strip = ([u0, u1, h1, h0], up, hex, seg = 2, slant = 0.35) => {
    const pts = [], cols = [], tris = [];
    for (let i = 0; i <= seg; i++) {
      const u = u1 + (u0 - u1) * (i / seg), h = h1 + (h0 - h1) * (i / seg), b = up > 0 ? top(u) : bottom(u);
      pts.push(b, b.clone().add(new THREE.Vector3(0, up * h, -h * slant)));
      cols.push(mix(hex, 0.55), col(hex).multiplyScalar(0.85));
      if (i) tris.push([2 * i - 2, 2 * i, 2 * i - 1], [2 * i, 2 * i + 1, 2 * i - 1]);
    }
    out.flat(pts, cols, tris);
  };
  // the perch's spiny first dorsal: spines with the membrane notched between them
  const spiny = ([u0, u1, h1, h0], count, hex) => {
    const pts = [], cols = [], tris = [], tips = [];
    for (let i = 0; i <= count; i++) {
      const u = u1 + (u0 - u1) * (i / count), h = h1 + (h0 - h1) * (i / count), b = top(u);
      pts.push(b); cols.push(mix(hex, 0.5));
      pts.push(b.clone().add(new THREE.Vector3(0, h, -h * 0.25))); cols.push(col(hex).multiplyScalar(0.7)); tips.push(h);
    }
    for (let i = 0; i < count; i++) {
      const b0 = pts[2 * i], b1 = pts[2 * i + 2], m = b0.clone().lerp(b1, 0.5).add(new THREE.Vector3(0, (tips[i] + tips[i + 1]) * 0.27, 0));
      pts.push(m); cols.push(mix(hex, 0.8));
      const mi = pts.length - 1;
      tris.push([2 * i, 2 * i + 2, mi], [2 * i, mi, 2 * i + 1], [mi, 2 * i + 2, 2 * i + 3]);
    }
    out.flat(pts, cols, tris);
  };
  // the tail fin: forked (fork > 0: the notch's depth as a share of the fin) or rounded (fork < 0)
  {
    const A = new THREE.Vector3(0, B.rt(0) * 0.95, B.zt + 0.012), Bo = new THREE.Vector3(0, -B.rb(0) * 0.95, B.zt + 0.012);
    const tipZ = s.fork >= 0 ? -0.5 : -0.5 - s.tail * s.fork * 0.6;
    const U = new THREE.Vector3(0, s.spread, tipZ), D = new THREE.Vector3(0, -s.spread, tipZ), N = new THREE.Vector3(0, 0, s.fork >= 0 ? -0.5 + s.tail * s.fork : -0.5);
    const tc = col(fin.tail);
    out.flat([A, U, N, Bo, D], [mix(fin.tail, 0.5), tc.clone().multiplyScalar(0.8), tc, mix(fin.tail, 0.5), tc.clone().multiplyScalar(0.8)], [[0, 2, 1], [0, 3, 2], [3, 4, 2]]);
  }
  if (s.dorsal) s.spiny ? spiny(s.dorsal, s.spiny, fin.dorsal) : strip(s.dorsal, 1, fin.dorsal);
  if (s.dorsal2) strip(s.dorsal2, 1, fin.dorsal);
  if (s.adipose) strip(s.adipose, 1, fin.dorsal, 1, 0.6);
  if (s.anal) strip(s.anal, -1, fin.lower);
  if (s.long) { // the eel: one fin from the back round the tail to the belly
    const [ut, ub, h] = s.long;
    strip([0, ut, 0.004, h], 1, fin.dorsal, 6, 0.15);
    strip([0, ub, 0.004, h], -1, fin.lower, 4, 0.15);
  }
  // paired fins: a small fan on each side, its base on the skin, swept back (and out / down) so it shows from the side. The pectoral's base
  // runs round the body (a short oblique base behind the gill), the pelvic's along it (under the belly)
  const pair = ([u, size], a, dir, hex, along) => {
    for (const sx of [1, -1]) {
      const ang = sx > 0 ? a : Math.PI - a, du = size * 0.22 / B.len, da = 0.35 * sx;
      const pf = along ? B.at(u + du, ang, V()) : B.at(u, ang + da, V()), pb = along ? B.at(u - du, ang, V()) : B.at(u, ang - da, V());
      const d = new THREE.Vector3(dir[0] * sx, dir[1], dir[2]).normalize().multiplyScalar(size);
      pf.x *= 0.94; pb.x *= 0.94;
      out.flat([pf, pb, pb.clone().add(d), pf.clone().addScaledVector(d, 0.75)], [mix(hex, 0.6), mix(hex, 0.6), col(hex), col(hex)], [[0, 1, 2], [0, 2, 3]]);
    }
  };
  if (s.pec) pair(s.pec, -0.4, [0.3, -0.2, -1], fin.paired, false);
  if (s.pelvic) pair(s.pelvic, -1.35, [0.15, -0.7, -1], fin.paired, true);
  // a point on the skin at (u, angle a), lifted `lift` along its normal, and that normal
  const onSkin = (u, a, lift) => {
    const p = B.at(u, a, V()), du = B.at(u + 0.01, a, V()).sub(B.at(u - 0.01, a, V())), da = B.at(u, a + 0.05, V()).sub(B.at(u, a - 0.05, V()));
    const nn = new THREE.Vector3().crossVectors(da, du).normalize();
    if (nn.dot(new THREE.Vector3(p.x, p.y, 0)) < 0) nn.negate();
    return [p.addScaledVector(nn, lift), nn];
  };
  // a flat disc of `e` corners round p in the plane across normal nn (fan from the centre; points ordered to face outwards)
  const disc = (p, nn, rings, cols, e) => {
    const e1 = new THREE.Vector3(0, 0, 1).addScaledVector(nn, -nn.z).normalize(), e2 = new THREE.Vector3().crossVectors(nn, e1), pts = [p], tris = [];
    rings.forEach((r) => { for (let i = 0; i < e; i++) { const t = (i / e) * Math.PI * 2; pts.push(p.clone().addScaledVector(e1, Math.cos(t) * r).addScaledVector(e2, Math.sin(t) * r)); } });
    for (let i = 0; i < e; i++) tris.push([0, 1 + i, 1 + (i + 1) % e]);
    for (let i = 0; i < e && rings.length > 1; i++) { const a0 = 1 + i, a1 = 1 + (i + 1) % e; tris.push([a0, a0 + e, a1 + e], [a0, a1 + e, a1]); }
    out.flat(pts, cols(pts.length), tris);
  };
  // spots: small discs, scattered by a fixed hash (the same for every fish of the species), mirrored on both sides
  for (const [si, [hex, count, u0, u1, s0, s1, r]] of (s.spots ?? []).entries()) {
    const c0 = col(hex);
    for (let i = 0; i < count; i++) {
      const u = u0 + (u1 - u0) * (i + hash(i, si, 1) * 0.8) / count, a = Math.asin(s0 + (s1 - s0) * hash(i, si, 2));
      for (const sx of [1, -1]) { const [p, nn] = onSkin(u, sx > 0 ? a : Math.PI - a, 0.0015); disc(p, nn, [r * (0.8 + 0.4 * hash(i, si, 3))], (n) => Array(n).fill(c0), 4); }
    }
  }
  // the eyes: an iris ring round the pupil, set on the head's surface
  {
    const [u, r] = s.eye, iris = col(s.iris), pupil = col(C.pupil);
    for (const sx of [1, -1]) {
      const [p, nn] = onSkin(u, sx > 0 ? 0.4 : Math.PI - 0.4, 0.003);
      disc(p, nn, [r * 0.5, r], (n) => Array.from({ length: n }, (_, i) => (i <= 5 ? pupil : iris)), 5);
    }
  }
  g = out.geometry();
  g.userData.lum = lum / ln;
  g.userData.species = name;
  g.computeBoundingBox(); g.computeBoundingSphere();
  cache.set(name, g);
  return g;
}

// #2048 (part of #2042): the nose. One continuous head skin still carries it (no separate part, no new attribute, draw call,
// light or texture), but instead of one ridge with a painted spot at its tip it is a few parametric forms in head-local metres
// (before faceWarp), joined by a smooth maximum so creases appear where they meet:
//  - the dorsum: a bridge narrowing between the eyes (the radix), widening to the tip and narrowing again under it into the
//    columella, by a profile table [y, half width, projection];
//  - the tip: two soft domes on the dorsum, a rounded lobule;
//  - the alar wings: flat-topped lobes either side whose steep outer edge is the crease into the cheek (#2044's nasolabial fold
//    starts just outside it);
//  - the nostrils: dips in the underside between the columella and each wing, seen from below and three-quarter front.
// The head's vertex grid is far too coarse for this (columns 15 mm apart at the nose), so `refineNose` swaps the head ring
// surface's quads round the nose for a finer local grid and zips the two together (no T-junction, no crack). The height still
// lands in the vertex attribute `noseBlend` (height / maxProjection), so the Spider mask flattens it exactly and the rifle's nose
// regions keep their classification. The size / width sliders scale the height, the width and the length under smooth masks
// (noseVertexGLSL / noseSlideAt), so no slider end folds the skin; #2060 spreads the widening over the cheek and turns the normals
// with it (noseNormalGLSL), so no slider end leaves a shading edge beside the wings. Fragment shading adds only the ambient
// occlusion of the nostrils' hollows and the alar crease (noseFragmentGLSL); the tip's shadow is the form's. Numbers: config.js AVATAR_NOSE; the shape variants
// (#2049, AVATAR_NOSE_FORMS) offset this form per avatar in the vertex shader (noseFormOffset below).
import * as THREE from 'three';
import { AVATAR_NOSE as N, AVATAR_NOSE_FORMS as F, AVATAR_NOSE_WIDTH as NW, AVATAR_FACE as FACE, noseFormOf } from './config.js';
import { profileAt } from './avatarcontour.js';

const f = (v) => (+v).toFixed(6);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const bell = (t) => (Math.abs(t) < 1 ? (1 - t * t) ** 2 : 0);
/** Polynomial smooth maximum of two heights ≥ 0: max(a, b) with a fillet of width k where they meet, the fillet shrinking
 * with the lower one so it never lifts the face where both forms are 0. */
const smax = (a, b, k) => { const w = Math.min(k, 2 * Math.min(a, b)); if (w <= 0) return Math.max(a, b); const h = Math.max(w - Math.abs(a - b), 0) / w; return Math.max(a, b) + h * h * w / 4; };

/** A profile table [[y, half width, height], …] (top first) at y: [half width, height], the height 0 outside it. */
function tableAt(D, y) {
  if (y >= D[0][0] || y <= D.at(-1)[0]) return [D[0][1], 0];
  const [, w, p] = profileAt(D, y);
  return [w, Math.max(0, p)];
}
const ellipse = (x, y, [, cx, cy, rx, ry]) => Math.hypot((Math.abs(x) - cx) / rx, (y - cy) / ry);
/** The alar wing, a tapered capsule from its base out on the cheek (a) toward the tip (b): `r` the distance from its axis in
 * radii, `t` 0 at the base … 1 toward the tip, `up` 0 … 1 on its upper / outer side (the crease, not the rim underneath). */
function wing(x, y) {
  const [, ax, ay, bx, by, ra, rb] = N.ala, px = Math.abs(x), dx = bx - ax, dy = by - ay;
  const t = clamp01(((px - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)), cx = ax + t * dx, cy = ay + t * dy, rad = ra + (rb - ra) * t;
  return { r: Math.hypot(px - cx, y - cy) / rad, t, up: smooth(-0.2, 0.6, (px - cx + y - cy) / (rad * Math.SQRT2)) };
}

/** The nose's parts at head-local (x, y) before faceWarp: { h: height (m, + out of the face), nostril 0 … 1, crease 0 … 1 }. */
export function noseForms(x, y) {
  const [wb, pb] = tableAt(N.body, y), [wr, pr] = tableAt(N.ridge, y);
  const T = N.tip, A = N.ala, O = N.nostril;
  const body = pb * bell(x / wb) + pr * bell(x / wr) + T[0] * bell(ellipse(x, y, T));
  const W = wing(x, y), ala = W.r < 1 ? A[0] * (1 + (A[8] - 1) * W.t) * (1 - W.r ** A[7]) ** 2 : 0;
  const nostril = bell(ellipse(x, y, O));
  const crease = Math.exp(-(((W.r - N.crease[1]) / N.crease[2]) ** 2)) * W.up;
  const h = Math.max(0, smax(body, ala, N.blend) - O[0] * nostril - N.crease[0] * crease);
  return { h, nostril, crease };
}
export const noseHeight = (x, y) => noseForms(x, y).h;

/** Slider masks at head-local (x, y) (after faceWarp, as the vertex shader sees it): [width, length] weights 0 … 1, the width's
 * a share of x (#2060: AVATAR_NOSE_WIDTH's profile, spread out over the cheek; the length keeps #2048's mask). */
export function noseMask(x, y) {
  const M = N.mask, top = smooth(M.narrow[0], M.narrow[1], y), ax = Math.abs(x), mix = ([a, b]) => a + (b - a) * top;
  const reach = M.x[1] + (M.x[2] - M.x[1]) * top;
  const across = 1 - smooth(M.x[0], reach, ax);
  const vert = smooth(M.y[0], M.y[1], y) * (1 - smooth(M.y[2], M.y[3], y));
  const wide = (1 - smooth(mix(NW.from), mix(NW.reach), ax)) / (1 + (x / mix(NW.peak)) ** 2);
  return [wide * vert * (1 - smooth(M.widthTop[0], M.widthTop[1], y)), across * vert];
}

/** #2060: the size / width / length sliders' offset [dx, dy, dz] (m) of a bind point at head-local (x, y) (after faceWarp, the vertex
 * shader's frame) where the nose's height is `H` m, for uNose `s` [size · width, size, size]; the GLSL twin is noseSlideAt in
 * noseFormDecl (the suit's flattening apart). The widening follows the face's sideways curve back like the broad variant's
 * (#2049), so the cheek beside the wings is not lifted off the face; 0 for the middle sliders. */
export function noseSlideOffset(x, y, H, [sx, sy, sz]) {
  const [mw, ml] = noseMask(x, y), dx = (sx - 1) * x * mw;
  return [dx, (sy - 1) * N.mask.length * (y - N.mask.pivot) * ml, (sz - 1) * H - dx * x / F.faceRound];
}

/** #2048's own triangles: the fine grid and the zip round it, less the head quads they replace, for the head rings `rows`. */
export function noseTriangles(rows) {
  const G = N.grid, k = G.columns, inBlock = rows.filter((r) => r[0] <= G.top + 1e-9 && r[0] >= G.bottom - 1e-9).length;
  const nx = G.x.length * 2 - 1, ny = G.y.length;
  return (nx - 1) * (ny - 1) * 2 + (4 * k + 2 * (inBlock - 1)) + (2 * (nx - 1) + 2 * (ny - 1)) - (inBlock - 1) * 4 * k;
}

/** The head ring surface `g` (avatar.js ringSurface over `rows`, top first, columns concentrated to the front, before shaping)
 * gets a fine grid round the nose: the quads of the AVATAR_NOSE.grid block are removed, the grid (columns `x`, rows `y`, on the
 * same cubic ring profile) put in their place and its edge zipped to the block's edge with triangles between the two loops. */
export function refineNose(g, rows) {
  const G = N.grid, sides = g.userData.ringSides, stride = sides + 1, k = G.columns;
  const ringsIn = rows.map((r, i) => [r[0], i]).filter(([y]) => y <= G.top + 1e-9 && y >= G.bottom - 1e-9).map(([, i]) => i);
  const i0 = ringsIn[0], i1 = ringsIn.at(-1);
  const cols = [...Array.from({ length: k }, (_, m) => sides - k + m), 0, ...Array.from({ length: k }, (_, m) => m + 1)]; // left (x < 0) → right
  const quadCols = new Set([...Array.from({ length: k }, (_, m) => sides - k + m), ...Array.from({ length: k }, (_, m) => m)]);
  const old = g.index.array, ringTris = (g.userData.ringCount - 1) * sides * 2, index = [];
  for (let t = 0; t < old.length / 3; t++) {
    if (t < ringTris) {
      const q = t >> 1, i = Math.floor(q / sides), j = q % sides;
      if (i >= i0 && i < i1 && quadCols.has(j)) continue;
    }
    index.push(old[t * 3], old[t * 3 + 1], old[t * 3 + 2]);
  }
  const pos = Array.from(g.attributes.position.array), base = pos.length / 3;
  const xs = [...G.x.slice(1).map((v) => -v).reverse(), ...G.x], ys = G.y; // ys top first
  for (const y of ys) {
    const [, rx, rz, zc] = profileAt(rows, y);
    for (const x of xs) pos.push(x, y, zc + rz * Math.cos(Math.asin(Math.max(-1, Math.min(1, x / rx)))));
  }
  const at = (r, c) => base + r * xs.length + c, P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const tri = (a, b, c) => { // outward: the face normal along the triangle's direction from the head's axis
    const [A, B, C] = [P(a), P(b), P(c)], u = B.map((v, m) => v - A[m]), w = C.map((v, m) => v - A[m]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    index.push(...(n[0] * (A[0] + B[0] + C[0]) + n[2] * (A[2] + B[2] + C[2]) >= 0 ? [a, b, c] : [a, c, b]));
  };
  for (let r = 0; r < ys.length - 1; r++) for (let c = 0; c < xs.length - 1; c++) {
    tri(at(r, c), at(r + 1, c), at(r, c + 1)); tri(at(r, c + 1), at(r + 1, c), at(r + 1, c + 1));
  }
  // both loops clockwise from the top-left corner: top row, right side down, bottom row back, left side up
  const R = ys.length - 1, C = xs.length - 1, inner = [], outer = [];
  for (let c = 0; c < C; c++) inner.push(at(0, c));
  for (let r = 0; r < R; r++) inner.push(at(r, C));
  for (let c = C; c > 0; c--) inner.push(at(R, c));
  for (let r = R; r > 0; r--) inner.push(at(r, 0));
  const v = (i, j) => i * stride + j;
  for (let m = 0; m < cols.length - 1; m++) outer.push(v(i0, cols[m]));
  for (let i = i0; i < i1; i++) outer.push(v(i, cols.at(-1)));
  for (let m = cols.length - 1; m > 0; m--) outer.push(v(i1, cols[m]));
  for (let i = i1; i > i0; i--) outer.push(v(i, cols[0]));
  const d2 = (a, b) => { const A = P(a), B = P(b); return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2; };
  let a = 0, b = 0;
  while (a < outer.length || b < inner.length) {
    const o0 = outer[a % outer.length], o1 = outer[(a + 1) % outer.length], n0 = inner[b % inner.length], n1 = inner[(b + 1) % inner.length];
    if (b >= inner.length || (a < outer.length && d2(o1, n0) <= d2(o0, n1))) { tri(o0, o1, n0); a++; } else { tri(o0, n1, n0); b++; }
  }
  g.deleteAttribute('normal');
  g.setAttribute('position', new g.attributes.position.constructor(new Float32Array(pos), 3));
  g.setIndex(index);
  g.userData.noseTriangles = index.length / 3 - old.length / 3; // #2048's own triangle delta (avatarheadtest)
  return g;
}

// --- #2049: shape variants ---------------------------------------------------------------------------------------------
// Straight (the default, #2048's form unchanged), convex (a hump on the dorsum, the tip drooping), upturned (the tip lifted, a
// scooped dorsum) and broad (a lower, flatter bridge, the whole nose wider). Each is a smooth offset of the bind position in
// the vertex shader, zero at the edge of AVATAR_NOSE_FORMS.box, weighted by the per-avatar uniform uNoseForm, so the shared
// geometry, the look's sliders (the size scales the offset; the width slider's own widening adds to it), the Spider mask (no offset) and the nostrils' shading
// (it follows the bind position) all stay as they are. Offsets that move with the tip scale with noseBlend, the nose's own
// height, so they fade to nothing where it meets the face. The normals follow by the offset's Jacobian (finite differences).

/** The variant weights [convex, upturned, broad] of a look (0, 0, 0 straight). */
export function noseFormWeights(look) { const k = noseFormOf(look); return [k === 1 ? 1 : 0, k === 2 ? 1 : 0, k === 3 ? 1 : 0]; }

/** The variants' offset [dx, dy, dz] (m) of a bind point at head-local (x, y) after faceWarp (the vertex shader's frame) where
 * the nose's height is `H` m (noseBlend · maxProjection), for the weights `w` [convex, upturned, broad]; the GLSL twin is
 * noseFormAt in noseFormDecl. Before the sliders' scale. */
export function noseFormOffset(x, y, H, [a, u, b]) {
  const [bx, y0, y1] = F.box;
  if (Math.abs(x) >= bx || y <= y0 || y >= y1) return [0, 0, 0];
  const [hh, hy, hs, hw] = F.hump, [sd, sy, ss, sw] = F.upturn.scoop, B = F.broad;
  const r = H / N.maxProjection, low = 1 - smooth(F.low[0], F.low[1], y), up = smooth(B.split[0], B.split[1], y);
  const reach = B.x[1] + (B.x[2] - B.x[1]) * smooth(B.narrow[0], B.narrow[1], y);
  const across = (1 - smooth(B.x[0], reach, Math.abs(x))) * smooth(B.bottom[0], B.bottom[1], y) * (1 - smooth(B.top[0], B.top[1], y));
  const dx = b * B.widen * x * across; // (the widening follows the face's sideways curve back, so the cheek is not lifted)
  return [
    dx,
    (u * F.upturn.lift - a * F.droop) * r * low,
    -dx * x / F.faceRound + a * hh * bell((y - hy) / hs) * bell(x / hw) - u * sd * bell((y - sy) / ss) * bell(x / sw) - b * H * (B.flat[0] * up + B.flat[1] * (1 - up)),
  ];
}

/** Uniforms for the avatar material: the variant's weights. */
export const noseUniforms = () => ({ uNoseForm: { value: new THREE.Vector3() } });
/** Sets the material's variant from a look (missing / old codes: straight). */
export function applyNoseLook(u, lk) { if (u.uNoseForm) u.uNoseForm.value.set(...noseFormWeights(lk)); }

/** Vertex declarations (global scope): the uniform and noseFormAt, noseFormAt's JS twin noseFormOffset. */
export function noseFormDecl() {
  const M = N.mask, [bx, y0, y1] = F.box, [hh, hy, hs, hw] = F.hump, [sd, sy, ss, sw] = F.upturn.scoop, B = F.broad;
  return `
uniform vec3 uNoseForm; // #2049: the nose's shape variant [convex, upturned, broad] (src/avatarnose.js)
// #2060: the sliders' offset (uNose = size · width, size, size) at the bind point p where the nose is H high, noseSlideOffset's twin
vec3 noseSlideAt(vec2 p, float H) {
  vec2 d = vec2(0.0);
  if (p.y > ${f(M.y[0])} && p.y < ${f(M.y[3])} && abs(p.x) < ${f(Math.max(M.x[1], M.x[2], ...NW.reach))}) {
    float top = ${step(M.narrow[0], M.narrow[1], 'p.y')}, ax = abs(p.x), wp = p.x / mix(${f(NW.peak[0])}, ${f(NW.peak[1])}, top);
    float vert = ${step(M.y[0], M.y[1], 'p.y')} * (1.0 - ${step(M.y[2], M.y[3], 'p.y')});
    float across = (1.0 - smoothstep(${f(M.x[0])}, mix(${f(M.x[1])}, ${f(M.x[2])}, top), ax)) * vert;
    float wide = (1.0 - smoothstep(mix(${f(NW.from[0])}, ${f(NW.from[1])}, top), mix(${f(NW.reach[0])}, ${f(NW.reach[1])}, top), ax)) / (1.0 + wp * wp) * vert * (1.0 - ${step(M.widthTop[0], M.widthTop[1], 'p.y')});
    d = vec2((uNose.x - 1.0) * p.x * wide, (uNose.y - 1.0) * ${f(M.length)} * (p.y - ${f(M.pivot)}) * across);
  }
  return vec3(d, (uNose.z - 1.0) * H - d.x * p.x / ${f(F.faceRound)});
}
float nfBell(float t) { return abs(t) < 1.0 ? (1.0 - t * t) * (1.0 - t * t) : 0.0; }
vec3 noseFormAt(vec2 p, float H) {
  if (abs(p.x) >= ${f(bx)} || p.y <= ${f(y0)} || p.y >= ${f(y1)}) return vec3(0.0);
  float r = H / ${f(N.maxProjection)}, low = 1.0 - ${step(F.low[0], F.low[1], 'p.y')}, up = ${step(B.split[0], B.split[1], 'p.y')};
  float reach = mix(${f(B.x[1])}, ${f(B.x[2])}, ${step(B.narrow[0], B.narrow[1], 'p.y')});
  float across = (1.0 - smoothstep(${f(B.x[0])}, reach, abs(p.x))) * ${step(B.bottom[0], B.bottom[1], 'p.y')} * (1.0 - ${step(B.top[0], B.top[1], 'p.y')});
  float dx = uNoseForm.z * ${f(B.widen)} * p.x * across; // (along the face's sideways curve)
  return vec3(dx,
    (uNoseForm.y * ${f(F.upturn.lift)} - uNoseForm.x * ${f(F.droop)}) * r * low,
    -dx * p.x / ${f(F.faceRound)} + uNoseForm.x * ${f(hh)} * nfBell((p.y - ${f(hy)}) / ${f(hs)}) * nfBell(p.x / ${f(hw)}) - uNoseForm.y * ${f(sd)} * nfBell((p.y - ${f(sy)}) / ${f(ss)}) * nfBell(p.x / ${f(sw)})
      - uNoseForm.z * H * mix(${f(B.flat[1])}, ${f(B.flat[0])}, up));
}`;
}

/** After beginnormal_vertex: the bind normal turned by the sliders' offset (#2060) and the variant's (#2049), both as the vertex
 * moves (none in the suit, nothing at the middle sliders of the straight nose). The offset's slope comes from finite differences;
 * where it scales with the nose's height, that height's slope is the surface's (from the normal) less the face's own sideways
 * curve, faded in over the nose's first `F.slopeFade` m so the estimate cannot step at the nose's edge. Twin: noseNormalTurn. */
export function noseNormalGLSL(hb, head = 1) {
  const M = N.mask, bx = Math.max(F.box[0], M.x[1], M.x[2], ...NW.reach), y0 = Math.min(F.box[1], M.y[0]), y1 = Math.max(F.box[2], M.y[3]);
  return `if (abs(facePart - ${f(head)}) < 0.5 && (uNoseForm != vec3(0.0) || uNose != vec3(1.0)) && uSuit < 0.5) { // #2049/#2060: the nose's normal
    vec3 nq = position - vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)});
    if (nq.z > 0.0 && abs(nq.x) < ${f(bx)} && nq.y > ${f(y0)} && nq.y < ${f(y1)}) {
      float H = noseBlend * ${f(N.maxProjection)}, e = ${f(F.fd)}, nz = max(objectNormal.z, 0.25);
      vec2 g = vec2(-objectNormal.x / nz + nq.x / ${f(F.faceRound)}, -objectNormal.y / nz) * smoothstep(0.0, ${f(F.slopeFade)}, H);
      vec3 d0 = noseSlideAt(nq.xy, H) + noseFormAt(nq.xy, H) * uNose.y;
      vec2 px = nq.xy + vec2(e, 0.0), py = nq.xy + vec2(0.0, e); float hx = max(0.0, H + g.x * e), hy = max(0.0, H + g.y * e);
      vec3 c0 = vec3(1.0, 0.0, 0.0) + (noseSlideAt(px, hx) + noseFormAt(px, hx) * uNose.y - d0) / e;
      vec3 c1 = vec3(0.0, 1.0, 0.0) + (noseSlideAt(py, hy) + noseFormAt(py, hy) * uNose.y - d0) / e;
      objectNormal = normalize(mat3(cross(c1, vec3(0.0, 0.0, 1.0)), cross(vec3(0.0, 0.0, 1.0), c0), cross(c0, c1)) * objectNormal);
    }
  }`;
}

/** noseNormalGLSL's JS twin (tests): the bind normal `n` at head-local (x, y) with height `H` turned for uNose `s` and the variant
 * weights `w`. `fade` overrides F.slopeFade (0: none). */
export function noseNormalTurn(x, y, H, n, s, w, fade = F.slopeFade) {
  const e = F.fd, nz = Math.max(n[2], 0.25), k = fade > 0 ? smooth(0, fade, H) : 1;
  const g = [(-n[0] / nz + x / F.faceRound) * k, -n[1] / nz * k];
  const D = (px, py, h) => { const a = noseSlideOffset(px, py, h, s), b = noseFormOffset(px, py, h, w); return a.map((v, m) => v + b[m] * s[1]); };
  const d0 = D(x, y, H), dx = D(x + e, y, Math.max(0, H + g[0] * e)), dy = D(x, y + e, Math.max(0, H + g[1] * e));
  const c0 = [1, 0, 0].map((v, m) => v + (dx[m] - d0[m]) / e), c1 = [0, 1, 0].map((v, m) => v + (dy[m] - d0[m]) / e);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], z = [0, 0, 1];
  const m0 = cross(c1, z), m1 = cross(z, c0), m2 = cross(c0, c1); // the columns
  const o = [0, 1, 2].map((r) => m0[r] * n[0] + m1[r] * n[1] + m2[r] * n[2]), l = Math.hypot(...o);
  return o.map((v) => v / l);
}

// --- GLSL -------------------------------------------------------------------------------------------------------------
const step = (e0, e1, x) => `smoothstep(${f(e0)}, ${f(e1)}, ${x})`;

/** The vertex shader's nose: replaces the old nasal-pivot scaling in avatar.js faceShape. `transformed` is the bind position;
 * `hb` the head bone's bind position. Sliders (uNose = size·width, size, size) scale the width under the width mask, the
 * length about `pivot` under the length mask, the projection exactly (noseBlend is the height); the suit removes it. */
export function noseVertexGLSL(hb) {
  return `{ // #2048: the nose's sliders and the Spider mask (src/avatarnose.js)
        vec3 nq = transformed - vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)});
        if (nq.z > 0.0) transformed += (1.0 - uSuit) * noseSlideAt(nq.xy, 0.0); // width and length (#2060: the widening along the face's curve)
        transformed.z += ((1.0 - uSuit) * (uNose.z - 1.0) - uSuit) * noseBlend * ${f(N.maxProjection)};
        if (uNoseForm != vec3(0.0) && nq.z > 0.0) transformed += (1.0 - uSuit) * uNose.y * noseFormAt(nq.xy, noseBlend * ${f(N.maxProjection)}); // #2049: the shape variant
      }`;
}

/** Fragment pieces: `decl` (a varying from the vertex shader is not needed: the bind position vSuitAt carries the place), `color`
 * (inside the bare head skin branch: the nostrils' hollow darker), `light` (less ambient light in the nostrils and the crease). */
export function noseFragmentGLSL(hb, head = 1) {
  const [, ax, ay, bx, by, ra, rb] = N.ala, O = N.nostril, [, cr, cw] = N.crease, W = FACE.warp, S = N.shade;
  const decl = `
varying float vNose; // #2048: noseBlend, the nose's own height (avatar.js begin_vertex)
// #2048 the nose's hollows (src/avatarnose.js): x 0 … 1 in the nostrils, y in the alar crease
vec2 noseCavity(vec3 at) {
  vec3 nq = at - vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)});
  if (nq.z < 0.0 || nq.y < ${f(Math.min(O[2] - O[4], by - rb, ay - ra) - 0.003)} || nq.y > ${f(Math.max(ay + ra, by + rb) + 0.004)} || abs(nq.x) > ${f(ax + ra + 0.004)}) return vec2(0.0);
  nq.x /= ${f(W.width)} * (1.0 - ${f(W.narrow)} * (1.0 - smoothstep(${f(W.y[1])}, ${f(W.y[0])}, nq.y)) * smoothstep(${f(W.z[0])}, ${f(W.z[1])}, nq.z));
  vec2 p = vec2(abs(nq.x), nq.y), a = vec2(${f(ax)}, ${f(ay)}), ab = vec2(${f(bx - ax)}, ${f(by - ay)});
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0), rad = mix(${f(ra)}, ${f(rb)}, t); vec2 d = p - a - ab * t;
  float r = length(d) / rad, up = smoothstep(-0.2, 0.6, (d.x + d.y) / (rad * 1.414214));
  float rn = length(vec2((p.x - ${f(O[1])}) / ${f(O[3])}, (p.y - ${f(O[2])}) / ${f(O[4])}));
  float nostril = rn < 1.0 ? (1.0 - rn * rn) * (1.0 - rn * rn) : 0.0;
  return vec2(nostril, exp(-pow((r - ${f(cr)}) / ${f(cw)}, 2.0)) * up);
}`;
  const color = `{ vec2 nc = noseCavity(vSuitAt); tone *= 1.0 - ${f(S.nostril)} * pow(nc.x, ${f(S.nostrilPower)}); } // #2048: the nostrils' hollow`;
  const light = `if (vBare > 0.5 && uSuit < 0.5 && floor(vSuitRole + 0.5) == 2.0 && abs(vSurface.y - ${f(head)}) < 0.5) { vec2 nc = noseCavity(vSuitAt); reflectedLight.indirectDiffuse *= 1.0 - ${f(S.ambient[0])} * nc.x - ${f(S.ambient[1])} * nc.y; } // #2048`;
  return { decl, color, light };
}
/** The nose's own skin (0 … 1, from its height), for avatarskin.js' nose shine, flush and light through thin skin. */
export const NOSE_SKIN = `smoothstep(${f(N.skin[0])}, ${f(N.skin[1])}, vNose)`;
/** The program cache key's suffix. */
export const noseKey = () => '-nose2049';

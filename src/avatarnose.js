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
// (noseVertexGLSL), so no slider end folds the skin. Fragment shading adds only the ambient occlusion of the nostrils' hollows
// and the alar crease (noseFragmentGLSL); the tip's shadow is the form's. Numbers: config.js AVATAR_NOSE; a later shape
// variant (#2049) scales `dorsum`, `tip`, `ala` and `nostril`.
import { AVATAR_NOSE as N, AVATAR_FACE as FACE } from './config.js';
import { profileAt } from './avatarcontour.js';

const f = (v) => (+v).toFixed(6);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const bell = (t) => (Math.abs(t) < 1 ? (1 - t * t) ** 2 : 0);
/** Polynomial smooth maximum: max(a, b) with a fillet of width k (a crease where two forms meet). */
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k / 4; };

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

/** Slider masks at head-local (x, y) (after faceWarp, as the vertex shader sees it): [width, length] weights 0 … 1. */
export function noseMask(x, y) {
  const M = N.mask, top = smooth(M.narrow[0], M.narrow[1], y);
  const reach = M.x[1] + (M.x[2] - M.x[1]) * top;
  const across = 1 - smooth(M.x[0], reach, Math.abs(x));
  const vert = smooth(M.y[0], M.y[1], y) * (1 - smooth(M.y[2], M.y[3], y));
  return [across * vert * (1 - smooth(M.widthTop[0], M.widthTop[1], y)), across * vert];
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

// --- GLSL -------------------------------------------------------------------------------------------------------------
const step = (e0, e1, x) => `smoothstep(${f(e0)}, ${f(e1)}, ${x})`;

/** The vertex shader's nose: replaces the old nasal-pivot scaling in avatar.js faceShape. `transformed` is the bind position;
 * `hb` the head bone's bind position. Sliders (uNose = size·width, size, size) scale the width under the width mask, the
 * length about `pivot` under the length mask, the projection exactly (noseBlend is the height); the suit removes it. */
export function noseVertexGLSL(hb) {
  const M = N.mask, [x0, xw, xn] = M.x;
  return `{ // #2048: the nose's sliders and the Spider mask (src/avatarnose.js)
        vec3 nq = transformed - vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)});
        if (nq.z > 0.0 && nq.y > ${f(M.y[0])} && nq.y < ${f(M.y[3])} && abs(nq.x) < ${f(Math.max(xw, xn))}) {
          float reach = mix(${f(xw)}, ${f(xn)}, ${step(M.narrow[0], M.narrow[1], 'nq.y')});
          float across = (1.0 - smoothstep(${f(x0)}, reach, abs(nq.x))) * ${step(M.y[0], M.y[1], 'nq.y')} * (1.0 - ${step(M.y[2], M.y[3], 'nq.y')});
          float keep = 1.0 - uSuit;
          transformed.x += keep * (uNose.x - 1.0) * nq.x * across * (1.0 - ${step(M.widthTop[0], M.widthTop[1], 'nq.y')});
          transformed.y += keep * (uNose.y - 1.0) * ${f(M.length)} * (nq.y - ${f(M.pivot)}) * across;
        }
        transformed.z += ((1.0 - uSuit) * (uNose.z - 1.0) - uSuit) * noseBlend * ${f(N.maxProjection)};
      }`;
}

/** Fragment pieces: `decl` (a varying from the vertex shader is not needed: the bind position vSuitAt carries the place), `color`
 * (inside the bare head skin branch: the nostrils' hollow darker), `light` (less ambient light in the nostrils and the crease). */
export function noseFragmentGLSL(hb, head = 1) {
  const [, ax, ay, bx, by, ra, rb] = N.ala, O = N.nostril, [, cr, cw] = N.crease, W = FACE.warp, S = N.shade;
  const decl = `
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
/** The program cache key's suffix. */
export const noseKey = () => '-nose2048';

// #2142: the face's base form follows the figure's gender. One bounded offset field in the head bone's frame (after the face
// sliders' warp), evaluated per vertex in the avatar shader (`genderFaceGLSL`) from the same numbers as the JS helper
// `genderFaceOffset` (tested): brow ridge, brow height, jaw angle, chin width, cheek fullness, lip fullness.
// Symmetric in x, zero at the eyes (AVATAR_FACE_GENDER.keep) and on the lip seam. The CPU hit surfaces keep the bind pose.
import { AVATAR_FACE_GENDER as G, AVATAR_FACE as FACE } from './config.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bell = (x, c, h) => Math.exp(-(((x - c) / h) ** 2));
const mix = (pair, g) => pair[0] + (pair[1] - pair[0]) * g;

/** Which vertices the field moves: 'head' (skin), 'lip' (lip and skin bridge parts) or 'brow' (brow hairs). */
export const GENDER_PARTS = ['head', 'lip', 'brow'];

/** The offset [dx, dy, dz] (m) at head-frame (x, y, z) for `g` (0 male … 1 female; clamped) on a vertex of `part`. */
export function genderFaceOffset(x, y, z, g, part = 'head') {
  g = Math.min(1, Math.max(0, Number(g) || 0));
  const ax = Math.abs(x), sx = Math.sign(x), front = smooth(0.04, 0.09, z);
  const eye = smooth(G.keep.r[0], G.keep.r[1], Math.hypot(ax - G.keep.at[0], y - G.keep.at[1]));
  let dx = 0, dy = 0, dz = 0;
  if (part === 'brow') dy += mix(G.browY, g);
  // the field is evaluated at the vertex before the brow's own lift, so hairs and skin under them move alike
  const R = G.ridge, J = G.jaw, C = G.chin, K = G.cheek;
  dz += mix(R.z, g) * bell(y, R.y, R.h) * (1 - smooth(R.w * 0.6, R.w, ax)) * front * eye;
  dx += sx * mix(J.x, g) * bell(y, J.y, J.h) * bell(z, J.z[0], J.z[1]) * smooth(0.03, 0.05, ax);
  dx += x * mix(C.x, g) * bell(y, C.y, C.h);
  dz += mix(K.z, g) * bell(Math.hypot(ax - K.at[0], y - K.at[1]), 0, K.r) * front * eye;
  if (part === 'lip') {
    const L = G.lip, M = FACE.mouth, u = x / M.halfWidth, seam = M.seamY + 0.0012 * u * u, d = Math.abs(y - seam);
    const w = smooth(L.band[0], L.band[1], d) * (1 - smooth(L.band[2], L.band[3], d)) * (1 - smooth(L.x[0], L.x[1], ax));
    dz += mix(L.z, g) * w; dy += Math.sign(y - seam) * mix(L.y, g) * w;
  }
  return [dx, dy, dz];
}

/** GLSL: `vec3 genderFaceDelta(vec3 q, float kind, float g)` (kind 0 head, 1 lip, 2 brow), the same field as genderFaceOffset. */
export function genderFaceGLSL() {
  const f = (v) => v.toFixed(5), p = (pair) => `mix(${f(pair[0])}, ${f(pair[1])}, g)`;
  const R = G.ridge, J = G.jaw, C = G.chin, K = G.cheek, L = G.lip, M = FACE.mouth;
  return `float gsq(float x) { return x * x; }
vec3 genderFaceDelta(vec3 q, float kind, float g) {
  float ax = abs(q.x), sx = sign(q.x), front = smoothstep(0.04, 0.09, q.z);
  float eye = smoothstep(${f(G.keep.r[0])}, ${f(G.keep.r[1])}, length(vec2(ax - ${f(G.keep.at[0])}, q.y - ${f(G.keep.at[1])})));
  vec3 d = vec3(0.0);
  if (kind > 1.5) d.y += ${p(G.browY)};
  d.z += ${p(R.z)} * exp(-gsq((q.y - ${f(R.y)}) / ${f(R.h)})) * (1.0 - smoothstep(${f(R.w * 0.6)}, ${f(R.w)}, ax)) * front * eye;
  d.x += sx * ${p(J.x)} * exp(-gsq((q.y - ${f(J.y)}) / ${f(J.h)})) * exp(-gsq((q.z - ${f(J.z[0])}) / ${f(J.z[1])})) * smoothstep(0.03, 0.05, ax);
  d.x += q.x * ${p(C.x)} * exp(-gsq((q.y - ${f(C.y)}) / ${f(C.h)}));
  d.z += ${p(K.z)} * exp(-gsq(length(vec2(ax - ${f(K.at[0])}, q.y - ${f(K.at[1])})) / ${f(K.r)})) * front * eye;
  if (kind > 0.5 && kind < 1.5) {
    float u = q.x / ${f(M.halfWidth)}, seam = ${f(M.seamY)} + 0.0012 * u * u, dd = abs(q.y - seam);
    float w = smoothstep(${f(L.band[0])}, ${f(L.band[1])}, dd) * (1.0 - smoothstep(${f(L.band[2])}, ${f(L.band[3])}, dd)) * (1.0 - smoothstep(${f(L.x[0])}, ${f(L.x[1])}, ax));
    d.z += ${p(L.z)} * w; d.y += sign(q.y - seam) * ${p(L.y)} * w;
  }
  return d;
}`;
}

// #2061 (part of #2042): the full beard's sideburn runs up into the scalp's hairline instead of stopping short of it.
//  - the visible hairline (#2050, avatarhairline.js hairlineAt round AVATAR_HAIR.centre) is mapped into the beard's own angles (round
//    AVATAR_BEARD.centre, the face warp undone) at a typical skin radius and sampled into a small table (`sideburnLine`). The mapping is
//    insensitive to the radius (the two centres are 2.5 cm apart: a millimetre of radius moves the line ≈ 0.2°).
//  - behind AVATAR_SIDEBURN.from the beard's top follows that line `over` degrees above it, less where the line is steep (`sideburnTop`),
//    so its fading top lies under the hair's own soft edge: where the hair thins towards the skin the beard shows through, and where the
//    beard thins the hair covers.
//  - towards the line the beard thins to `flat` of its thickness (`sideburnThick`), so it lies under the hair shell (lifted at least
//    1.5 mm) rather than on it.
// Numbers: config.js AVATAR_SIDEBURN. Pure helpers (headless-testable) plus GLSL that avatarbeard.js splices into its own.
import { AVATAR_SIDEBURN as S, AVATAR_BEARD as B, AVATAR_HAIR as HAIR, AVATAR_FACE as FACE } from './config.js';
import { hairlineAt } from './avatarhairline.js';

const DEG = Math.PI / 180, f = (v) => (+v).toFixed(6);
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const W = FACE.warp, warp = (y, z) => W.width * (1 - W.narrow * smooth(W.y[0], W.y[1], y) * smooth(W.z[0], W.z[1], z));

/** The visible hairline in the beard's angles: [beard azimuth, beard elevation] (degrees) along hair azimuths `A0` … `A1`. */
export function hairlineInBeard(A0 = S.span[0] - 15, A1 = S.span[1] + 20, dA = 0.25) {
  const h = HAIR.centre, c = B.centre, out = [];
  for (let A = A0; A <= A1 + 1e-9; A += dA) {
    const E = hairlineAt(A), x = h[0] + S.r * Math.sin(A * DEG) * Math.cos(E * DEG), y = h[1] + S.r * Math.sin(E * DEG), z = h[2] + S.r * Math.cos(A * DEG) * Math.cos(E * DEG);
    const dx = x / warp(y, z) - c[0], dy = y - c[1], dz = z - c[2];
    out.push([Math.atan2(dx, dz) / DEG, Math.atan2(dy, Math.hypot(dx, dz)) / DEG]);
  }
  return out;
}
/** The table: the beard's sideburn top (degrees of beard elevation) every `step` degrees of beard azimuth over `span`: the line plus
 * `over` shortened where the line is steep (`over` / √(1 + slope²), about `over` across the line: no spike of beard into the sparse
 * hair along the sideburn's steep front). */
export const SIDEBURN_TABLE = (() => {
  const pts = hairlineInBeard(), at = (a) => {
    let k = pts.findIndex((p) => p[0] >= a);
    if (k < 1) k = k < 0 ? pts.length - 1 : 1;
    const [a0, e0] = pts[k - 1], [a1, e1] = pts[k];
    return e0 + ((e1 - e0) * Math.min(1, Math.max(0, (a - a0) / (a1 - a0 || 1))));
  };
  const out = [];
  for (let a = S.span[0]; a <= S.span[1] + 1e-9; a += S.step) { const s = (at(a + 1) - at(a - 1)) / 2; out.push(at(a) + S.over / Math.sqrt(1 + s * s)); }
  return out;
})();
/** The sideburn's top (degrees of beard elevation) at beard azimuth `a` (either side): `over` above the hairline (less where it is steep). */
export function sideburnLine(a) {
  const t = Math.min(SIDEBURN_TABLE.length - 1.0001, Math.max(0, (Math.abs(a) - S.span[0]) / S.step)), i = Math.floor(t);
  return SIDEBURN_TABLE[i] + (SIDEBURN_TABLE[i + 1] - SIDEBURN_TABLE[i]) * (t - i);
}
/** The beard's top (degrees) at azimuth `a` given its cheek-line `top` there: behind `from` it reaches the sideburn's top. */
export function sideburnTop(a, top) {
  const w = smooth(S.from[0], S.from[1], Math.abs(a));
  return top + w * Math.max(0, sideburnLine(a) - top);
}
/** The share (≤ 1) of the beard's thickness at (a, e): behind `from` it thins towards the hairline, under the hair shell. */
export function sideburnThick(a, e) {
  const w = smooth(S.from[0], S.from[1], Math.abs(a));
  return 1 - w * (1 - S.flat[1]) * (1 - smooth(0, S.flat[0], sideburnLine(a) - S.over - e));
}
/** The back edge's feather (degrees) at elevation `e`: `back` in front of the ear, the jaw's `edge.back` below it; and the shift (degrees,
 * ≤ 0) that keeps the edge's wobble inside the grid there (the narrower feather would otherwise end in a faint cut at the grid's edge). */
export const sideburnBack = (e) => S.back + (B.edge.back - S.back) * smooth(-4, -16, e);
export const sideburnBackShift = (e) => -B.edge.wobble[0] * 1.5 * (1 - smooth(-4, -16, e));

/** GLSL (global scope, after bdS): sbTop(a, top), sbBack(e) and sbBackShift(e), mirroring sideburnTop / sideburnBack(Shift). */
export function sideburnGLSL() {
  const n = SIDEBURN_TABLE.length;
  return `// #2061 the sideburn up into the hairline (src/avatarsideburn.js)
const float SB_E[${n}] = float[${n}](${SIDEBURN_TABLE.map(f).join(', ')});
float sbTop(float a, float top) {
  float t = clamp((abs(a) - ${f(S.span[0])}) / ${f(S.step)}, 0.0, ${f(n - 1.0001)}); int i = int(t);
  return top + smoothstep(${f(S.from[0])}, ${f(S.from[1])}, abs(a)) * max(0.0, mix(SB_E[i], SB_E[i + 1], t - float(i)) - top);
}
float sbBack(float e) { return ${f(S.back)} + ${f(B.edge.back - S.back)} * bdS(-4.0, -16.0, e); }
float sbBackShift(float e) { return ${f(-B.edge.wobble[0] * 1.5)} * (1.0 - bdS(-4.0, -16.0, e)); }`;
}

import { HEDGE_CLUMP as C } from './config.js';

// #2094: leaf clumps on the clipped hedges (hedgeform.js `hedgeMaterial`): a 2D Worley field over the hedge's unwrapped
// leaf UV, so the clipped face reads as packed rounded clumps with dark crevices between them. Fragment-only: no new
// draws, geometry, textures or per-frame work. The JS mirror below defines the same field for the node test and gives
// the mean tone the shader normalises by (and fades to with distance), so far hedges keep their old brightness.

const fract = (x) => x - Math.floor(x);
/** Hoskins-style hash (no sin, stable across GPUs): cell → two values in 0..1. */
export function clumpHash(ix, iy) {
  let a = fract(ix * .1031), b = fract(iy * .1030), c = fract(ix * .0973);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return [fract((a + a) * c), fract((a + b) * b)];
}
/** Nearest and second-nearest clump centre distances (cell units) at (u, v). */
export function clumpField(u, v) {
  const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv, off = (1 - C.jitter) / 2;
  let d1 = 8, d2 = 8;
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const [hx, hy] = clumpHash(iu + x, iv + y), rx = x + hx * C.jitter + off - fu, ry = y + hy * C.jitter + off - fv, d = rx * rx + ry * ry;
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return [Math.sqrt(d1), Math.sqrt(d2)];
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Height (0 crevice … 1 clump crown) and raw tone at (u, v); low: 1 at the foot → 0, up: the face's normal y. */
export function clumpShade(u, v, low = 0, up = 0) {
  const [f1, f2] = clumpField(u, v), ridge = smooth(0, C.edge, f2 - f1), dome = 1 - Math.min(1, f1);
  const h = ridge * (.55 + .45 * dome);
  const dark = C.creviceDark * (1 + (C.lowDark - 1) * low);
  const k = (dark + (1 - dark) * ridge) * (1 + C.dome * (dome - .5)) * (1 + C.top * smooth(.4, .9, up) * ridge);
  return { h, k, ridge };
}
/** Mean raw tone of a side face away from the foot (deterministic grid over 16 × 16 cells). */
export const CLUMP_MEAN = (() => { let s = 0, n = 0; for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { s += clumpShade((x + .5) / 8, (y + .5) / 8).k; n++; } return s / n; })();

const f = (x) => (+x).toFixed(4);
/** GLSL: functions (before main) and the colour block; `hcScale` (UV → clump cells) is a per-material uniform. */
export const CLUMP_PARS = `
uniform float hcScale;
varying float vHedgeUp;
vec2 hcHash(vec2 i) {
  vec3 p = fract(vec3(i.x, i.y, i.x) * vec3(.1031, .1030, .0973));
  float d = p.x * (p.y + 33.33) + p.y * (p.z + 33.33) + p.z * (p.x + 33.33);
  p += d;
  return fract(vec2((p.x + p.x) * p.z, (p.x + p.y) * p.y));
}
vec2 hcField(vec2 q) {
  vec2 i = floor(q), fq = q - i; float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), r = g + hcHash(i + g) * ${f(C.jitter)} + ${f((1 - C.jitter) / 2)} - fq;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(vec2(d1, d2));
}`;
export const CLUMP_COLOR = `
float hcH = 0.0, hcAmp = 0.0;
#ifdef USE_MAP
{
  vec2 q = vMapUv * hcScale, w = hcField(q), fw = fwidth(q);
  float ridge = smoothstep(0.0, ${f(C.edge)}, w.y - w.x), dome = 1.0 - min(1.0, w.x);
  hcH = ridge * (0.55 + 0.45 * dome);
  float dark = ${f(C.creviceDark)} * (1.0 + ${f(C.lowDark - 1)} * vHedgeLow);
  float k = (dark + (1.0 - dark) * ridge) * (1.0 + ${f(C.dome)} * (dome - 0.5)) * (1.0 + ${f(C.top)} * smoothstep(0.4, 0.9, vHedgeUp) * ridge);
  hcAmp = (1.0 - smoothstep(${f(C.fade[0])}, ${f(C.fade[1])}, length(vViewPosition))) * (1.0 - smoothstep(${f(C.aa[0])}, ${f(C.aa[1])}, max(fw.x, fw.y)));
  diffuseColor.rgb *= mix(1.0, k / ${f(CLUMP_MEAN)}, hcAmp);
}
#endif`;
export const CLUMP_NORMAL = `
#if defined(USE_MAP) && defined(USE_BUMPMAP)
normal = perturbNormalArb(-vViewPosition, normal, vec2(dFdx(hcH), dFdy(hcH)) * ${f(C.bump)} * hcAmp, faceDirection);
#endif`;

// #2157: the A-line skirt (`legs` 3) and the simple dress (`legs` 4). Pure helpers (no three.js, headless-testable:
// tools/avatarskirttest.mjs); numbers AVATAR_SKIRT in config.js.
//  - One open tube in the hips' bind frame (hips-local metres: y 0 = the hip joints' height, x the figure's left, z forward) from a
//    waist tucked under the top's hem down to the hem, plus a short lining inside the hem. It is skinned between the hips and BOTH
//    thighs: the hips' at the waist, the thighs' from the hip crease down (later at the back, where the seat keeps the cloth), split
//    left / right across the middle. So a stride, sitting, a squat, the bicycle's pedalling, the gym and the swimming kick carry the
//    cloth with the thighs instead of letting a knee through it (#2147's coat hangs on the torso and has exactly that limit).
//  - A drape, per vertex in the vertex shader before skinning: with the thigh's forward swing (#2034's uClothHip) the cross-section
//    narrows towards a slim target that is stored in the vertex's otherwise unused `faceAnchor` (facePart 0), so a sitting figure's
//    skirt lies on the lap. The same block lets the hem flare out with #2014's hem spring. No attribute, texture or draw call is added.
//  - Under the skirt the legs are the shorts' (in the skirt's colour up to the shorts' hem, bare below), so a gap shows cloth, not skin.
// Older clients do not know p3 / p4 and draw straight trousers (config.js decodeLookExt accepts only known `legs` values).
import { AVATAR_SKIRT as K } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const SKIRT_LEGS = { skirt: 3, dress: 4 };
/** 'skirt' / 'dress' for a look's `legs` value, else null. */
export const skirtKind = (legs) => (legs === SKIRT_LEGS.skirt ? 'skirt' : legs === SKIRT_LEGS.dress ? 'dress' : null);
/** The legs model drawn under it: the shorts (1) under a skirt or dress, the value itself otherwise. */
export const skirtUnder = (legs) => (skirtKind(legs) ? 1 : legs);
/** The palette region of the skirt, its seat and its under layer: the trousers' colour (skirt) or the top's (dress). */
export const skirtRegion = (legs) => (skirtKind(legs) === 'dress' ? 'top' : 'pants');
/** What an older client (it knows only `legs` 0 … 2) draws for a look's `legs` value: an unknown tag value is skipped, i.e. straight trousers. */
export const olderClientLegs = (legs, known = 3) => (Number.isInteger(legs) && legs >= 0 && legs < known ? legs : 0);
/** The hem's height (hips-local m). */
export const skirtHem = (kind) => K.hem[kind] ?? K.hem.skirt;

/** The ring table [y, half-width, half-depth], waist (top) → hem. */
export function skirtRings(kind) {
  const hem = skirtHem(kind), y0 = K.waist.at(-1)[0];
  return [...K.waist.map((r) => [...r]), ...K.rings.map(([t, rx, rz]) => [lerp(y0, hem, t), rx, rz])];
}

/** The drape's target half-width and half-depth at height y (waist row → hem, linear). */
export function drapeRadii(y, kind) {
  const y0 = K.waist[0][0], t = clamp((y0 - y) / (y0 - skirtHem(kind)), 0, 1);
  return [lerp(K.drape.waist[0], K.drape.hem[0], t), lerp(K.drape.waist[1], K.drape.hem[1], t)];
}

/** The thighs' share of a vertex at (x, y, z): 0 at the waist (`ramp.start`), 1 by `ramp.front` in front … `ramp.back` behind. */
export function thighShare(x, y, z) {
  const front = 0.5 + 0.5 * z / (Math.hypot(x, z) || 1);
  return smooth(K.ramp.start, lerp(K.ramp.back, K.ramp.front, front), y);
}
/** The left thigh's part of the thighs' share (+x is the figure's left), 0.5 on the middle line. */
export const leftShare = (x) => smooth(-K.split, K.split, x);

/** Skin weights of a skirt vertex: [hips, thighL, thighR] (sum 1). */
export function skirtWeights(x, y, z) {
  const s = thighShare(x, y, z), l = leftShare(x);
  return [1 - s, s * l, s * (1 - l)];
}

/** How far vertex (x, y, z) is draped (0 … 1) for the thighs' forward swings `swingL` / `swingR` (0 hanging … 1 sitting). */
export const drapeAmount = (x, y, z, swingL, swingR) => thighShare(x, y, z) * lerp(swingR, swingL, leftShare(x));

/** The skirt's geometry as plain arrays: `position` / `drape` (the slim target) [x, y, z] per vertex, `weights` [hips, L, R], `shade`,
 * `index` (outward winding; the lining's inward), `rows` × (`sides` + 1) outer vertices first (a duplicated seam column, as
 * avatar.js ringSurface), then the lining: the last `lining[0]` + 1 rows again, `inset` m inside, seen through the hem. */
export function skirtTube(kind, sides = K.sides, inset = 0.002) {
  const rings = skirtRings(kind), stride = sides + 1, position = [], drape = [], weights = [], shade = [], index = [];
  const ring = (row, off, k) => {
    const [y, rx, rz] = rings[row], [dx, dz] = drapeRadii(y, kind);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2, x = Math.sin(a) * (rx - off), z = Math.cos(a) * (rz - off);
      position.push(x, y, z); drape.push(Math.sin(a) * (dx - off), y, Math.cos(a) * (dz - off));
      weights.push(skirtWeights(x, y, z)); shade.push(k);
    }
  };
  for (let row = 0; row < rings.length; row++) ring(row, 0, 1);
  for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < sides; j++) { const a = r * stride + j, b = a + stride; index.push(a, b, a + 1, a + 1, b, b + 1); }
  const n = Math.min(K.lining[0], rings.length - 1), first = rings.length - 1 - n, base = position.length / 3;
  for (let row = first; row < rings.length; row++) ring(row, inset, K.lining[1]);
  for (let r = 0; r < n; r++) for (let j = 0; j < sides; j++) { const a = base + r * stride + j, b = a + stride; index.push(a, a + 1, b, a + 1, b + 1, b); }
  return { position, drape, weights, shade, index, rows: rings.length, sides, lining: n + 1 };
}

/** The drape applied to bind position p ([x, y, z]) with its slim target d, for the thighs' swings (the shader's block, for tests). */
export function drapePoint(p, d, swingL, swingR) {
  const k = drapeAmount(p[0], p[1], p[2], swingL, swingR);
  return [lerp(p[0], d[0], k), lerp(p[1], d[1], k), lerp(p[2], d[2], k)];
}

/** Vertex GLSL (bind pose, before the build's offsets and skinning): the drape and the hem's sway for skirt vertices (facePart 0 with a
 * drape target in faceAnchor; every other body vertex's faceAnchor is 0). `g`: { hipY (the hips' bind height), thighs [L, R] bone indices }.
 * Needs uClothHip (#2034) and #2014's uSwayHem / uSwayOn. */
export function skirtGLSL(g) {
  const f = (v) => (+v).toFixed(5), sh = g.hipY;
  return `
#ifdef USE_SKINNING
if (facePart < 0.5 && dot(faceAnchor, faceAnchor) > 0.0) { // #2157 (src/avatarskirt.js): the skirt / dress
  vec3 kq = transformed;
  float kL = smoothstep(${f(-K.split)}, ${f(K.split)}, kq.x), kFront = 0.5 + 0.5 * kq.z / max(length(kq.xz), 0.0001);
  float kS = 1.0 - smoothstep(mix(${f(sh + K.ramp.back)}, ${f(sh + K.ramp.front)}, kFront), ${f(sh + K.ramp.start)}, kq.y); // (GLSL wants edge0 < edge1)
  transformed = mix(kq, faceAnchor, kS * mix(uClothHip.y, uClothHip.x, kL));
  vec2 kn = normalize(kq.xz + vec2(0.0, 0.0001));
  transformed.xz += kn * max(0.0, dot(kn, uSwayHem.xz)) * ${f(K.sway)} * kS * kS * uSwayOn.z; // (a flare: only outward)
}
#endif`;
}
export const SKIRT_VDECL = 'uniform vec4 uClothHip;';

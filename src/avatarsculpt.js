// #2044 (part of #2042): the face's sculpted forms instead of painted depth, as pure functions of the head-bone bind position
// (head-local, before faceWarp), so they hold on any head tessellation:
//  - shape forms (the upper-lid sulcus under the brow ridge, the ridge) move the head skin itself: avatar.js headSculpt adds
//    `sculptShape`, and since the lids and brows seat on headFront, they follow;
//  - the cheekbones and the hollow under them, the nasolabial fold, the philtrum's columns and groove, the mouth corners and the
//    bulge outside them, and the lip border's roll are finer than the head's vertex grid, so they bend the shading normal in the one
//    avatar fragment shader (an analytic height, forward differences in bind metres, three's bump formula) and take a little ambient
//    light out of their hollows; they deepen with the #2031 smile and fade out by their pixel footprint. Expressions and the talking
//    mouth move the skin in the vertex shader; the forms ride along on its bind position.
// Plus one normal along the lip's outline (sealLipEdge) and a soft colour transition across it (part skin colour on the lip's edge,
// part lip colour on the skin), so the lips no longer read as stickers. No mesh, texture, light, pass or draw call.
// Numbers: config.js AVATAR_SCULPT.
import * as THREE from 'three';
import { AVATAR_SCULPT as S, AVATAR_FACE as FACE, AVATAR_SURFACE as SURFACE } from './config.js';

const f = (v) => (+v).toFixed(6);
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** A soft Gaussian ridge (depth > 0) or groove round the segment a → b, mirrored in x; `smile` 0 … 1. */
function form([depth, ax, ay, bx, by, s, gain = 0, s2 = s], x, y, smile = 0) {
  const px = Math.abs(x) - ax, py = y - ay, dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
  const t = l > 0 ? (px * dx + py * dy) / (l * l) : 0, along = (t - Math.min(1, Math.max(0, t))) * l; // past either end
  const n = l > 0 ? (dx * py - dy * px) / l : Math.hypot(px, py), w = n > 0 ? s2 : s; // n: across, + left of a → b (s2 makes a one-sided fold)
  return depth * (1 + gain * smile) * Math.exp(-(along * along) / (s * s) - (n * n) / (w * w));
}
const sum = (forms, x, y, smile) => Object.values(forms).reduce((h, F) => h + form(F, x, y, smile), 0);

/** The shape forms' depth (m, + out) at head-local (x, y) before faceWarp; headSculpt scales it by its front weight. */
export const sculptShape = (x, y) => sum(S.shape, x, y, 0);

/** The lips' outline as addFace draws it (#2002): the seam's height and the upper / lower lip's height at x; `edge` 0 at the corners. */
export function lipOutline(x) {
  const M = FACE.mouth, u = x / M.halfWidth, edge = Math.max(0, 1 - u * u);
  return { seam: M.seamY + 0.0012 * u * u, upper: M.upper * (0.75 + 0.3 * Math.exp(-(((Math.abs(x) - 0.007) / 0.004) ** 2))) * edge ** 0.7, lower: M.lower * edge ** 0.7, edge };
}
/** The signed distance (m, vertical) outside the lip outline: < 0 on the lips, > 0 on the skin round them. */
export function lipDistance(x, y) {
  const o = lipOutline(x);
  return y > o.seam ? y - o.seam - o.upper : o.seam - o.lower - y;
}
/** The normal-only forms' heights (m, + out) at head-local (x, y) before faceWarp: `form` (cheekbones) and `fine` (with the lip roll). */
export function sculptNormal(x, y, smile = 0) {
  const [r, rs, off] = S.lip.roll, d = lipDistance(x, y);
  return { form: sum(S.form, x, y, smile), fine: sum(S.fine, x, y, smile) + r * Math.exp(-(((d - off) / rs) ** 2)) * smooth(0, 0.25, lipOutline(x).edge) };
}

/** The lip grid's outer row and its skin band's inner row (avatar.js addFace: faceGrid(cols, 3) and faceGrid(cols, 1), the same
 * points) get one normal, the skin's, so the lip rolls into the skin instead of ending in a lit / shadowed rim. */
export function sealLipEdge(lip, band, cols) {
  const nl = lip.attributes.normal, nb = band.attributes.normal, edge = 3 * (cols + 1);
  for (let i = 0; i <= cols; i++) nl.setXYZ(edge + i, nb.getX(i), nb.getY(i), nb.getZ(i));
}

// --- GLSL -------------------------------------------------------------------------------------------------------------
const formGlsl = ([depth, ax, ay, bx, by, s, gain = 0, s2 = s]) => `${f(depth)} * ${gain ? `(1.0 + ${f(gain)} * s)` : '1.0'} * scSeg(p, vec4(${f(ax)}, ${f(ay)}, ${f(bx)}, ${f(by)}), vec2(${f(s)}, ${f(s2)}))`;
/** GLSL smoothstep that also takes falling edges (JS smooth(e0 > e1) as in faceWarp). */
const step = (e0, e1, x) => (e0 < e1 ? `smoothstep(${f(e0)}, ${f(e1)}, ${x})` : `(1.0 - smoothstep(${f(e1)}, ${f(e0)}, ${x}))`);

/** The GLSL pieces avatar.js splices into its fragment shader (see sculptShader). `head`: the head bone's bind position. */
export function avatarSculptGLSL({ head, part }) {
  const M = FACE.mouth, W = FACE.warp, [r, rs, off] = S.lip.roll, [sk, skIn, lp, lpOut] = S.lip.blend;
  const tint = new THREE.Color(FACE.lipTint);
  const decl = `
uniform vec3 uExpr; // #2031 (the smile deepens the folds)
// #2044 sculpted face (src/avatarsculpt.js): a soft ridge / groove round a segment
float scSeg(vec2 p, vec4 ab, vec2 s) {
  vec2 pa = p - ab.xy, ba = ab.zw - ab.xy; float l = length(ba);
  if (l < 1e-6) return exp(-dot(pa, pa) / (s.x * s.x));
  float t = dot(pa, ba) / (l * l), along = (t - clamp(t, 0.0, 1.0)) * l, n = (ba.x * pa.y - ba.y * pa.x) / l, w = n > 0.0 ? s.y : s.x;
  return exp(-along * along / (s.x * s.x) - n * n / (w * w));
}
// signed distance outside the lip outline (x: .. ; y: the outline's edge weight)
vec2 scLip(vec2 p) {
  float u = p.x / ${f(M.halfWidth)}, e = max(0.0, 1.0 - u * u), seam = ${f(M.seamY)} + 0.0012 * u * u, k = pow(e, 0.7), ax = abs(p.x) - 0.007;
  float up = ${f(M.upper)} * (0.75 + 0.3 * exp(-ax * ax / 0.000016)) * k, lo = ${f(M.lower)} * k;
  return vec2(p.y > seam ? p.y - seam - up : seam - lo - p.y, e);
}
vec2 scHeight(vec2 p, float s) { // (cheekbone forms, fine forms)
  vec2 l = scLip(p); p.x = abs(p.x);
  return vec2(${Object.values(S.form).map(formGlsl).join('\n    + ')},
    ${Object.values(S.fine).map(formGlsl).join('\n    + ')}
    + ${f(r)} * exp(-pow((l.x - ${f(off)}) / ${f(rs)}, 2.0)) * smoothstep(0.0, 0.25, l.y));
}
// head-local bind position before faceWarp (its x squeeze undone) and the squeeze itself
vec4 scLocal(vec3 at) { vec3 q = at - vec3(${f(head.x)}, ${f(head.y)}, ${f(head.z)}); float k = ${f(W.width)} * (1.0 - ${f(W.narrow)} * ${step(W.y[0], W.y[1], 'q.y')} * ${step(W.z[0], W.z[1], 'q.z')}); return vec4(q.x / k, q.yz, k); }`;
  // Colour (before the skin shading): the lip outline's soft edge. pal[6] = (skin · (1 − .35) + tint · .35) · .92 in avatar.js.
  const color = `if (uSuit < 0.5 && floor(vSuitRole + 0.5) == 2.0 && abs(vSurface.y - ${f(part.cowlHide)}) < 0.5 && (vBare > 0.5 || abs(vSurface.x - 6.0) < 0.5)) { // #2044: soft lip edge
      vec4 scQ = scLocal(vSuitAt); vec2 scL = scLip(scQ.xy); float scE = smoothstep(0.0, 0.3, scL.y);
      vec3 scT = vec3(${f(tint.r)}, ${f(tint.g)}, ${f(tint.b)});
      if (vBare > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, (diffuseColor.rgb * 0.65 + scT * 0.35) * 0.92, ${f(lp)} * scE * (1.0 - smoothstep(0.0, ${f(lpOut)}, scL.x)));
      else diffuseColor.rgb = mix(diffuseColor.rgb, max((diffuseColor.rgb / 0.92 - scT * 0.35) / 0.65, vec3(0.0)), ${f(sk)} * scE * smoothstep(${f(-skIn)}, 0.0, scL.x));
    }`;
  // Normal (after normal_fragment_maps): the fine forms as a bump; scCav darkens the ambient light later.
  const [c0, c1] = S.fade.fine, [d0, d1] = S.fade.form, e = 0.0003;
  const normal = `float scCav = 0.0; { // #2044: cheekbones, nasolabial fold, philtrum, mouth corners, lip roll
      vec3 scPx = dFdx(vSuitAt), scPy = dFdy(vSuitAt), scSx = dFdx(-vViewPosition), scSy = dFdy(-vViewPosition);
      float scFp = max(length(scPx), length(scPy)); // bind metres per pixel
      vec2 scFade = vec2(1.0 - smoothstep(${f(d0)}, ${f(d1)}, scFp), 1.0 - smoothstep(${f(c0)}, ${f(c1)}, scFp));
      if (scFade.x > 0.0 && vBare > 0.5 && uSuit < 0.5 && floor(vSuitRole + 0.5) == 2.0 && (abs(vSurface.y - ${f(part.head)}) < 0.5 || abs(vSurface.y - ${f(part.cowlHide)}) < 0.5)) {
        vec4 scQ = scLocal(vSuitAt); float scS = clamp(uExpr.x, 0.0, 1.0);
        vec2 h = scHeight(scQ.xy, scS), hx = scHeight(scQ.xy + vec2(${f(e)}, 0.0), scS), hy = scHeight(scQ.xy + vec2(0.0, ${f(e)}), scS);
        float scFront = smoothstep(${f(SURFACE.face.front[0])}, ${f(SURFACE.face.front[1])}, scQ.z / max(0.001, length(scQ.xz)));
        vec2 w = scFade * scFront;
        vec3 grad = vec3(dot(hx - h, w) / scQ.w, dot(hy - h, w), 0.0) / ${f(e)}; // d/dx after faceWarp's squeeze
        vec2 dH = vec2(dot(grad, scPx), dot(grad, scPy));
        vec3 R1 = cross(scSy, normal), R2 = cross(normal, scSx);
        float det = dot(scSx, R1) * faceDirection;
        normal = normalize(abs(det) * normal - sign(det) * (dH.x * R1 + dH.y * R2));
        scCav = clamp(${f(S.cavity * 1000)} * max(-h.y, 0.0) * w.y, 0.0, 0.5);
      }
    }`;
  const light = `reflectedLight.indirectDiffuse *= 1.0 - scCav; // #2044: less ambient light in the folds`;
  return { decl, color, normal, light };
}

/** Splices the sculpt into an avatar fragment shader `fs` (after avatar.js's own replacements; anchors keep their includes). */
export function sculptShader(fs, opts) {
  const g = avatarSculptGLSL(opts);
  return fs.replace('#include <common>', `#include <common>\n${g.decl}`)
    .replace('#include <color_fragment>', `#include <color_fragment>\n      ${g.color}`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n    ${g.normal}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n    ${g.light}`);
}
/** The program cache key's suffix. */
export const sculptKey = () => '-sculpt2044';

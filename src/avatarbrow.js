// #2046 (part of #2042): brows made of hairs instead of solid tubes, inside the avatar's one draw call.
//  - geometry: per brow one thin grid lying `lift` m above the forehead (seated on avatar.js headFront, so it follows the face's sculpt),
//    shaped round an arched centre line that is blunt and wide by the nose (the head) and narrows towards the tail. Its control pivot
//    per vertex (faceAnchor) is that centre line, so the brow slider (#1138 uBrow: thickness about the line, height) works as before,
//    and the expressions (#2031) move it with the skin beneath (they weight by the same bind position).
//  - fragment: from the bind position the brow's own coordinates (a along the line, b across it) are recomputed, no attribute is added.
//    Hairs lie on flow lines that rise steeply by the nose and lie down outwards (b − rise(a) = const); each cell of a lane holds at
//    most one hair (hash), present with the body's density at its root, so the head is dense and the edges and tail sparse, and a few
//    hairs stand out against the skin. A hair is an antialiased line in pixel footprint (fwidth): narrower than a pixel it is drawn
//    fainter, and once several lanes share a pixel the pattern fades to its expected coverage (no shimmer at distance). Under the hairs
//    a thin undergrowth (`base`). The coverage is the fragment's alpha → alpha-to-coverage (the avatars' MSAA path, #2040); without MSAA
//    the colour mixes towards the skin's colour instead (uBrowSkin), with the skin's roughness.
// Numbers: config.js AVATAR_BROW; position AVATAR_FACE.brow.at. Pure helpers (headless-testable) plus GLSL avatar.js splices in.
import * as THREE from 'three';
import { AVATAR_BROW as B, AVATAR_FACE as FACE } from './config.js';

const f = (v) => (+v).toFixed(6);
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const PK = Math.log(0.5) / Math.log(B.peak); // sin(π·u^PK) peaks at u = peak
const X0 = FACE.brow.at[0] - 0.5 * B.length, Y0 = FACE.brow.at[1];

/** The centre line's x (one side, ≥ 0) and y at u (0 head … 1 tail), head-bone metres before the face warp. */
export const browX = (u) => X0 + u * B.length;
export const browY = (u) => Y0 + B.arch * Math.sin(Math.PI * Math.min(1, Math.max(0, u)) ** PK) - B.drop * u;
/** Half the body's thickness at u: wide and blunt at the head, thin at the tail. */
export const browHalf = (u) => (B.half[0] + (B.half[1] - B.half[0]) * smooth(B.taper[0], B.taper[1], u)) * (0.35 + 0.65 * smooth(B.ends[0][0], 0.16, u));
/** The body's density (0 … 1) at u, b m off the centre line. */
export function browBody(u, b) {
  const h = browHalf(u);
  return smooth(...B.ends[0], u) * (1 - smooth(...B.ends[1], u)) * (1 - smooth(0.55 * h, 1.15 * h, Math.abs(b)));
}
const reach = (u) => B.reach[0] + (B.reach[1] - B.reach[0]) * smooth(0, 0.35, u);

/** One brow's surface for side `s` (±1): { geometry, anchor } (anchor: the same vertex order on the centre line). `front(x, y)` = the
 * head's front z there (avatar.js headFront). (cols × rows quads, 2 triangles each; winding outwards on both sides.) */
export function browSurface(s, front) {
  const C = B.cols, R = B.rows, p = [], a = [], idx = [];
  for (let j = 0; j <= R; j++) for (let i = 0; i <= C; i++) {
    const u = B.span[0] + (B.span[1] - B.span[0]) * i / C, h = browHalf(u), x = s * browX(u), yc = browY(u);
    const y = yc - h - B.below + (j / R) * (2 * h + B.below + reach(u));
    p.push(x, y, front(x, y) + B.lift);
    a.push(x, yc, front(x, yc) + B.lift);
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
    const k = j * (C + 1) + i, n = k + C + 1;
    idx.push(...(s < 0 ? [k, n, k + 1, k + 1, n, n + 1] : [k, k + 1, n, k + 1, n + 1, n]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geometry.setIndex(idx); geometry.computeVertexNormals();
  const anchor = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); anchor.setIndex(idx); // (expanded like the surface)
  return { geometry, anchor };
}
/** dz/dy of the forehead at the brow: the height slider slides the brow along it instead of straight up (no sinking in, no gap). */
export const browSlide = (front) => { const [x, y] = FACE.brow.at, e = 0.004; return (front(x, y + e) - front(x, y - e)) / (2 * e); };

/** The material's own uniform: the skin's colour (the no-MSAA fallback mixes towards it). */
export const browUniforms = () => ({ uBrowSkin: { value: new THREE.Color(0xd0a080) } });
/** From a look (avatar.js applyFaceShape). */
export function applyBrowLook(u, lk) { if (u.uBrowSkin && lk?.skin !== undefined) u.uBrowSkin.value.set(lk.skin).multiplyScalar(B.skinShade); }

/** Fragment declarations (global scope). */
export function browFDecl() {
  const [[e00, e01], [e10, e11]] = B.ends;
  return `uniform vec3 uBrowSkin; uniform vec3 uFly;
// #2046 brows of hairs (src/avatarbrow.js)
float brHalf(float u) { return mix(${f(B.half[0])}, ${f(B.half[1])}, smoothstep(${f(B.taper[0])}, ${f(B.taper[1])}, u)) * (0.35 + 0.65 * smoothstep(${f(e00)}, 0.16, u)); }
float brBody(float u, float b) { float h = brHalf(u); return smoothstep(${f(e00)}, ${f(e01)}, u) * (1.0 - smoothstep(${f(e10)}, ${f(e11)}, u)) * (1.0 - smoothstep(0.55 * h, 1.15 * h, abs(b))); }
float brSlope(float a) { return ${f(B.slope[1])} + ${f(B.slope[0] - B.slope[1])} * exp(-max(a, 0.0) / ${f(B.settle)}); }
float brRise(float a) { return ${f(B.slope[1])} * a + ${f(B.slope[0] - B.slope[1])} * ${f(B.settle)} * (1.0 - exp(-max(a, 0.0) / ${f(B.settle)})) + ${f(B.slope[0] - B.slope[1])} * min(a, 0.0); }
vec4 brHash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233)) + vec4(0.0, 1.7, 3.1, 5.3)) * 43758.5453); }`;
}

/** Fragment colour, after the surface colour (diffuseColor = the brow's colour). Declares `browCov` at main scope. `hb` = the head
 * bone's bind position (Vector3), `region` = the brows' palette region, `warp` = the face warp's width at brow height, `skinTone` = GLSL
 * that sets `vec3 browTone` from `q` (head-frame bind position): the skin shading there (avatar.js skinShading's eye socket), so the
 * no-MSAA fallback's skin matches the real skin round the brow. */
export function browColor({ hb, region, warp, part = null, skinTone = 'vec3 browTone = vec3(1.0);' }) {
  const meanLen = (B.len[0] + B.len[1]) / 2, expect = Math.min(0.9, B.fill * meanLen * 2 * B.width * 0.7 / (B.cell * B.lane));
  return `float browCov = 1.0; // #2046
    if (uSuit < 0.5 && abs(vSurface.x - ${f(region)}) < 0.5${onlyPart(part)}) {
      vec3 bq = vSuitAt - vec3(${f(hb.x)}, ${f(hb.y)}, ${f(hb.z)}), bfw = fwidth(vSuitAt);
      float bpx = max(max(bfw.x, bfw.y), max(bfw.z, 0.000001)); // metres per pixel here
      float ba = abs(bq.x) / ${f(warp)} - ${f(X0)}, bu = ba / ${f(B.length)};
      float bb = bq.y - (${f(Y0)} + ${f(B.arch)} * sin(3.14159265 * pow(clamp(bu, 0.0, 1.0), ${f(PK)})) - ${f(B.drop)} * bu);
      float bm = brSlope(ba), bsec = sqrt(1.0 + bm * bm), bn = bb - brRise(ba);
      float blane = floor(bn / ${f(B.lane)}), bit = floor(ba / ${f(B.cell)}), hairs = 0.0, dark = 0.0;
      for (int k = 0; k < 3; k++) {
        float it = bit - float(k);
        vec4 r = brHash(vec2(it, blane)), r2 = brHash(vec2(blane + 37.0, it - 11.0));
        float t0 = (it + r.x) * ${f(B.cell)}, m0 = brSlope(t0);
        float s = (ba - t0) * sqrt(1.0 + m0 * m0) / mix(${f(B.len[0])}, ${f(B.len[1])}, r.y);
        if (s < 0.0 || s > 1.0) continue;
        float n0 = (blane + 0.2 + 0.6 * r.z) * ${f(B.lane)}, curl = (r2.x - 0.5) * ${f(0.8 * B.lane)} * s * s;
        float present = step(r.w, ${f(B.fill)} * brBody(t0 / ${f(B.length)}, n0 + brRise(t0)));
        float w = ${f(B.width)} * (1.0 - 0.6 * s), hd = max(w, 0.5 * bpx), d = abs(bn - n0 - curl) / bsec;
        float c = present * (1.0 - smoothstep(hd - 0.5 * bpx, hd + 0.5 * bpx, d)) * (w / hd) * smoothstep(0.0, 0.08, s);
        dark += c * (1.0 - hairs) * mix(${f(B.shade[0])}, ${f(B.shade[1])}, r2.y);
        hairs = 1.0 - (1.0 - hairs) * (1.0 - c);
      }
      dark = hairs > 0.0001 ? dark / hairs : 1.0;
      float bfar = smoothstep(0.5, 1.5, bpx * bsec / ${f(B.lane)}), body = brBody(bu, bb);
      hairs = mix(hairs, ${f(expect)} * body, bfar); dark = mix(dark, ${f((B.shade[0] + B.shade[1]) / 2)}, bfar);
      float base = mix(${f(B.base[0])}, ${f(B.base[1])}, clamp(bu, 0.0, 1.0)) * body;
      browCov = 1.0 - (1.0 - base) * (1.0 - hairs);
      diffuseColor.rgb *= mix(1.0, dark, hairs / max(browCov, 0.0001));
      if (uFly.y > 0.5) diffuseColor.a *= browCov;
      else { vec3 q = bq; ${skinTone} diffuseColor.rgb = mix(uBrowSkin * browTone, diffuseColor.rgb, browCov); }
    }`;
}

/** Fragment roughness (after the surface finish): without MSAA the uncovered brow is skin. */
/** `part`: only this face part (#2045: the lashes share the brows' region inside the eye part). */
const onlyPart = (part) => (part === null ? '' : ` && abs(vSurface.y - ${f(part)}) < 0.5`);
export const browRoughness = ({ region, skin, part = null }) =>
  `if (uFly.y < 0.5 && uSuit < 0.5 && abs(vSurface.x - ${f(region)}) < 0.5${onlyPart(part)}) roughnessFactor = mix(${f(skin)}, roughnessFactor, browCov); // #2046`;

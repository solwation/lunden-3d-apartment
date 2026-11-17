// #2050 (part of #2042): a soft hairline instead of the scalp shell's hard, jagged lower edge, inside the avatar's one draw call.
//  - geometry: the visible hairline is AVATAR_HAIR.hairline (elevation by |azimuth| from AVATAR_HAIR.centre, with temple recessions and
//    tapering sideburns) plus its gentle wave; avatar.js hairParts runs the scalp shell `drop` degrees below it (no tufts any more), so
//    the shell's polygon edge lies where the hair's coverage is already zero and never shows. A curtain's top (long, curly) stays on the line.
//  - fragment: from the bind position the fragment's azimuth / elevation round the hair centre and its signed distance across the
//    visible line (to the nearest of three polyline segments, so steep sideburn edges thin as wide as the forehead) are recomputed,
//    no attribute is added. Within `band` m above the line the coverage thins towards the skin: an under-layer fading in over the band's
//    upper part and single hairs on lanes along the meridians (the strands' direction), one per cell, present with a chance rising from
//    the line; below the line only short, fine baby hairs at the forehead and temples (fainter at the nape). Hairs narrower than a pixel
//    are drawn fainter and, once several lanes share a pixel, the pattern fades to its expected coverage (no shimmer at distance).
//    The coverage is the fragment's alpha → alpha-to-coverage (the avatars' MSAA path, #2040 / #2046) shows the skin under the shell;
//    without MSAA the colour mixes towards the skin's colour (uLineSkin) with the skin's roughness.
// Numbers: config.js AVATAR_HAIRLINE and AVATAR_HAIR.hairline. Pure helpers (headless-testable) plus GLSL avatar.js splices in.
import * as THREE from 'three';
import { AVATAR_HAIRLINE as L, AVATAR_HAIR as HAIR } from './config.js';

const f = (v) => (+v).toFixed(6);
const deg = Math.PI / 180;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const T = HAIR.hairline;

/** The polyline part of the visible hairline (degrees) at |azimuth| `a` (linear through AVATAR_HAIR.hairline's corners). */
export function hairlineTable(a) {
  a = Math.abs(a);
  for (let i = 1; i < T.length; i++) if (a <= T[i][0]) return T[i - 1][1] + ((T[i][1] - T[i - 1][1]) * (a - T[i - 1][0])) / (T[i][0] - T[i - 1][0]);
  return T.at(-1)[1];
}
/** The gentle wave along the front of the line (degrees) at signed azimuth `a` (degrees). */
export const hairlineWave = (a) => HAIR.flow.edge * Math.sin(a * deg * 13) * (1 - smooth(45, 80, Math.abs(a)));
/** The visible hairline's elevation (degrees) at signed azimuth `a` (degrees). */
export const hairlineAt = (a) => hairlineTable(a) + hairlineWave(a);
/** Where the scalp shell starts (degrees): `drop` below the lowest visible line within ±`span` degrees (the shell's columns are up to
 * 6° apart, so its straight edge between them stays under the line, also at the sideburn's point), out of sight under the soft edge. */
export function hairlineShell(a, span = 4) {
  let low = Infinity;
  for (let k = -span; k <= span; k++) low = Math.min(low, hairlineAt(a + k));
  return low - L.drop;
}
/** Azimuth / elevation (degrees) of a head-frame point `p` round the hair centre. */
export function hairAngles(p, c = HAIR.centre) {
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  return [Math.atan2(x, z) / deg, Math.atan2(y, Math.hypot(x, z)) / deg];
}
/** The |azimuth| (degrees) from which hairstyle `style`'s curtain hangs (long 1, curly 4): no soft edge there (it is hair, not a line). */
export const hairlineCurtain = (style) => (style === 1 ? HAIR.long.from - 1 : style === 4 ? 71 : 400);
/** A flyaway root (head frame, before placement) of hairstyle `style` to skip: below the visible line or within its sparse lower band
 * (not on a curtain). */
export const hairlineAvoid = (style, c = HAIR.centre) => (p) => { const [a, e] = hairAngles(p, c); return Math.abs(a) < hairlineCurtain(style) && e < hairlineAt(a) + 1.5; };

/** The chance (0 … 1) that a hair is rooted at signed distance `d` m above the line (negative: below it, a baby hair) at |azimuth| `a`. */
export function hairlineFill(d, a = 0) {
  if (d >= 0) return L.edge + (1 - L.edge) * smooth(0, L.band, d);
  const where = Math.max(1 - smooth(L.babyTo[0], L.babyTo[1], Math.abs(a)), L.nape * smooth(110, 140, Math.abs(a)));
  return L.babyFill * where * smooth(-L.baby, -0.15 * L.baby, d);
}
/** The coverage the pattern averages to at distance `d` m (the far fade's target and the tests' reference). */
export function hairlineCoverage(d, a = 0) {
  if (d >= L.band) return 1;
  const base = smooth(L.under * L.band, L.band, d), lam = expectRate(d < 0);
  return 1 - (1 - base) * Math.exp(-lam * hairlineFill(d, a));
}
const laneW = (r = 0.09) => (2 * Math.PI * r) / L.lanes;
function expectRate(baby) { // mean hairs over a point: (length / cell) × (2 · mean width / lane width), at a typical scalp radius
  const len = baby ? L.babyLen : L.len, w = baby ? L.babyWidth : L.width;
  return ((len[0] + len[1]) / 2 / L.cell) * (2 * w * 0.7) / laneW();
}

/** The material's own uniforms: uHairLine.x = the |azimuth| (degrees) from which a curtain hangs (no soft edge there); uLineSkin the
 * skin's colour (the no-MSAA fallback mixes towards it). */
export const hairlineUniforms = () => ({ uHairLine: { value: new THREE.Vector2(400, 0) }, uLineSkin: { value: new THREE.Color(0xd0a080) } });
/** From a look (avatar.js applyFaceShape). */
export function applyHairlineLook(u, lk) {
  if (!u.uHairLine) return;
  u.uHairLine.value.x = hairlineCurtain(lk?.style);
  if (lk?.skin !== undefined) u.uLineSkin.value.set(lk.skin);
}

/** Fragment declarations (global scope). */
export function hairlineFDecl() {
  const n = T.length, arr = (k) => `float[${n}](${T.map((p) => f(p[k])).join(', ')})`;
  return `uniform vec2 uHairLine; uniform vec3 uLineSkin;
// #2050 the soft hairline (src/avatarhairline.js)
const float HL_A[${n}] = ${arr(0)};
const float HL_E[${n}] = ${arr(1)};
vec4 hlHash(vec2 c) { return fract(sin(dot(c, vec2(27.619, 57.583)) + vec4(0.0, 2.3, 4.1, 6.7)) * 43758.5453); }
float hlFill(float d, float a) {
  if (d >= 0.0) return ${f(L.edge)} + ${f(1 - L.edge)} * smoothstep(0.0, ${f(L.band)}, d);
  float where = max(1.0 - smoothstep(${f(L.babyTo[0])}, ${f(L.babyTo[1])}, a), ${f(L.nape)} * smoothstep(110.0, 140.0, a));
  return ${f(L.babyFill)} * where * smoothstep(${f(-L.baby)}, ${f(-0.15 * L.baby)}, d);
}`;
}

/** Fragment colour, after the surface colour (diffuseColor = the hair's colour). Declares `lineCov` at main scope. `hb` = the head bone's
 * bind position (Vector3), `region` = the hair's palette region. */
export function hairlineColor({ hb, region }) {
  const c = HAIR.centre, n = T.length, cells = Math.ceil(Math.max(L.len[1], L.babyLen[1]) / L.cell) + 1;
  const lamHair = expectRate(false), lamBaby = expectRate(true), bandDeg = L.band / (0.09 * deg);
  return `float lineCov = 1.0; // #2050
    if (uSuit < 0.5 && abs(vSurface.x - ${f(region)}) < 0.5 && vFly.x < 0.5) {
      vec3 hq = vSuitAt - vec3(${f(hb.x + c[0])}, ${f(hb.y + c[1])}, ${f(hb.z + c[2])});
      float hrxz = max(length(hq.xz), 0.0001), hr = length(hq), haz = atan(hq.x, hq.z), hA = abs(haz) * 57.29578;
      float hE = atan(hq.y, hrxz) * 57.29578 - ${f(HAIR.flow.edge)} * sin(haz * 13.0) * (1.0 - smoothstep(45.0, 80.0, hA));
      int hs = 0;
      for (int i = 1; i < ${n - 1}; i++) if (hA >= HL_A[i]) hs = i;
      float hLine = mix(HL_E[hs], HL_E[hs + 1], clamp((hA - HL_A[hs]) / (HL_A[hs + 1] - HL_A[hs]), 0.0, 1.0));
      if (hA < uHairLine.x && hE - hLine < ${f(bandDeg * 3 + 2)}) {
        // the signed distance (degrees of arc, + into the hair) to the nearest of three segments, azimuth scaled by cos(elevation)
        float hc = cos(radians(hE)), best = 1e9; vec2 hp = vec2(hA * hc, hE), hv = vec2(0.0, 1.0);
        for (int k = -1; k <= 1; k++) {
          int i = clamp(hs + k, 0, ${n - 2});
          vec2 s0 = vec2(HL_A[i] * hc, HL_E[i]), s1 = vec2(HL_A[i + 1] * hc, HL_E[i + 1]), ba = s1 - s0, pa = hp - s0;
          vec2 w = pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
          float dd = dot(w, w);
          if (dd < best) { best = dd; hv = dd > 1e-8 ? w : vec2(-ba.y, ba.x); }
        }
        float hsg = hE >= hLine ? 1.0 : -1.0;
        float dm = hsg * sqrt(best) * 0.0174533 * hr + ${f(L.wobble)} * (0.6 * sin(haz * 23.0 + 1.3) + 0.4 * sin(haz * 41.0 + 0.4)); // metres across the line (+ a slow wave)
        float hg = clamp(abs(normalize(hv).y), 0.15, 1.0); // d(distance) / d(along the meridian)
        if (dm < ${f(L.band)}) {
          vec3 hfw = fwidth(vSuitAt);
          float hpx = max(max(hfw.x, hfw.y), max(hfw.z, 0.000001)); // metres per pixel here
          float hlw = 6.2831853 * hrxz / ${f(L.lanes)}, hlt = (haz / 6.2831853 + 0.5) * ${f(L.lanes)};
          float hlane = floor(hlt), hv0 = atan(hq.y, hrxz) * hr, hcell = floor(hv0 / ${f(L.cell)});
          float hairs = 0.0, dark = 0.0;
          for (int k = 0; k < ${cells}; k++) {
            float j = hcell - float(k);
            vec4 r = hlHash(vec2(j, hlane)), r2 = hlHash(vec2(hlane + 53.0, j - 7.0));
            float root = (j + r.x) * ${f(L.cell)}, droot = dm - (hv0 - root) * hg;
            bool baby = droot < 0.0;
            float len = baby ? mix(${f(L.babyLen[0])}, ${f(L.babyLen[1])}, r.y) : mix(${f(L.len[0])}, ${f(L.len[1])}, r.y);
            float s = (hv0 - root) / len;
            if (s < 0.0 || s > 1.0) continue;
            float present = step(r.w, hlFill(droot, hA));
            float curl = (r2.x - 0.5) * (baby ? 1.4 : 0.7) * s * s, centre = hlane + 0.2 + 0.6 * r.z + curl;
            float w = (baby ? ${f(L.babyWidth)} : ${f(L.width)}) * (1.0 - 0.6 * s), hd = max(w, 0.5 * hpx), d = abs(hlt - centre) * hlw;
            float cv = present * (1.0 - smoothstep(hd - 0.5 * hpx, hd + 0.5 * hpx, d)) * (w / hd) * smoothstep(0.0, 0.06, s) * (baby ? 0.8 : 1.0);
            dark += cv * (1.0 - hairs) * mix(${f(L.shade[0])}, ${f(L.shade[1])}, r2.y);
            hairs = 1.0 - (1.0 - hairs) * (1.0 - cv);
          }
          dark = hairs > 0.0001 ? dark / hairs : 1.0;
          float hfar = smoothstep(1.5, 3.5, hpx / hlw); // (late: a uniform mean reads as a pale stripe, the hairs' grain as hair)
          float expect = 1.0 - exp(-(dm < 0.0 ? ${f(lamBaby)} : ${f(lamHair)}) * hlFill(dm, hA));
          hairs = mix(hairs, expect, hfar); dark = mix(dark, ${f((L.shade[0] + L.shade[1]) / 2)}, hfar);
          float base = smoothstep(${f(L.under * L.band)}, ${f(L.band)}, dm);
          lineCov = 1.0 - (1.0 - base) * (1.0 - hairs);
          diffuseColor.rgb *= mix(1.0, dark, hairs / max(lineCov, 0.0001) * (1.0 - base)); // (the single hairs' shade fades into the hair above the band: no seam)
          if (uFly.y > 0.5) diffuseColor.a *= lineCov;
          else diffuseColor.rgb = mix(uLineSkin, diffuseColor.rgb, lineCov);
        }
      }
    }`;
}

/** Fragment roughness (after the surface finish): without MSAA the uncovered edge is skin. */
export const hairlineRoughness = ({ skin }) =>
  `if (uFly.y < 0.5 && lineCov < 1.0) roughnessFactor = mix(${f(skin)}, roughnessFactor, lineCov); // #2050`;

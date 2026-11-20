// #2168: fabric patterns on the top (stripes, checks, marl, two-tone sleeves), procedural in the avatar's one fragment shader: a function of the
// bind-pose position `vSuitAt` only (so it rides with skinning and follows seams and folds like #2034's weave), no texture, mesh, attribute or draw.
// The look's pattern (config.js AVATAR_PATTERN, tag `m`) goes in one vec4 uniform `uClothPat.x`; 0 (or a worn jacket / coat) leaves the plain colour.
//  - striped: horizontal bands by bind height (arms hang in the bind pose, so a sleeve's stripes run round the arm and bend with it);
//  - checked: those bands plus vertical lines, whole columns round the part's axis (as the weave's), darker where two bands cross;
//  - marl: two octaves of sine noise in light and dark flecks over a base pulled towards grey;
//  - two-tone: the sleeves in the second colour, the seam at the shoulder.
// The second colour comes from the top's own colour (`altOf`). Every pattern dissolves into its mean over the pixel footprint. `patternAt` / `altOf`
// mirror the GLSL so tools/avatarpatterntest.mjs checks them under node. `PATTERN.on = false` (before a material compiles) leaves it out.
import { AVATAR_PATTERN as P, patternOf } from './config.js';
import { bindAt } from './olof.js';

export const PATTERN = { on: true };
export const patternKey = () => (PATTERN.on ? '-pattern2168' : '-patternoff');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const f = (v) => (+v).toFixed(5);

/** The pattern the top shows: the look's, but none under an outer layer worn as the top model (cut 3 / 4). */
export const effectivePattern = (lk) => ((lk?.cut | 0) > 2 ? 0 : patternOf(lk));

/** Sets the pattern uniform from a look. */
export function setPatternLook(u, lk) { if (u?.uClothPat) u.uClothPat.value.set(PATTERN.on ? effectivePattern(lk) : 0, 0, 0, 0); }

/** The second colour of linear colour c [r, g, b]: a darker tone of a light top, a creamy lighter one of a dark top. */
export function altOf(c) {
  const A = P.alt, l = 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2];
  return l > A.split ? c.map((v) => v * A.darker) : c.map((v, i) => v + (A.light[i] - v) * A.lightMix);
}

/** A smooth square wave of period 1 in x: 1 within `duty` of each integer, softened by `soft`. */
const band = (x, duty, soft) => { const t0 = Math.cos(Math.PI * duty); return smooth(t0 - soft, t0 + soft, Math.cos(TAU * x)); };
const softness = (fp, period) => clamp(0.06 + 1.2 * fp / period, 0, 0.8);
const fadeOf = (fp, period) => 1 - smooth(P.fade[0], P.fade[1], fp / period);

/** The marl's flecks at bind position p: -1 … 1, zero-mean (an odd function of two products of sines; horizontal directions mixed so no side streaks), faded by the footprint. */
export function marlFleck(p, fp = 0) {
  const M = P.marl, [[h0, v0], [h1, v1]] = M.freq;
  const a = Math.sin(h0 * (0.8 * p.x + 0.6 * p.z) + 1.3) * Math.sin(v0 * p.y + 0.4), b = Math.sin(h1 * (0.6 * p.x - 0.8 * p.z) + 2.1) * Math.sin(v1 * p.y + 1.1);
  return clamp(M.gain * (0.6 * a + 0.4 * b), -1, 1) * (1 - smooth(M.fade[0], M.fade[1], fp * Math.max(h1, v1) / TAU));
}

/** The pattern at bind position p {x, y, z} of the top (`torso`: 1 on the body, 0 on a sleeve; `fp` the pixel footprint in m): { w: the share of the
 * second colour, k: a brightness factor }. */
export function patternAt(pattern, p, torso = 1, fp = 0) {
  const S = bindAt('shoulderL'), sx = p.x >= 0 ? 1 : -1, r = torso ? P.radius.torso : P.radius.sleeve;
  const cx = torso ? 0 : sx * S.x, ang = Math.atan2(p.x - cx, p.z);
  if (pattern === 1) {
    const T = P.stripe, fd = fadeOf(fp, T.period), a = band(p.y / T.period, T.duty, softness(fp, T.period));
    return { w: (T.duty + (a - T.duty) * fd) * T.strength, k: 1 };
  }
  if (pattern === 2) {
    const T = P.check, n = Math.max(1, Math.floor(TAU * r / T.period + 0.5)), fd = fadeOf(fp, T.period), sf = softness(fp, T.period);
    const a = band(p.y / T.period, T.duty, sf), b = band(ang * n / TAU, T.duty, sf), mean = 2 * T.duty - T.duty * T.duty;
    const w = Math.max(a, b);
    return { w: (mean + (w - mean) * fd) * T.strength, k: 1 - T.cross * a * b * fd };
  }
  if (pattern === 3) return { w: 0, k: 1 + P.marl.contrast * marlFleck(p, fp) };
  if (pattern === 4) return { w: torso ? 0 : 1, k: 1 };
  return { w: 0, k: 1 };
}

/** Fragment declarations (spliced in before main). */
export function patternDecl() {
  if (!PATTERN.on) return '';
  const A = P.alt, M = P.marl, ST = P.stripe, CK = P.check, S = bindAt('shoulderL');
  return `// #2168 top patterns (src/avatarpattern.js)
uniform vec4 uClothPat;
float patBand(float x, float duty, float soft) { float t0 = cos(3.14159265 * duty); return smoothstep(t0 - soft, t0 + soft, cos(6.2831853 * x)); }
float patSoft(float fp, float period) { return clamp(0.06 + 1.2 * fp / period, 0.0, 0.8); }
float patFade(float fp, float period) { return 1.0 - smoothstep(${f(P.fade[0])}, ${f(P.fade[1])}, fp / period); }
// returns (w: share of the second colour, k: brightness factor) for pattern 'pat' at the bind position p
vec2 patternAt(float pat, vec3 p, float torso, float fp) {
  float sx = p.x >= 0.0 ? 1.0 : -1.0, r = torso > 0.5 ? ${f(P.radius.torso)} : ${f(P.radius.sleeve)};
  float cx = torso > 0.5 ? 0.0 : sx * ${f(S.x)}, ang = atan(p.x - cx, p.z);
  if (pat < 1.5) {
    float fd = patFade(fp, ${f(ST.period)}), a = patBand(p.y / ${f(ST.period)}, ${f(ST.duty)}, patSoft(fp, ${f(ST.period)}));
    return vec2((${f(ST.duty)} + (a - ${f(ST.duty)}) * fd) * ${f(ST.strength)}, 1.0);
  }
  if (pat < 2.5) {
    float n = max(1.0, floor(6.2831853 * r / ${f(CK.period)} + 0.5)), fd = patFade(fp, ${f(CK.period)}), sf = patSoft(fp, ${f(CK.period)});
    float a = patBand(p.y / ${f(CK.period)}, ${f(CK.duty)}, sf), b = patBand(ang * n / 6.2831853, ${f(CK.duty)}, sf), mean = ${f(2 * CK.duty - CK.duty * CK.duty)};
    return vec2((mean + (max(a, b) - mean) * fd) * ${f(CK.strength)}, 1.0 - ${f(CK.cross)} * a * b * fd);
  }
  if (pat < 3.5) {
    float a = sin(${f(M.freq[0][0])} * (0.8 * p.x + 0.6 * p.z) + 1.3) * sin(${f(M.freq[0][1])} * p.y + 0.4), b = sin(${f(M.freq[1][0])} * (0.6 * p.x - 0.8 * p.z) + 2.1) * sin(${f(M.freq[1][1])} * p.y + 1.1);
    float n = clamp(${f(M.gain)} * (0.6 * a + 0.4 * b), -1.0, 1.0) * (1.0 - smoothstep(${f(M.fade[0])}, ${f(M.fade[1])}, fp * ${f(Math.max(M.freq[1][0], M.freq[1][1]) / (Math.PI * 2))}));
    return vec2(0.0, 1.0 + ${f(M.contrast)} * n);
  }
  return vec2(torso > 0.5 ? 0.0 : 1.0, 1.0);
}
vec3 patternAlt(vec3 c) {
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  return l > ${f(A.split)} ? c * ${f(A.darker)} : mix(c, vec3(${f(A.light[0])}, ${f(A.light[1])}, ${f(A.light[2])}), ${f(A.lightMix)});
}`;
}

/** Cloth-block body (inside `if (cOn > 0.5)`, the top only; `leg`, `cTorso`, `cfp` and `vSuitAt` in scope). */
export function patternShade() {
  if (!PATTERN.on) return '';
  return `if (!leg && uClothPat.x > 0.5) { // #2168
        vec2 pw = patternAt(uClothPat.x, vSuitAt, cTorso, cfp);
        bool marl = abs(uClothPat.x - 3.0) < 0.5;
        vec3 pc = diffuseColor.rgb;
        if (marl) pc = mix(pc, vec3(dot(pc, vec3(0.3, 0.55, 0.15))), ${f(P.marl.desat)});
        diffuseColor.rgb = mix(pc, patternAlt(pc), pw.x) * pw.y;
      }`;
}

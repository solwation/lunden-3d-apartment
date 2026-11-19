// #2155: age on the avatars. One look field (`age`, a step 0 … AVATAR_AGE.steps − 1; 0 = young = the look as it was) drives
//  - the face's folds: forehead lines, the glabella, crow's feet, an under-eye bag with its trough and a deeper nasolabial fold. Their
//    heights live in avatarsculpt.js (`ageHeight`, the same forms in GLSL inside `scHeight`, so the #2044 normal bump and cavity carry them);
//    here the grooves also darken the albedo a little and the bag gets a faint darker tint, so they read at a distance too;
//  - salt-and-pepper hair, beard and brows: per strand cell (a hash of the bind position, so every client draws the same strands) the colour
//    moves towards a mid grey and, later, towards white; the temples go grey first (and the area round the mouth on a beard);
//  - slightly matter skin (a little more roughness on all bare skin).
// Pure helpers (`ageParams`, `greyAt`, `ageSeed`) are tested in tools/avataragetest.mjs; the GLSL mirrors them. No mesh, texture, draw call
// or network field: two vec4 uniforms. Numbers: config.js AVATAR_AGE. `AGE_FX.on = false` (before a material compiles) leaves it out.
import * as THREE from 'three';
import { AVATAR_AGE as A, ageStepOf } from './config.js';
import { ageHeight } from './avatarsculpt.js';

export const AGE_FX = { on: true };
/** The program cache key's suffix. */
export const ageKey = () => (AGE_FX.on ? '-age2155' : '-ageoff');
export { ageHeight, ageStepOf };

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/** The derived strengths of an age step (clamped to 0 … steps − 1): fold 0 … 1, grey (share of grey strands), white (0 mid grey … 1 white),
 * temple (extra grey share in the temples), bag (0 … 1), matte (added roughness). All 0 at step 0. */
export function ageParams(step) {
  const last = A.steps - 1, a = Math.min(last, Math.max(0, Math.round(Number(step) || 0)));
  const fold = clamp01((a - A.fold.from) / (last - A.fold.from));
  const grey = A.grey.max * clamp01((a - A.grey.from) / (last - A.grey.from)) ** A.grey.power;
  const temple = a > 0 ? A.temple[0] * clamp01(a / 4) : 0;
  return { age: a, fold, grey, white: clamp01((a - A.white.from) / (last - A.white.from)), temple, bag: clamp01((a - 1) / (last - 1)), matte: A.matte * fold };
}

/** A deterministic phase (0 … 1) per avatar from the look's own fields (never the age), so two avatars of the same age grey differently
 * but every client draws the same one. */
export function ageSeed(look) {
  let h = 2166136261;
  for (const ch of `${look?.skin}|${look?.hair}|${look?.style}|${look?.gender ?? look?.figure}|${look?.skinSeed ?? 0}`) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return (h >>> 8) / 16777216;
}

/** Whether the strand with hash noise `n` (0 … 1) at a spot of temple weight `tw` (0 … 1) is grey for the params `p` (the GLSL's rule). */
export const greyAt = (p, n, tw = 0, extra = 0) => n < clamp01(p.grey + p.temple * tw + extra * p.grey);
/** The temple weight at head-frame (x, y): 1 over the temple zone. */
export function templeWeight(x, y) {
  const [, x0, x1, y0, sy] = A.temple;
  return smooth(x0, x1, Math.abs(x)) * Math.exp(-(((y - y0) / sy) ** 2));
}

/** Fresh uniforms: uAge (fold, grey, matte, seed), uAge2 (bag, whiteness, temple, 0). All zero = young. */
export const ageUniforms = () => ({ uAge: { value: new THREE.Vector4() }, uAge2: { value: new THREE.Vector4() } });
/** Sets an avatar material's uniforms from a look (avatar.js applyFaceShape). */
export function applyAgeLook(u, lk) {
  if (!u.uAge) return;
  const step = ageStepOf(lk), p = ageParams(step);
  u.uAge.value.set(p.fold, p.grey, p.matte, step ? ageSeed(lk) : 0);
  u.uAge2.value.set(p.bag, p.white, p.temple, step);
}

const f = (v) => (+v).toFixed(6);
const v3 = (a) => `vec3(${a.map(f).join(',')})`;

/** Fragment colour, after the hair / beard / brow colours (diffuseColor = the surface's colour). `head` = the head bone's bind position,
 * `part` = FACE_PART, `region` = REGION, `lips` the lips' region. Grooves darken the skin, the bag tints it; strands go grey. */
export function ageColor({ head, part, region }) {
  if (!AGE_FX.on) return '';
  const hb = `vec3(${f(head.x)}, ${f(head.y)}, ${f(head.z)})`, [bx, by, bw, bh] = A.bag, [t0, t1, ty, tw] = [A.temple[1], A.temple[2], A.temple[3], A.temple[4]];
  return `{ // #2155 age (src/avatarage.js)
      float agFp = length(fwidth(vSuitAt)); // bind metres per pixel (outside the branches: derivatives)
      if (uAge2.w > 0.0 && uSuit < 0.5) {
        float agReg = floor(vSurface.x + 0.5);
        if (vBare > 0.5 && floor(vSuitRole + 0.5) == 2.0 && abs(floor(vSurface.y + 0.5) - ${part.head}.0) < 0.5 && abs(agReg - ${region.lips}.0) > 0.5) {
          vec4 agQ = scLocal(vSuitAt); // the head frame before faceWarp
          float agFront = smoothstep(0.02, 0.06, agQ.z) * (1.0 - smoothstep(${f(0.0015)}, ${f(0.006)}, agFp));
          vec2 agP = vec2(abs(agQ.x), agQ.y);
          float agG = clamp(-scAge(agP, clamp(uExpr.x, 0.0, 1.0)) / ${f(A.shadeDepth)}, 0.0, 1.0); // groove depth 0 … 1
          vec2 agB = vec2((agP.x - ${f(bx)}) / ${f(bw)}, (agP.y - ${f(by)}) / ${f(bh)});
          vec3 agTone = mix(vec3(1.0), vec3(1.0) - ${f(A.shade)} * vec3(0.55, 0.7, 0.62) * agG, agFront);
          agTone *= mix(vec3(1.0), ${v3(A.bagTint)}, ${f(A.bagK)} * uAge2.x * exp(-dot(agB, agB)) * agFront);
          diffuseColor.rgb *= agTone;
        } else if (uAge.y + uAge2.z > 0.0 && (abs(agReg - ${region.hair}.0) < 0.5 || abs(agReg - ${region.beard}.0) < 0.5 || abs(agReg - ${region.brow}.0) < 0.5)) {
          bool agBeard = abs(agReg - ${region.beard}.0) < 0.5, agBrow = abs(agReg - ${region.brow}.0) < 0.5;
          vec3 agQ = vSuitAt - ${hb};
          float agTemple = smoothstep(${f(t0)}, ${f(t1)}, abs(agQ.x)) * exp(-pow((agQ.y - ${f(ty)}) / ${f(tw)}, 2.0));
          float agMouth = agBeard ? ${f(A.mouth)} * exp(-pow((agQ.y - 0.04) / 0.035, 2.0)) : 0.0;
          vec3 agC = floor((vSuitAt + ${f(A.cell * 0.3)} * sin(vSuitAt.yzx * ${f(1.0 / A.cell * 0.9)})) / vec3(${f(A.cell)}, ${f(A.cell * A.stretch)}, ${f(A.cell)})); // elongated, wobbling cells: strands, not pixels
          float agN = fract(sin(dot(agC, vec3(12.9898, 78.233, 37.719)) + uAge.w * 91.7) * 43758.5453);
          float agN2 = fract(sin(dot(agC, vec3(39.346, 11.135, 83.155)) + uAge.w * 53.1) * 24634.6345);
          float agFrac = clamp((uAge.y * (agBrow ? ${f(A.brow)} : 1.0)) + uAge2.z * agTemple + agMouth * uAge.y, 0.0, 1.0);
          float agFar = smoothstep(${f(A.cell * 0.6)}, ${f(A.cell * 1.8)}, agFp); // beyond a strand's size: the mean tone
          float agGrey = mix(1.0 - smoothstep(agFrac - 0.04, agFrac + 0.04, agN), agFrac, agFar);
          float agW = clamp(uAge2.y * 1.4 - 0.2 + (agN2 - 0.5) * 0.7, 0.0, 1.0); // salt-and-pepper: mid grey strands, white ones later
          float agCov = agBeard ? beardCov : agBrow ? browCov : 1.0;
          vec3 agTone = vec3(mix(${f(A.tone[0])}, ${f(A.tone[1])}, agW)) * (0.85 + 0.3 * agN2);
          diffuseColor.rgb = mix(diffuseColor.rgb, agTone, agGrey * agCov * (agBrow ? 0.9 : 1.0));
        }
      }
    }`;
}

/** Fragment roughness (after the surface finish): bare skin a little matter. */
export const ageRoughness = () => (AGE_FX.on ? 'if (uAge.z > 0.0 && uSuit < 0.5 && vBare > 0.5) roughnessFactor = min(1.0, roughnessFactor + uAge.z); // #2155' : '');

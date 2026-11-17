// #2033: wet, living eyes. The eyeball gets a sharp glint from a round wet ball (per fragment, from the lights' own directions, so it
// follows the sun), a soft shadow under the upper lid, darker corners and a moist line along the lower lid; the pupil narrows in bright
// light and widens in the dark, following the local light level of #2017 (src/avatarlight.js). Everything is uniforms and GLSL on the
// avatar's own material: no geometry, draw call, light or network field. Pure helpers first (tools/avatareyestest.mjs), then the GLSL
// pieces avatar.js splices in at its eye code. Numbers: AVATAR_EYES in config.js.
import * as THREE from 'three';
import { AVATAR_EYES as E, AVATAR_FACE as FACE, AVATAR_SURFACE as SURFACE, AVATAR_BLINK } from './config.js';
import { zoneLevel } from './avatarlight.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f = (v) => (+v).toFixed(5);

/** The material's uniform: x the pupil's scale, y how much of the sun's glint shows (1 open sun … 0 a room), z unused. */
export const eyeUniforms = () => ({ uEyeLit: { value: new THREE.Vector3(1, 1, 0) } });

/** The pupil's scale for a local light level (avatarlight.js zoneLevel: 1 = open sun, ~0.08 a dark night). */
export function pupilScale(level) {
  const [lb, sb] = E.pupil.bright, [ld, sd] = E.pupil.dark;
  const t = clamp((Math.log(Math.max(level, 1e-4)) - Math.log(ld)) / (Math.log(lb) - Math.log(ld)), 0, 1);
  return sd + (sb - sd) * t;
}

/** What the eyes see where a figure stands: the light level and how much direct sun reaches them (0 … 1).
 * `zone` / `env` as avatarlight.js zoneLevel. */
export function eyeLight(zone, env) {
  const day = clamp(env?.day ?? 0, 0, 1), oc = clamp(env?.overcast ?? 0, 0, 1);
  const open = !zone || (zone.kind ?? 'outdoors') === 'outdoors';
  return { level: zoneLevel(zone, env ?? {}), sun: open && !zone?.shade ? day * (1 - E.overcast * oc) : 0 };
}

/** Eases the pupil scale `cur` towards `target` over dt s: faster when it narrows than when it widens. No previous value: snaps. */
export function stepPupil(cur, target, dt) {
  if (!Number.isFinite(cur) || !(dt > 0)) return target;
  const tau = target < cur ? E.pupil.constrict : E.pupil.dilate;
  return cur + (target - cur) * (1 - Math.exp(-Math.min(dt, 5) / tau));
}

/** Per-avatar state: the light the figure stands in (`setEyeLight`) and the smoothed pupil; `step` writes the uniform. */
export class EyeLight {
  constructor() { this.level = null; this.sun = 1; this.pupil = undefined; }
  set(zone, env) { const l = eyeLight(zone, env); this.level = l.level; this.sun = l.sun; return this; }
  /** Writes `u.uEyeLit` (the material's uniforms). Without a light reading (a preview, a figure the light probe never saw) the eyes keep
   * their plain size and full glint. */
  step(u, dt) {
    if (!u?.uEyeLit) return;
    if (this.level === null) { u.uEyeLit.value.set(1, 1, 0); return; }
    this.pupil = stepPupil(this.pupil, pupilScale(this.level), dt);
    u.uEyeLit.value.set(this.pupil, this.sun, 0);
  }
}

// --- GLSL -----------------------------------------------------------------------------------------------------------------------------
const VARY = 'varying vec3 vEyeAt, vEyeC, vEyeUp;';
/** Vertex declarations: the uniform, the varyings and two globals the eye code fills (the vertex's offset from the wet ball's centre in the
 * head's bind frame, and whether the vertex belongs to the eye). */
export const EYE_VDECL = `uniform vec3 uEyeLit; ${VARY} vec3 eyeO = vec3(0.0); float eyeOn = 0.0;`;
/** Fragment declarations. */
export const EYE_FDECL = `uniform vec3 uEyeLit; ${VARY}`;

/** Vertex, in the eye branch right after the eye's size: the pupil (the dark disc, region `fixed`) scales about the iris' centre. */
export const eyePupil = (irisPart) => `if (facePart > ${irisPart}.0 - 0.5 && abs(region - 4.0) < 0.5) transformed.xy = faceAnchor.xy + (transformed.xy - faceAnchor.xy) * uEyeLit.x; // #2033`;

/** Vertex, in the eye branch after the blink: the vertex's place in the eye's opening (x −1 … 1 corner to corner, y −1 lower lid … 1 upper
 * lid; the blink and the eye's size undone, so the lid edges stay at ±1; z how open the lids are) and its offset from the wet ball's centre. */
export function eyeAt() {
  const R = FACE.eye.r, zc = FACE.eye.r * FACE.eye.scale[2] - E.ball * R, K = SURFACE.eye;
  return `{ // #2033
            vec2 ed = (transformed.xy - faceAnchor.xy) / uEye.xy; ed.y /= max(1.0 - uBlink * ${f(AVATAR_BLINK.depth)}, 0.03);
            float ex = ed.x / ${f(R)}, eh = max(1.0 - ex * ex, 0.05);
            vEyeAt = vec3(ex, ed.y / (eh * (ed.y > 0.0 ? ${f(K.upper)} : ${f(K.lower)})), 1.0 - uBlink);
            eyeO = transformed - faceAnchor - vec3(0.0, 0.0, ${f(zc)} * uEye.z); eyeOn = 1.0;
          }`;
}

/** Vertex, after the whole face shape: the ball's centre (the vertex less its offset, through the head's widening) and the head's up,
 * both in view space through the skinning, so every fragment can rebuild the ball's exact normal. */
export const eyeView = () => `if (eyeOn > 0.5) { // #2033
  mat4 eyeSk = mat4(1.0);
  #ifdef USE_SKINNING
  eyeSk = skinMatrix;
  #endif
  vEyeC = (modelViewMatrix * (eyeSk * vec4(transformed - eyeO * vec3(uHead.x, uHead.y, 1.0), 1.0))).xyz;
  vEyeUp = mat3(modelViewMatrix) * mat3(eyeSk) * vec3(0.0, 1.0, 0.0);
} else { vEyeC = vec3(0.0); vEyeUp = vec3(0.0); vEyeAt = vec3(0.0); }`;

const eyePart = (eye, iris) => `(uSuit < 0.5 && (abs(vSurface.y - ${eye}.0) < 0.5 || abs(vSurface.y - ${iris}.0) < 0.5))`;

/** Fragment, after the roughness (before the lights read diffuseColor): the eyeball darkens under the upper lid and in its corners and
 * is wet (glossy) along the lower lid; the lid margin just outside is wet too. Elsewhere the flattened eyeball's own (geometric) highlight
 * is kept broad, so the wet ball's glint is the one sharp reflection. */
export function eyeWet(eye, iris) {
  const L = E.lid, T = E.tear;
  return `if (${eyePart(eye, iris)}) { // #2033
      if (vBare < 0.5) {
        diffuseColor.rgb *= (1.0 - ${f(L.shadow)} * smoothstep(${f(L.from)}, 1.0, vEyeAt.y)) * (1.0 - ${f(L.corner)} * smoothstep(0.55, 1.0, abs(vEyeAt.x)));
        roughnessFactor = mix(abs(vSurface.x - 4.0) < 0.5 && abs(vSurface.y - ${iris}.0) < 0.5 ? 1.0 : max(roughnessFactor, ${f(E.ballRough)}), ${f(T.rough)}, 1.0 - smoothstep(-1.0, -${f(T.band)}, vEyeAt.y)); // (the pupil: matt, a hole)
      } else roughnessFactor = mix(roughnessFactor, ${f(T.lidRough)}, smoothstep(-1.4, -1.0, vEyeAt.y) * (1.0 - step(-0.5, vEyeAt.y)));
    }`;
}

/** Fragment, before the local light level: the glint. The wet ball's normal per fragment; each directional light (the sun, the fill)
 * gives a sharp highlight where it reflects towards the camera, the sky a broader one; the lower lid's tear line reflects them along a
 * thin band. Kept under the upper lid's shadow; the directional glint dims indoors and in shade (uEyeLit.y). */
export function eyeGlint(eye, iris) {
  const T = E.tear, L = E.lid;
  return `if (${eyePart(eye, iris)} && vBare < 0.5) { // #2033
      vec3 eN = normalize(-vViewPosition - vEyeC), eV = normalize(vViewPosition), eU = normalize(vEyeUp + vec3(0.0, 1e-5, 0.0));
      vec3 eT = normalize(eN + eU * ${f(T.lift)});
      float eTear = 1.0 - smoothstep(-1.0, -${f(T.band)}, vEyeAt.y), eLid = 1.0 - ${f(L.glintCut)} * smoothstep(${f(L.glintFrom)}, 1.0, vEyeAt.y);
      vec3 eG = vec3(0.0);
      #if NUM_DIR_LIGHTS > 0
      vec3 eD = vec3(0.0);
      for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
        vec3 eL = directionalLights[i].direction, eH = normalize(eL + eV);
        eD += directionalLights[i].color * smoothstep(0.0, 0.15, dot(eN, eL)) * (pow(max(dot(eN, eH), 0.0), ${f(E.sharp)}) * ${f(E.sun)}
          + eTear * pow(max(dot(eT, eH), 0.0), ${f(T.sharp)}) * ${f(T.bright)});
      }
      eG += eD * mix(${f(E.room)}, 1.0, uEyeLit.y);
      #endif
      #if NUM_HEMI_LIGHTS > 0
      { vec3 eL = hemisphereLights[0].direction, eH = normalize(eL + eV);
        eG += hemisphereLights[0].skyColor * (pow(max(dot(eN, eH), 0.0), ${f(E.skySharp)}) * ${f(E.sky)} + eTear * pow(max(dot(eT, eH), 0.0), ${f(T.sharp)}) * ${f(T.bright * 0.5)}); }
      #endif
      outgoingLight += eG * eLid * vEyeAt.z; // (a shut eye shows no glint in its hairline)
    }`;
}

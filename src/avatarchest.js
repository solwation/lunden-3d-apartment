// #2108: visible breathing. The chest and the belly rise forwards and the shoulders lift softly with every inhale, deeper and faster right after
// running / exertion and calming over a few seconds. The rhythm is #2037's own (src/avatarbreath.js: the same `phase`, so the cold-weather puff
// leaves as the chest starts to fall, and its `drive`: the effort, the short-term breathlessness `pant` and the slow `heat`). Everything is
// derived locally (no network field, no bone beyond the 15-bone rig): pure helpers here (no three.js, headless-testable:
// tools/avatarchesttest.mjs; numbers AVATAR_CHEST in config.js), a small upper-body lean / hip term added to poseOlof by Avatar.update and
// one vec3 uniform whose vertex snippet moves the bind-pose chest, belly and shoulder tops before skinning (a continuous field of the bind
// position, so seams between parts never open; CPU raycasts and the head-box collider keep the plain body).
import { AVATAR_CHEST as C, AVATAR_BREATH as B } from './config.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** The breath's shape over one cycle `phase` (0 … 1, #2037's): 0 fully exhaled … 1 at the top of the inhale. The inhale eases up until
 * B.exhale (where #2037's puff starts), the exhale eases down and the last C.pause of it rests. Continuous across the wrap. */
export function breathWave(phase) {
  const p = ((Number(phase) || 0) % 1 + 1) % 1, a = B.exhale;
  if (p < a) return 0.5 - 0.5 * Math.cos(Math.PI * p / a);
  return 0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, (p - a) / ((1 - a) * (1 - C.pause))));
}

/** A fresh output (reused every frame). */
export const newChest = () => ({ wave: 0, drive: 0, chest: 0, belly: 0, shoulder: 0, lean: 0, hip: 0 });

/** This frame's breathing for the breath state `s` (#2037's newBreath / stepBreath; null = a figure nobody steps, e.g. the one-frame mirror
 * preview or a fixed-pose measurement: no breathing, everything zero). `on` 0 … 1 gates it (0 under water with the mask). Returns `out`: `wave` 0 … 1,
 * `drive` 0 … 1, the forward offsets `chest` / `belly` (m, bind pose, at the field's centre), `shoulder` (m up), `lean` (rad, the upper body
 * straightening back: add it to poseOlof's lean, + back, and subtract it from the head's pitch so the gaze stays) and `hip` (m, ± about zero). All bounded. */
export function chestBreath(s, on = 1, out = newChest()) {
  const k = s ? clamp01(s.drive) : 0, g = s ? clamp01(on) : 0;
  const w = breathWave(s ? s.phase : 0) * g, mix = ([a, b]) => a + (b - a) * k;
  out.wave = w; out.drive = k;
  out.chest = mix(C.chest) * w; out.belly = mix(C.belly) * w; out.shoulder = mix(C.shoulder) * w; out.lean = mix(C.lean) * w;
  out.hip = g > 0 ? mix(C.hip) * (2 * w - 1) * g : 0;
  return out;
}

/** The uniform (added to the avatar material's uniforms): x chest, y belly, z shoulder (m). A plain array (three uploads it as a vec3). */
export const chestUniforms = () => ({ uBreathe: { value: [0, 0, 0] } });
export const CHEST_DECL = 'uniform vec3 uBreathe;';
/** The program-cache key suffix (avatar.js chains every splice's key). */
export const chestKey = () => '-chest2108';

const f = (v) => (+v).toFixed(4);
/** Vertex code on `transformed` (bind pose, after the face shape / sway, before skinning): the chest and the belly forward (the chest a little
 * up too) within Gaussian fields on the body's front, both shoulder tops up. Skipped while the uniform is zero. */
export function chestGLSL() {
  const [cy, cx, cr] = C.chestAt, [by, bx, br] = C.bellyAt, [z0, z1] = C.front, [sx, sy, sr] = C.shoulderAt;
  return `
if (uBreathe.x + uBreathe.y + uBreathe.z > 0.00001) { // #2108: breathing (src/avatarchest.js)
  vec3 brQ = transformed;
  float brF = smoothstep(${f(z0)}, ${f(z1)}, brQ.z);
  vec2 brC = vec2(brQ.x / ${f(cx)}, (brQ.y - ${f(cy)}) / ${f(cr)}), brB = vec2(brQ.x / ${f(bx)}, (brQ.y - ${f(by)}) / ${f(br)});
  float brCw = exp(-dot(brC, brC)) * brF, brBw = exp(-dot(brB, brB)) * brF;
  vec3 brS = vec3(abs(brQ.x) - ${f(sx)}, brQ.y - ${f(sy)}, brQ.z) / ${f(sr)};
  transformed.z += uBreathe.x * brCw + uBreathe.y * brBw;
  transformed.y += uBreathe.x * brCw * ${f(C.chestUp)} + uBreathe.z * exp(-dot(brS, brS));
}`;
}

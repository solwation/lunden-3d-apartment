// #2156: skin undertones on the avatars. The look's skin colour is one of ten tones (config.js SKIN_TONES), each with an undertone
// (AVATAR_UNDERTONES: warm / neutral / olive / deep) that sets the colour of the cheek, nose, lip and ear blush, of the backlight
// (sub-surface) glow and of the reddish rim at grazing angles. Three uniforms per avatar material (no mesh, texture or draw call); the
// warm undertone is exactly the old fixed colours, so a look without an extended tone is drawn as before.
import * as THREE from 'three';
import { skinUndertoneOf, skinUndertone, skinToneIndex, SKIN_TONES } from './config.js';

export { skinUndertoneOf, skinUndertone, skinToneIndex, SKIN_TONES };
/** The program cache key's suffix. */
export const toneKey = () => '-tone2156';

/** Fresh uniforms, set to the warm undertone. */
export function toneUniforms() {
  const u = { uSkBlush: { value: new THREE.Vector3() }, uSkSss: { value: new THREE.Vector3() }, uSkSheen: { value: 0 }, uSkRim: { value: new THREE.Vector4() } };
  applyToneLook(u, null);
  return u;
}
/** Sets an avatar material's undertone uniforms from a look. */
export function applyToneLook(u, look) {
  if (!u.uSkBlush) return;
  const t = skinUndertoneOf(look);
  u.uSkBlush.value.set(...t.blush); u.uSkSss.value.set(...t.sss); u.uSkRim.value.set(...t.rim); u.uSkSheen.value = t.sheen ?? 0;
}
/** Fragment declarations (global scope). */
export const toneDecl = () => 'uniform vec3 uSkBlush; uniform vec3 uSkSss; uniform vec4 uSkRim; uniform float uSkSheen; // #2156 (src/avatartone.js)';
/** Roughness chunk: undertones with a sheen take that much off bare skin's roughness. */
export const toneRoughness = () => 'if (uSkSheen > 0.0 && uSuit < 0.5 && vBare > 0.5) roughnessFactor = max(roughnessFactor - uSkSheen, 0.05); // #2156';

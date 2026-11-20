// #2170: makeup on the avatars. No mesh, texture or draw call is added for it:
//  - the lip colour is the lips' own vertex colour (avatar.js avatarModelGeometry, `lipColour`);
//  - eyeliner is the lid margin's vertex colour (`linerWeight` at each lid vertex, in the eye's frame, so it moves with the blinking lid);
//  - mascara (the lashes longer and darker) and blush (the cheeks' soft area) are two uniforms per avatar material, `uMake` and `uBlush`.
// Numbers: config.js AVATAR_MAKEUP. The program key's suffix is `makeupKey`.
import * as THREE from 'three';
import { AVATAR_MAKEUP as M, AVATAR_FACE as FACE, makeupOf } from './config.js';
import { edgeY } from './avatarlids.js';

export { makeupOf };
export const makeupKey = () => '-makeup2170';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The lip colour: `lips` (the skin-derived colour, a THREE.Color) mixed toward the chosen lipstick; unchanged for none. */
export function lipColour(lips, look) {
  const k = makeupOf(look).lip;
  return k ? lips.clone().lerp(new THREE.Color(M.lips.colours[k]), M.lips.mix) : lips;
}

/** How much eyeliner a lid vertex gets (0 … 1): `x`, `y` its place in the eye frame (m from the eyeball's centre, x towards the temple when `out` is +1,
 * the head's widthwise warp already undone), `eye` the look's eye makeup (0 none, 2 / 3 with liner). Over the upper margin a line that thickens towards
 * the temple (the `inner` fade) and flicks out past the corner as a wing; a thinner one under the lower margin. */
export function linerWeight(x, y, out, eye) {
  if (eye < 2) return 0;
  const Z = M.eyes.liner, R = FACE.eye.r, ox = x * out;
  const inner = smooth(-R, -R * Z.inner, ox); // 0 at the inner corner → 1 from `inner` of the half width
  if (y >= 0) {
    const wing = ox > R ? ox - R : 0, d = y - edgeY(x, true) - Z.rise * wing; // (past the corner the line rises)
    const fadeOut = 1 - smooth(0, Z.wing, wing);
    return inner * fadeOut * (1 - smooth(Z.upper[0], Z.upper[1], d));
  }
  if (ox > R) return 0;
  const d = -y + edgeY(x, false); // edgeY(x, false) is negative: d = depth below the lower edge
  return inner * Z.lowerK * (1 - smooth(Z.lower[0], Z.lower[1], d));
}

/** The eyeliner's colour multiplier for weight `w`. */
export const linerShade = (w) => 1 - w * (1 - M.eyes.liner.colour);

/** Fresh uniforms: `uMake` (x lash length factor, y lash darkness 0 … 1), `uBlush` (rgb colour in linear space, a the strength). */
export function makeupUniforms() {
  const u = { uMake: { value: new THREE.Vector2(1, 0) }, uBlush: { value: new THREE.Vector4() } };
  applyMakeupLook(u, null);
  return u;
}
export function applyMakeupLook(u, look) {
  const m = makeupOf(look), mascara = m.eye === 1 || m.eye === 3;
  u.uMake.value.set(mascara ? M.eyes.lash : 1, mascara ? M.eyes.dark : 0);
  const c = new THREE.Color(M.blush.colour);
  u.uBlush.value.set(c.r, c.g, c.b, M.blush.strength[m.blush]);
}
/** Declarations for both stages. */
export const makeupDecl = () => 'uniform vec2 uMake; uniform vec4 uBlush; // #2170 (src/avatarmakeup.js)';
/** Fragment: blush on the face's skin (inside skinShading's face branch, `q` the head-frame position and `skinArea` already made `blushA`) */
export const blushGLSL = () => {
  const [a, b, c] = M.blush.mul;
  return `if (uBlush.a > 0.0) { vec3 bl = diffuseColor.rgb * vec3(${a.toFixed(3)}, ${b.toFixed(3)}, ${c.toFixed(3)}) + uBlush.rgb * ${M.blush.tint.toFixed(3)}; diffuseColor.rgb = mix(diffuseColor.rgb, bl, clamp(blushA * uBlush.a, 0.0, 1.0)); }`;
};
/** Fragment: mascara darkens the lashes (region 9 of the eye part). */
export const mascaraGLSL = (eyePart) => `if (uMake.y > 0.0 && floor(vSurface.x + 0.5) == 9.0 && abs(vSurface.y - ${eyePart.toFixed(1)}) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), uMake.y);`;

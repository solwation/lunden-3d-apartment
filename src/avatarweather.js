// #2018: wet hair and clothes in rain, snow on head and shoulders in snowfall. A tiny state machine per avatar (`wet`, `snow`, both 0 … 1),
// derived locally from the weather and whether the figure is outdoors; uniforms on the avatar's own material, no network field, mesh or draw call.
// Pure helpers (headless-testable) plus the GLSL pieces avatar.js splices in. Numbers: AVATAR_WET in config.js.
import { AVATAR_WET as W } from './config.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** A fresh state: dry and snow-free. */
export const newWet = () => ({ wet: 0, snow: 0 });

/** The shared environment the owner (main.js) updates every frame: what falls now (`rain`, `snow` 0 … 1), the temperature `temp` °C and
 * `outdoorAt(figure)` (true when this figure stands in the open). */
export const wetEnv = { rain: 0, snow: 0, temp: 10, outdoorAt: () => false };

/** Advances `s` by `dt` s: `rain` / `snow` the strength falling (0 … 1), `outdoors` whether the figure is in the open, `temp` °C.
 * Outdoors the falling weather soaks / covers; without it (or indoors) clothes dry and snow melts (a bit of the melt wets them). */
export function stepWet(s, dt, { rain = 0, snow = 0, outdoors = false, temp = 10 } = {}) {
  dt = Math.min(Math.max(dt, 0), W.maxGap);
  if (!(dt > 0)) return s;
  const r = outdoors ? rain : 0, f = outdoors ? snow : 0;
  s.wet += r * W.wetRate * dt;
  s.snow += f * W.snowRate * dt;
  let melt = 0, m = 0;
  if (!outdoors) melt = W.meltIndoor * dt;
  else if (f === 0 && temp > 0) melt = W.meltOutdoor * temp * dt;
  if (melt > 0) { m = Math.min(melt, s.snow); s.snow -= m; s.wet += m * W.meltToWet; }
  if (r === 0 && m === 0) s.wet -= (outdoors ? W.dryOutdoor : W.dryIndoor) * dt;
  s.wet = clamp01(s.wet); s.snow = clamp01(s.snow);
  return s;
}

/** The strengths falling from the weather's `rain` (0 … 1) and `kind` ('rain' | 'snow' | 'hail' | null). */
export function falling(rain, kind) {
  if (kind === 'snow') return { rain: 0, snow: rain };
  if (kind === 'hail') return { rain: rain * W.hail, snow: 0 };
  return { rain: kind === 'rain' ? rain : 0, snow: 0 };
}

export const WET_DECL = 'uniform float uWet, uSnow; varying float vWetUp;';
/** Vertex: the world-up component of the bind-pose normal (shoulders and crown face up). */
export const wetVertex = () => 'vWetUp = normalize(mat3(modelMatrix) * objectNormal).y;';
/** Fragment colour (after the finish): soaked darkens (skin less), then the snow layer on upward faces above the chest. `upperY` = the torso bind height. */
export const wetColor = (upperY) => `{
      float soak = uWet * mix(1.0, ${W.skin.toFixed(3)}, vBare);
      diffuseColor.rgb *= mix(1.0, ${W.darken.toFixed(3)}, soak);
      float up = smoothstep(${W.snowUp[0].toFixed(3)}, ${W.snowUp[1].toFixed(3)}, vWetUp) * step(${(upperY + W.snowFrom).toFixed(4)}, vSuitAt.y);
      float n = fract(sin(dot(floor(vSuitAt * 140.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      wetSnow = smoothstep(0.0, 0.3, up * uSnow * 1.5 - n * ${W.snowPatch.toFixed(3)});
      diffuseColor.rgb = mix(diffuseColor.rgb, ${colour(W.snowColor)}, wetSnow * 0.92);
    }`;
/** Fragment roughness (after the finish): soaked surfaces gloss up, snow is matt. */
export const wetRoughness = () => `roughnessFactor = mix(roughnessFactor, ${W.rough.toFixed(3)}, uWet * mix(1.0, ${W.skin.toFixed(3)}, vBare));
    roughnessFactor = mix(roughnessFactor, ${W.snowRough.toFixed(3)}, wetSnow);`;
function colour(hex) { return `vec3(${[(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => (v / 255).toFixed(4)).join(',')})`; }

// #2173: environment reflections in the avatar's one fragment shader: metal (rings, bracelets, the watch case, earrings, chains, pendants), the
// glasses' frames, the wet eyeball and the clear lenses show the painted room (roomEnv, #307) — a shared texture, no per-avatar one. The
// reflection is added before `outgoingLight *= uLight`, so the local light level (#2017) dims it. Outdoors (the sun share `uEyeLit.y`, #2033) the
// hemisphere light's sky / ground gradient and a sun spot replace the room. The clear lenses (glasses kinds 1 and 2) are drawn with alpha-to-coverage
// like the flyaways (src/avatarflyaway.js: coverage = alpha with MSAA; without it only the strong reflections are kept, others discarded).
// Maths mirrored under node: src/avatarglasses.js. Numbers: AVATAR_ENV in config.js.
import * as THREE from 'three';
import { AVATAR_ENV as E } from './config.js';
import { roomEnv } from './roomprobe.js';

const f = (v) => (+v).toFixed(4);
export const ENV = { on: true };
export const envKey = () => (ENV.on ? '-env2173' : '-envoff');

/** The material's uniform: the shared painted room (null where there is no canvas, e.g. under node). */
export const envUniforms = () => ({ uAvEnv: { value: ENV.on && typeof document !== 'undefined' ? roomEnv() : null } });

/** Fragment declaration + function, after `lights_pars_begin` (it reads the hemisphere and directional lights). */
export const envDecl = () => `uniform sampler2D uAvEnv;
vec3 avEnvAt(vec3 rv, float lod) { // #2173: what a surface reflects: the room, or outdoors the sky, the ground and the sun
  vec3 d = inverseTransformDirection(rv, viewMatrix);
  vec3 col = textureLod(uAvEnv, vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5), lod).rgb;
  #if NUM_HEMI_LIGHTS > 0
  col = mix(col, mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, smoothstep(-0.25, 0.45, d.y)) * ${f(E.outdoor.sky)}, uEyeLit.y);
  #endif
  #if NUM_DIR_LIGHTS > 0
  col += directionalLights[0].color * (pow(max(dot(rv, directionalLights[0].direction), 0.0), ${f(E.outdoor.sunPower)}) * ${f(E.outdoor.sun)} * uEyeLit.y);
  #endif
  return col;
}`;

/** Fragment, inside the eye glint's block (`eN` the eyeball's normal, `eV` the view direction): the room / sky in the wet ball. */
export const eyeEnv = () => ENV.on ? `{ // #2173
        float eFres = 0.3 + 0.7 * pow(1.0 - clamp(dot(eN, eV), 0.0, 1.0), 3.0);
        eG += avEnvAt(reflect(-eV, eN), ${f(E.lod.eye)}) * (${f(E.k.eye)} * eFres);
      }` : '';

/** Fragment, in `opaque_fragment` right after the eye glint and before `outgoingLight *= uLight`: reflections of metal and frames added to the
 * lit colour, the clear lens replacing it. `part` = FACE_PART. */
export function envShade(part) {
  if (!ENV.on) return '';
  const L = E.lens;
  return `if (uSuit < 0.5) { // #2173
      float avP = vSurface.y;
      float avMetal = clamp(vRing + step(${part.studs}.0 - 0.5, avP) * step(avP, ${part.drops}.5) + step(${part.chain}.0 - 0.5, avP) * step(avP, ${part.goldChain}.5) * (1.0 - step(abs(avP - ${part.pearls}.0), 0.5)), 0.0, 1.0);
      float avFrame = step(${part.rimRound}.0 - 0.5, avP) * step(avP, ${part.specs}.5);
      float avLens = step(${part.lensRound}.0 - 0.5, avP) * step(avP, ${part.lensSquare}.5);
      vec3 avV = normalize(vViewPosition), avN = normalize(normal);
      if (avMetal + avFrame > 0.5) {
        float avCos = clamp(dot(avN, avV), 0.0, 1.0);
        vec3 avF0 = mix(vec3(${f(E.f0)}), diffuseColor.rgb, avMetal);
        outgoingLight += avEnvAt(reflect(-avV, avN), mix(${f(E.lod.frame)}, ${f(E.lod.metal)}, avMetal)) * mix(avF0 * (1.0 + 0.5 * pow(1.0 - avCos, 3.0)), avF0 + (1.0 - avF0) * pow(1.0 - avCos, 5.0), 1.0 - avMetal) * // metal keeps its own tint at grazing angles (no white rim)
         mix(${f(E.k.frame)}, ${f(E.k.metal)}, avMetal);
      }
      if (avLens > 0.5) {
        float avCos = abs(dot(avN, avV));
        vec3 avE = avEnvAt(reflect(-avV, avN), ${f(E.lod.lens)});
        float avLuma = dot(avE, vec3(0.3, 0.59, 0.11));
        float avA = ${f(L.head)} + ${f(L.graze - L.head)} * pow(1.0 - avCos, ${f(L.power)}) + ${f(L.glare)} * clamp((avLuma * min(uLight, 1.0) - 0.55) / 0.35, 0.0, 1.0);
        outgoingLight = avE * vec3(${L.tint.map(f).join(', ')}) * ${f(E.k.lens)};
        diffuseColor.a = clamp(avA, 0.0, 1.0);
        if (uFly.y < 0.5 && diffuseColor.a < 0.5) discard; // no MSAA: no partial coverage
      }
    }`;
}

/** Make the lens normals curved (a flat lens would reflect one colour): the normal tilts outwards with the distance from the centre, as on a sphere. */
export function curveLens(g, radius = 0.045) {
  const p = g.attributes.position, n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i) / radius, p.getY(i) / radius, 1).normalize(); n.set([v.x, v.y, v.z], i * 3); }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

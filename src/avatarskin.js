// #2032 (part of #2030): living skin on the avatars. Three GLSL pieces avatar.js splices into its one material (no texture, no mesh,
// no draw call, no network field):
//  - colour: a warmer flush on the ears, the nose, the cheeks and the knuckles / finger joints (a multiplier on the albedo, so it works
//    for every skin tone);
//  - normal: a procedural micro-normal in bind-pose metres (pores as pits of a quasi-periodic wave sum, plus broader shallow dimples the same way), with an
//    analytic gradient so no derivative runs inside the skin branch; each layer fades out by its pixel footprint, so nothing is left to
//    shimmer at distance or while the near figure dithers into the far one (#1966); a little extra roughness in the pits, a shinier nose;
//  - light: a wrapped diffuse past the terminator and a backlight transmission term per directional light, scaled by a thickness per
//    part (ears, nose, fingers), tinted red times √albedo, so ears and nostrils glow reddish against the sun (darker skin a little less).
// Numbers: config.js AVATAR_SKIN_DETAIL. `SKIN_DETAIL.on = false` (before an avatar's material compiles) leaves all three out, for cost tests.
import { AVATAR_SKIN_DETAIL as D } from './config.js';

export const SKIN_DETAIL = { on: true };
/** The program cache key's suffix (a different program with the detail switched off). */
export const skinKey = () => (SKIN_DETAIL.on ? '-skin2067' : '-skinoff');

const f = (v) => (+v).toFixed(8);
const v3 = (a) => `vec3(${a.map(f).join(',')})`;
const TAU = Math.PI * 2;
// Quasi-periodic directions (icosahedral, φ = golden ratio) with slightly different wave numbers and phases: no visible lattice.
const PHI = (1 + Math.sqrt(5)) / 2;
const norm = ([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const PORE_DIRS = [[0, 1, PHI], [1, PHI, 0], [PHI, 0, 1]].map(norm), PORE_K = [1, 1.13, 0.91], PORE_PH = [0, 1.7, 3.1];
const GRAIN_DIRS = [[PHI, 1, 0], [-1, 0, PHI], [0, PHI, -1]].map(norm), GRAIN_K = [1, 1.17, 0.89], GRAIN_PH = [0.4, 2.2, 5.0];

/** The GLSL pieces. `head` / `hand` = the head and left-hand bones' bind positions (Vector3), `part` = avatar.js FACE_PART. */
export function avatarSkinGLSL({ head, hand, part, nose = null }) {
  if (!SKIN_DETAIL.on) return { decl: '', color: '', normal: '', light: '' };
  const isPart = (p) => `(1.0 - step(0.5, abs(vSurface.y - ${p.toFixed(1)})))`;
  const isNose = nose ?? isPart(part.nose); // #2048: the nose is part of the head skin; avatar.js passes its own weight
  const finger = `step(${(part.finger - 0.5).toFixed(1)}, vSurface.y) * step(vSurface.y, ${(part.finger + 19.5).toFixed(1)})`;
  const waves = (dirs, ks, phs, k0, s, g) => dirs.map((d, i) => `skWave(p, ${v3(d)}, ${f(k0 * ks[i])}, ${f(phs[i])}, ${s}, ${g});`).join(' ');
  const [P, Pd] = D.pore, [G, Gd] = D.grain, kP = TAU / P, kG = TAU / G, [c0, c1] = D.fade;
  const decl = `
// #2032 living skin (src/avatarskin.js): one plane wave and its analytic gradient
void skWave(vec3 p, vec3 d, float k, float ph, inout float s, inout vec3 g) { float a = k * dot(p, d) + ph; s += cos(a); g -= sin(a) * k * d; }`;
  // Colour: after skinShading (diffuseColor = the skin's albedo, vBare / vSuitRole / vSuitAt / vSurface known).
  const [cx, cy, cz, cr, cs] = D.cheek, [ky, kw, kk] = D.knuckle, [jy, jw, jk] = D.joint;
  const color = `if (vBare > 0.5 && uSuit < 0.5) { // #2032: warmer flush
        float skRole = floor(vSuitRole + 0.5), skFlush = 0.0;
        if (skRole == 2.0) {
          vec3 q = vSuitAt - ${v3([head.x, head.y, head.z])};
          vec2 c = vec2(abs(q.x) - ${f(cx)}, q.y - ${f(cy)});
          skFlush = ${f(D.ear)} * ${isPart(part.ear)} + ${f(D.nose)} * ${isNose} + ${f(cs)} * exp(-dot(c, c) / ${f(cr * cr)}) * step(${f(cz)}, q.z);
        } else if (skRole == 4.0) {
          float sx = vSuitAt.x < 0.0 ? -1.0 : 1.0;
          vec3 h = vSuitAt - vec3(sx * ${f(hand.x)}, ${f(hand.y)}, ${f(hand.z)});
          float ky = h.y - ${f(ky)}, jy = h.y - ${f(jy)};
          skFlush = (${f(kk)} * exp(-ky * ky / ${f(kw * kw)}) + ${f(jk)} * exp(-jy * jy / ${f(jw * jw)})) * smoothstep(-0.008, 0.002, h.x * sx) * step(abs(h.z), 0.034);
        }
        diffuseColor.rgb *= mix(vec3(1.0), ${v3(D.flush)}, clamp(skFlush, 0.0, 1.0));
      }`;
  // Normal (after normal_fragment_maps): bump from the analytic gradient (as three's perturbNormalArb, height in bind metres).
  const normal = `{ // #2032: pores and grain, only up close
      vec3 skDpx = dFdx(vSuitAt), skDpy = dFdy(vSuitAt), skSx = dFdx(-vViewPosition), skSy = dFdy(-vViewPosition);
      if (vBare > 0.5 && uSuit < 0.5) {
        float skFp = max(length(skDpx), length(skDpy)); // bind metres per pixel
        float skFadeP = 1.0 - smoothstep(${f(P / c0)}, ${f(P / c1)}, skFp), skFadeG = 1.0 - smoothstep(${f(G / c0)}, ${f(G / c1)}, skFp);
        float skLip = 1.0 - step(0.5, abs(floor(vSurface.x + 0.5) - 6.0)), skRole = floor(vSuitRole + 0.5);
        // #2067: dense fine relief, weighted to cheeks/nose; both layers leave lips and lids smooth.
        float skDetail = 0.7;
        if (skRole == 2.0) {
          vec3 q = vSuitAt - ${v3([head.x, head.y, head.z])};
          vec2 cheek = vec2(abs(q.x) - ${f(D.detail.cheek[0])}, q.y - ${f(D.detail.cheek[1])}) / ${f(D.detail.cheek[2])};
          vec2 mouth = vec2(q.x / ${f(D.detail.mouth[1])}, (q.y - ${f(D.detail.mouth[0])}) / ${f(D.detail.mouth[2])});
          float front = smoothstep(0.03, 0.08, q.z);
          skDetail = mix(${f(D.detail.base)}, max(exp(-dot(cheek, cheek)), ${isNose}), front);
          skDetail *= 1.0 - front * exp(-dot(mouth, mouth));
        }
        skDetail *= (1.0 - skLip) * (1.0 - ${isPart(part.eye)});
        skFadeP *= skDetail; skFadeG *= skDetail;
        if (skFadeP + skFadeG > 0.0) {
          vec3 p = vSuitAt, gP = vec3(0.0), gG = vec3(0.0); float sP = 0.0, sG = 0.0;
          ${waves(PORE_DIRS, PORE_K, PORE_PH, kP, 'sP', 'gP')}
          ${waves(GRAIN_DIRS, GRAIN_K, GRAIN_PH, kG, 'sG', 'gG')}
          float pit = max(sP - ${f(D.poreTop)}, 0.0), dimple = max(sG - ${f(D.grainTop)}, 0.0);
          vec3 grad = gP * (-2.0 * pit * ${f(Pd)} * skFadeP) - gG * (2.0 * dimple * ${f(Gd)} * skFadeG);
          vec2 dH = vec2(dot(grad, skDpx), dot(grad, skDpy));
          vec3 R1 = cross(skSy, normal), R2 = cross(normal, skSx);
          float det = dot(skSx, R1) * faceDirection;
          normal = normalize(abs(det) * normal - sign(det) * (dH.x * R1 + dH.y * R2));
          roughnessFactor = clamp(roughnessFactor + ${f(D.poreRough)} * pit / ${f(3 - D.poreTop)} * skFadeP, 0.0, 1.0);
        }
        roughnessFactor = max(roughnessFactor - ${f(D.tZone)} * ${isNose}, 0.05);
      }
    }`;
  // Light (after lights_fragment_end): wrap + backlight transmission for the directional lights (the sun); uLight scales it afterwards.
  const [dist, pow, back] = D.back, T = D.thin, E = D.earRim;
  const light = `#if NUM_DIR_LIGHTS > 0
    if (vBare > 0.5 && uSuit < 0.5) { // #2032: light through thin skin
      vec3 qe = vSuitAt - ${v3([head.x, head.y, head.z])}; float skRim = smoothstep(0.45, 1.0, length(vec2((qe.y - ${f(E.y)}) / ${f(E.h)}, qe.z / ${f(E.w)})));
      float skThin = max(max(${f(T.ear)} * mix(${f(E.inner)}, 1.0, skRim) * ${isPart(part.ear)}, ${f(T.nose)} * ${isNose}), max(${f(T.finger)} * ${finger}, ${f(T.other)}));
      vec3 skTint = sqrt(max(material.diffuseColor, vec3(0.0))) * ${v3(D.sss)};
      for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
        vec3 L = directionalLights[i].direction;
        float ndl = dot(normal, L);
        float wrap = max(0.0, (ndl + ${f(D.wrap)}) / ${f(1 + D.wrap)}) - max(0.0, ndl);
        float through = pow(clamp(dot(geometryViewDir, -normalize(L + normal * ${f(dist)})), 0.0, 1.0), ${f(pow)}) * skThin;
        reflectedLight.directDiffuse += directionalLights[i].color * skTint * (wrap * ${f(D.wrapK)} + through * ${f(back)}) * RECIPROCAL_PI;
      }
    }
    #endif`;
  return { decl, color, normal, light };
}

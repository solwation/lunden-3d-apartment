// #2052 (part of #2042): an anisotropic gloss along the hair strands instead of the general GGX highlight, inside the avatar's one draw.
//  - strand direction: no new attribute. The vertex shader derives a tip-ward tangent per hair vertex from its bind position, inverting
//    the hair shells' own parametrisation (avatar.js hairParts: a ray from AVATAR_HAIR.centre at azimuth a + sweep · sin(πs) and
//    elevation hairline(a) + (90 − hairline(a)) · s): along a strand group (AVATAR_HAIR.flow's clump ridges, a · groups + s · k = const)
//    the azimuth turns by sweep · π · cos(πs) − k / groups per unit s while the elevation climbs 90 − hairline. Below the shell (the long
//    curtain, the curly curtain) the strands hang (meridians); the beard runs down about AVATAR_BEARD.centre, the bun coils round its
//    tilted axis, the brows rise along their own flow (AVATAR_BROW.slope) and a flyaway along its own tangent (its `normal`). The tangent
//    is skinned, taken to view space and passed as one varying (vHairT); the fragment re-orthogonalises it to the shading normal.
//  - gloss: Kajiya-Kay style, two lobes shifted along the normal (Scheuermann 2004): a sharp white primary towards the root and a broader,
//    hair-tinted secondary towards the tip, per scene light inside three's RE_Direct (so the sun's shadow and indoor lights apply), plus
//    the #2039 street lamps' warm light from above. Their shift is jittered per strand group (the bind azimuth about the hair centre,
//    the AVATAR_HAIR.flow group counts) and per fine strand, and the clump ridges' own normals break the band further.
//  - no flicker at distance: the jitter fades by its pixel footprint (fwidth of the bind position) and the lobes broaden and soften with it.
//  - wet hair (#2018 lowers the roughness) sharpens and brightens the gloss.
// The #2040 backlit rim (lights_fragment_end) and the flyaways stay as they were. Numbers: config.js AVATAR_HAIR_GLOSS.
// `HAIR_GLOSS.on = false` (before an avatar's material compiles) leaves the shader part out (the plain GGX highlight), for tests.
import * as THREE from 'three';
import { AVATAR_HAIR_GLOSS as G, AVATAR_HAIR as HAIR, AVATAR_BEARD as BEARD, AVATAR_BROW as BROW, AVATAR_FACE as FACE, AVATAR_SURFACE as SURFACE, AVATAR_LIGHT as LIGHT } from './config.js';

export const HAIR_GLOSS = { on: true };
/** The program cache key's suffix. */
export const glossKey = () => (HAIR_GLOSS.on ? '-gloss2052' : '-glossoff');

const f = (v) => (+v).toFixed(6);
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** A hairstyle's flow (avatar.js hairParts): [sweep ° at the parting of s, clump twist ° per unit s, long (1: sweep by side, curtain
 * edge), bun (1)]. Style 0 short, 1 long, 2 bun, 3 beanie, 4 curly. */
export function glossFlow(style) {
  const F = HAIR.flow, s = style | 0;
  const sweep = s === 0 ? F.sweep : s === 1 ? 12 : s === 2 ? -8 : 0;
  const k = s === 2 ? 7 : -5, groups = s === 1 ? F.longGroups : F.groups;
  const twist = s < 3 ? (-k / groups) * 180 / Math.PI : 0;
  return [sweep, twist, s === 1 ? 1 : 0, s === 2 ? 1 : 0];
}
/** The hairline's elevation (°) at |azimuth| a (°), as hairParts' table (without its small ripple and tufts). */
export function hairlineAt(a) {
  const t = HAIR.hairline; a = Math.abs(a);
  for (let i = 1; i < t.length; i++) if (a <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (a - t[i - 1][0])) / (t[i][0] - t[i - 1][0]);
  return t.at(-1)[1];
}
/** The shell's lower edge (°) for a style: the hairline, or the long curtain's top where the curtain takes over. */
export function shellEdge(a, long) {
  const L = HAIR.long, h = hairlineAt(a);
  return long && Math.abs(a) >= L.from ? Math.max(h, h + (L.top - h) * smooth(L.front, L.back, Math.abs(a))) : h;
}
/**
 * The tip-ward strand direction (unnormalised, head frame) at `q` = the bind position minus the hair centre, for a style's
 * glossFlow `flow` (the JS twin of the vertex GLSL, for tests): along the shell's strand groups, hanging below the shell.
 */
export function strandDir(q, flow) {
  const [sweep, twist, long] = flow, deg = Math.PI / 180;
  const rh = Math.hypot(q[0], q[2]) + 1e-5, th = Math.atan2(q[0], q[2]), el = Math.atan2(q[1], rh), thd = th / deg, eld = el / deg;
  const sw = long ? Math.sign(thd) * sweep : sweep, share = (a) => Math.min(1, Math.max(0, (eld - shellEdge(a, long)) / Math.max(90 - shellEdge(a, long), 1)));
  let a = thd, s = share(a);
  for (let i = 0; i < 2; i++) { a = thd - sw * Math.sin(Math.PI * s); s = share(a); } // the shell's own azimuth parameter (before the sweep)
  const e0 = shellEdge(a, long), slope = Math.min(1.5, Math.max(-1.5, (shellEdge(a + 1, long) - shellEdge(a - 1, long)) / 2)), on = smooth(e0 - G.below, e0 + 2, eld);
  const dth = (sw * Math.PI * Math.cos(s * Math.PI) + twist) * deg * on, de = (Math.max(90 - e0, 1) + slope * twist * (1 - s) * on) * deg;
  const taz = [Math.cos(th), 0, -Math.sin(th)], tel = [-Math.sin(el) * Math.sin(th), Math.cos(el), -Math.sin(el) * Math.cos(th)];
  return [0, 1, 2].map((i) => -(Math.cos(el) * dth * taz[i] + de * tel[i]));
}

/** The material's own uniform: uHairFlow = glossFlow(style). */
export const glossUniforms = () => ({ uHairFlow: { value: new THREE.Vector4(...glossFlow(0)) } });
/** From a look (avatar.js applyFaceShape). */
export function applyGlossLook(u, lk) { if (u.uHairFlow) u.uHairFlow.value.set(...glossFlow(lk?.style ?? 0)); }

const hairlineGlsl = () => {
  const t = HAIR.hairline, rows = [];
  for (let i = 1; i < t.length; i++) rows.push(`if (a <= ${f(t[i][0])}) return mix(${f(t[i - 1][1])}, ${f(t[i][1])}, (a - ${f(t[i - 1][0])}) / ${f(t[i][0] - t[i - 1][0])});`);
  return `float hgLine(float a) { a = abs(a); ${rows.join(' ')} return ${f(t.at(-1)[1])}; }`;
};

/**
 * Vertex: the declarations and, after project_vertex (skinned, transformedNormal and mvPosition known), the view-space strand tangent.
 * `head` the head bone's bind position (Vector3), `region` { hair, beard, brow }, `part` FACE_PART.
 */
export function glossVertex(vs, { head, region, part }) {
  if (!HAIR_GLOSS.on) return vs;
  const hc = head.clone().add(new THREE.Vector3(...HAIR.centre)), bc = head.clone().add(new THREE.Vector3(...BEARD.centre));
  const bun = head.clone().add(new THREE.Vector3(...HAIR.bunAt)), tilt = G.bunTilt, axis = [0, Math.cos(tilt), Math.sin(tilt)];
  const L = HAIR.long, x0 = FACE.brow.at[0] - 0.5 * BROW.length;
  const decl = `uniform vec4 uHairFlow; varying vec3 vHairT;
${hairlineGlsl()}
float hgEdge(float a, float lg) { float h = hgLine(a); return lg > 0.5 && abs(a) >= ${f(L.from)} ? max(h, h + (${f(L.top)} - h) * smoothstep(${f(L.front)}, ${f(L.back)}, abs(a))) : h; }
vec3 hgFlow(vec3 q) { // #2052: tip-ward along the shell's strand groups (src/avatarhairgloss.js strandDir)
  float rh = length(q.xz) + 0.00001, th = atan(q.x, q.z), el = atan(q.y, rh), thd = degrees(th), eld = degrees(el);
  float sw = uHairFlow.z > 0.5 ? sign(thd) * uHairFlow.x : uHairFlow.x, a = thd, e0 = hgEdge(a, uHairFlow.z), s = clamp((eld - e0) / max(90.0 - e0, 1.0), 0.0, 1.0);
  for (int i = 0; i < 2; i++) { a = thd - sw * sin(3.14159265 * s); e0 = hgEdge(a, uHairFlow.z); s = clamp((eld - e0) / max(90.0 - e0, 1.0), 0.0, 1.0); }
  float slope = clamp(0.5 * (hgEdge(a + 1.0, uHairFlow.z) - hgEdge(a - 1.0, uHairFlow.z)), -1.5, 1.5), on = smoothstep(e0 - ${f(G.below)}, e0 + 2.0, eld);
  float dth = radians(sw * 3.14159265 * cos(s * 3.14159265) + uHairFlow.y) * on, de = radians(max(90.0 - e0, 1.0) + slope * uHairFlow.y * (1.0 - s) * on);
  vec3 taz = vec3(cos(th), 0.0, -sin(th)), tel = vec3(-sin(el) * sin(th), cos(el), -sin(el) * cos(th));
  return -(cos(el) * dth * taz + de * tel);
}`;
  const body = `vHairT = vec3(0.0); // #2052 the strand tangent (src/avatarhairgloss.js)
if (uSuit < 0.5) {
  float hgR = floor(region + 0.5);
  bool hgBrow = abs(hgR - ${f(region.brow)}) < 0.5 && abs(facePart - ${f(part.brow)}) < 0.5;
  if (abs(hgR - ${f(region.hair)}) < 0.5 || abs(hgR - ${f(region.beard)}) < 0.5 || hgBrow) {
    vec3 hgD;
    if (flyK > 0.5) hgD = transformedNormal; // a flyaway's normal is its tangent (#2040), already in view space
    else {
      vec3 hgB;
      if (hgBrow) { // the brow's hairs rise by the nose and lie down outwards (avatarbrow.js brSlope)
        float ba = abs(position.x - ${f(head.x)}) / ${f(FACE.warp.width)} - ${f(x0)};
        hgB = vec3(sign(position.x - ${f(head.x)}), ${f(BROW.slope[1])} + ${f(BROW.slope[0] - BROW.slope[1])} * exp(-max(ba, 0.0) / ${f(BROW.settle)}), 0.0);
      } else if (abs(hgR - ${f(region.beard)}) < 0.5) {
        vec3 q = position - ${v3([bc.x, bc.y, bc.z])}; float el = atan(q.y, length(q.xz) + 0.00001), th = atan(q.x, q.z);
        hgB = -vec3(-sin(el) * sin(th), cos(el), -sin(el) * cos(th)); // down the beard's meridians
      } else {
        hgB = hgFlow(position - ${v3([hc.x, hc.y, hc.z])});
        vec3 bq = position - ${v3([bun.x, bun.y, bun.z])};
        if (uHairFlow.w > 0.5 && length(bq) < ${f(G.bunRadius)}) hgB = cross(${v3(axis)}, bq); // the bun's coil
      }
      #ifdef USE_SKINNING
      hgB = mat3(skinMatrix) * hgB;
      #endif
      hgD = mat3(modelViewMatrix) * hgB;
    }
    vec3 hgN = normalize(transformedNormal);
    vHairT = hgD - hgN * dot(hgD, hgN);
    float hgL = length(vHairT);
    vHairT = hgL > 1e-8 ? vHairT / hgL : vec3(0.0);
  }
}`;
  return vs.replace('#include <common>', `#include <common>\n${decl}`).replace('#include <project_vertex>', `#include <project_vertex>\n${body}`);
}

/**
 * Fragment: the lobes (after three's physical light functions: RE_Direct wraps RE_Direct_Physical for hair), the per-fragment strand
 * frame (before the lights), and the street lamps' gloss (before the output). `head` Vector3, `region`, `part` as glossVertex;
 * `lamp` [r, g, b] the #2039 lamp light's colour × gain (default AVATAR_LIGHT.lamp).
 */
export function glossFragment(fs, { head, region, part, lamp = LIGHT.lamp.rgb.map((v) => v * LIGHT.lamp.gain) }) {
  if (!HAIR_GLOSS.on) return fs;
  const hc = head.clone().add(new THREE.Vector3(...HAIR.centre)), P = G.primary, S = G.secondary, J = G.jitter, [ff0, ff1] = G.fade;
  const pars = `varying vec3 vHairT;
// #2052 anisotropic hair gloss (src/avatarhairgloss.js): the strand frame, set in main before the lights
float hgOn = 0.0, hgShift = 0.0, hgFar = 0.0; vec3 hgT = vec3(0.0, 1.0, 0.0);
float hgLobe(vec3 t, vec3 h, float shift, vec3 n, float e) { vec3 ts = normalize(t + n * shift); float c = dot(ts, h); return pow(max(1.0 - c * c, 0.0001), 0.5 * e); }
vec3 hgSpec(vec3 l, vec3 v, vec3 n, vec3 albedo, float rough) {
  vec3 h = normalize(l + v);
  float sharp = clamp(${f(SURFACE.finish.hair)} / max(rough, 0.05), 1.0, ${f(G.wet)}), soft = mix(1.0, ${f(G.far[0])}, hgFar);
  float e1 = ${f(P[1])} * sharp * soft, e2 = ${f(S[1])} * sharp * soft, k = sqrt(sharp) * mix(1.0, ${f(G.far[1])}, hgFar);
  float lit = clamp((dot(n, l) + ${f(G.wrap)}) / ${f(1 + G.wrap)}, 0.0, 1.0);
  float m = max(max(albedo.r, albedo.g), max(albedo.b, 0.004));
  vec3 tint = albedo * inversesqrt(m) * ${f(S[3])}; // the hair's hue at √ its brightness: dark hair keeps little of it
  return lit * k * hgOn * (${f(P[2])} * hgLobe(hgT, h, ${f(P[0])} + hgShift, n, e1) + ${f(S[2])} * tint * hgLobe(hgT, h, ${f(S[0])} + hgShift, n, e2));
}
void RE_Direct_Hair(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  if (hgOn <= 0.0) { RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight); return; }
  float dotNL = saturate(dot(geometryNormal, directLight.direction));
  vec3 irradiance = dotNL * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert(material.diffuseColor);
  reflectedLight.directSpecular += irradiance * BRDF_GGX(directLight.direction, geometryViewDir, geometryNormal, material) * (1.0 - min(hgOn, 1.0))
    + directLight.color * hgSpec(directLight.direction, geometryViewDir, geometryNormal, material.diffuseColor, material.roughness);
}
#undef RE_Direct
#define RE_Direct RE_Direct_Hair`;
  const frame = `if (uSuit < 0.5 && dot(vHairT, vHairT) > 0.01) { // #2052 the strand frame
    float hgR = floor(vSurface.x + 0.5);
    vec3 hgt = vHairT - normal * dot(vHairT, normal); float hgl = length(hgt);
    if (hgl > 0.0001) {
      hgT = hgt / hgl;
      hgOn = abs(hgR - ${f(region.brow)}) < 0.5 ? ${f(G.brow)} * (uFly.y > 0.5 ? 1.0 : browCov) : abs(hgR - ${f(region.beard)}) < 0.5 ? ${f(G.beard)} : 1.0;
      if (vFly.x > 0.5) hgOn *= ${f(G.fly)};
      hgOn *= smoothstep(0.0001, 0.3, hgl);
      vec3 hgq = vSuitAt - ${v3([hc.x, hc.y, hc.z])}; float hga = atan(hgq.x, hgq.z), hgr = max(length(hgq.xz), 0.02);
      float hgfp = length(fwidth(vSuitAt)); // bind metres per pixel
      hgFar = smoothstep(${f(ff0)}, ${f(ff1)}, hgfp);
      float hgc = 1.0 - smoothstep(0.15, 0.4, hgfp * ${f(J[1])} / (6.2832 * hgr)), hgs = 1.0 - smoothstep(0.15, 0.4, hgfp * ${f(J[3])} / (6.2832 * hgr));
      hgShift = ${f(J[0])} * hgc * sin(hga * ${f(J[1])} + hgq.y * ${f(J[2])}) + ${f(J[4])} * hgs * sin(hga * ${f(J[3])} + 2.0 * sin(hga * 5.0 + hgq.y * 60.0));
    }
  }`;
  const [lr, lg, lb] = lamp;
  const lampGloss = `if (uLamp > 0.0 && hgOn > 0.0) outgoingLight += vec3(${f(lr)}, ${f(lg)}, ${f(lb)}) * uLamp * (1.0 - uOutline) * ${f(G.lamp)}
      * hgSpec(normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), normalize(vViewPosition), normal, diffuseColor.rgb, material.roughness); // #2052: the street lamps' gloss`;
  return fs.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${pars}`)
    .replace('#include <lights_fragment_begin>', `${frame}\n#include <lights_fragment_begin>`)
    .replace('#include <opaque_fragment>', `${lampGloss}\n#include <opaque_fragment>`);
}

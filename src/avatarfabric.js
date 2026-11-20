// #2165: each fabric's own finish and the jeans' wear, in the avatar's one fragment shader (no texture, mesh, attribute, draw, uniform or network field).
// The garments already carry a weave kind (#2034: 0 jersey, 1 knit, 2 fleece, 3 denim twill, 4 fine twill; `uClothTop.w` / `uClothPants.w`);
// this gives each kind a roughness and a cheap sheen lobe instead of the one roughness 0.92 every garment shared:
//  - roughness: the kind's value replaces the cloth finish (wet cloth, #2018, still wins: the shift fades with the wetness);
//  - sheen: a fuzz / satin lobe, brighter where the surface turns away from the eye (1 - N·V)^pow, built from the light the lights already
//    summed (direct + ambient diffuse divided by the albedo) so it follows every light and the sun with no light loop; its colour is the
//    cloth's own tinted towards white by `white`. #2211 fades the lobe at the exact silhouette (N·V=0), so loose fibres read
//    as a broad soft highlight rather than a white contour. Knit/fleece still have more sheen than jersey, denim almost none.
// The jeans (kind 3) are also faded and worn: lighter and a little rougher over the front of the knees and thighs, whiskers at the lap and
// honeycombs behind the knees (thin lines, prefiltered by the pixel footprint), pale seams (outseam, inseam) and a worn hem.
// All over the bind-pose position (rides with skinning). Numbers: AVATAR_FABRIC in config.js (guesses). `FABRIC.on = false` (before a
// material compiles) leaves it out, for cost tests. `wearAt` mirrors the GLSL so tools/avatarfabrictest.mjs checks the zones under node.
import { AVATAR_FABRIC as FB, AVATAR_SURFACE as SURFACE } from './config.js';
import { bindAt } from './olof.js';

export const FABRIC = { on: true };
export const fabricKey = () => (FABRIC.on ? '-fabric2165' : '-fabricoff');
const f = (v) => (+v).toFixed(5);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** A weave kind's finish: { rough, sheen, white } (kinds outside the table fall back to jersey's). */
export function fabricFinish(kind) {
  const r = FB.kinds[Math.round(kind)] ?? FB.kinds[0];
  return { rough: r[0], sheen: r[1], white: r[2] };
}

/** The jeans' wear (0 … 1) at bind position p {x, y, z} of the trousers (region 2): `hemY` the leg's hem, `fp` the pixel footprint in metres (0 for
 * the exact value; it fades the whiskers and honeycombs). Mirrors the shader's `fabricWear`. */
export function wearAt(p, hemY, fp = 0) {
  const K = bindAt('kneeL'), W = FB.wear, sx = p.x >= 0 ? 1 : -1;
  const qx = p.x - sx * K.x, qy = p.y - K.y, nl = Math.hypot(qx, p.z) || 1e-4, nx = qx / nl, nz = p.z / nl;
  const front = smooth(0.1, 0.7, nz), out = nx * sx;
  const fine = (period) => 1 - smooth(0.5, 1.4, fp * period);
  const knee = Math.exp(-(qy * qy) / (W.kneeW * W.kneeW)) * front;
  const thigh = Math.exp(-((qy - W.thighY) ** 2) / (W.thighW * W.thighW)) * smooth(0, 0.7, nz);
  const whisk = Math.exp(-((qy - W.lapY) ** 2) / (W.lapW * W.lapW)) * smooth(-0.2, 0.6, nz) * (Math.max(0, 0.5 + 0.5 * Math.sin(qy * W.whiskRate + nx * 9)) ** 4) * fine(W.whiskRate);
  const comb = Math.exp(-(qy * qy) / (W.combW * W.combW)) * smooth(-0.1, -0.7, nz) * (Math.max(0, 0.5 + 0.5 * Math.sin(qy * W.combRate)) ** 3) * fine(W.combRate);
  const dz = nz * W.legR;
  const seam = (smooth(0.3, 0.9, out) + smooth(0.3, 0.9, -out)) * Math.exp(-(dz * dz) / (W.seamW * W.seamW));
  const hem = Math.exp(-((p.y - hemY - W.hemAt) ** 2) / (W.hemW * W.hemW));
  const mottle = 0.5 + 0.5 * Math.sin(p.y * 47 + nx * 11) * Math.sin(p.y * 23 - nz * 9);
  return clamp(W.base * mottle + W.knee * knee + W.thigh * thigh + W.whisker * whisk + W.comb * comb + W.seam * seam + W.hem * hem, 0, 1);
}

/** Fragment declarations (spliced in before main, after `uClothPants`). */
export function fabricDecl() {
  if (!FABRIC.on) return '';
  const K = bindAt('kneeL'), W = FB.wear, k = FB.kinds, fab = (i) => `vec3(${f(k[i][0])}, ${f(k[i][1])}, ${f(k[i][2])})`;
  return `// #2165 fabric finish and jeans wear (src/avatarfabric.js)
vec3 fabricOf(float kind) { return kind < 0.5 ? ${fab(0)} : kind < 1.5 ? ${fab(1)} : kind < 2.5 ? ${fab(2)} : kind < 3.5 ? ${fab(3)} : ${fab(4)}; }
float fabricWear(vec3 p, float hemY, float fp) {
  float sx = p.x >= 0.0 ? 1.0 : -1.0;
  vec3 q = vec3(p.x - sx * ${f(K.x)}, p.y - ${f(K.y)}, p.z); float nl = max(length(q.xz), 0.0001); float nx = q.x / nl, nz = q.z / nl;
  float front = smoothstep(0.1, 0.7, nz), out_ = nx * sx;
  float fw = 1.0 - smoothstep(0.5, 1.4, fp * ${f(W.whiskRate)}), fc = 1.0 - smoothstep(0.5, 1.4, fp * ${f(W.combRate)});
  float knee = exp(-q.y * q.y / ${f(W.kneeW * W.kneeW)}) * front;
  float thigh = exp(-(q.y - ${f(W.thighY)}) * (q.y - ${f(W.thighY)}) / ${f(W.thighW * W.thighW)}) * smoothstep(0.0, 0.7, nz);
  float whisk = exp(-(q.y - ${f(W.lapY)}) * (q.y - ${f(W.lapY)}) / ${f(W.lapW * W.lapW)}) * smoothstep(-0.2, 0.6, nz) * pow(max(0.5 + 0.5 * sin(q.y * ${f(W.whiskRate)} + nx * 9.0), 0.0), 4.0) * fw;
  float comb = exp(-q.y * q.y / ${f(W.combW * W.combW)}) * smoothstep(-0.1, -0.7, nz) * pow(max(0.5 + 0.5 * sin(q.y * ${f(W.combRate)}), 0.0), 3.0) * fc;
  float dz = nz * ${f(W.legR)};
  float seam = (smoothstep(0.3, 0.9, out_) + smoothstep(0.3, 0.9, -out_)) * exp(-dz * dz / ${f(W.seamW * W.seamW)});
  float hem = exp(-(p.y - hemY - ${f(W.hemAt)}) * (p.y - hemY - ${f(W.hemAt)}) / ${f(W.hemW * W.hemW)});
  float mottle = 0.5 + 0.5 * sin(p.y * 47.0 + nx * 11.0) * sin(p.y * 23.0 - nz * 9.0);
  return clamp(${f(W.base)} * mottle + ${f(W.knee)} * knee + ${f(W.thigh)} * thigh + ${f(W.whisker)} * whisk + ${f(W.comb)} * comb + ${f(W.seam)} * seam + ${f(W.hem)} * hem, 0.0, 1.0);
}`;
}

/** Main-scope declarations of the sheen's inputs (set in the cloth block, read at lights_fragment_end). */
export const fabricVars = () => (FABRIC.on ? 'float fbSheen = 0.0, fbWhite = 0.0; // #2165' : '');

/** Cloth-block body (inside `if (cOn > 0.5)`; `g` the garment's vec4, `leg`, `cfp` and `vSuitAt` in scope). */
export function fabricShade() {
  if (!FABRIC.on) return '';
  const W = FB.wear, cloth = SURFACE.finish.cloth;
  return `vec3 fb = fabricOf(g.w);
      roughnessFactor = clamp(roughnessFactor + (fb.x - ${f(cloth)}) * (1.0 - uWet), 0.05, 1.0);
      fbSheen = fb.y; fbWhite = fb.z;
      if (leg && abs(g.w - 3.0) < 0.5 && uSeamKind.y > 0.5) { // the jeans: faded and worn
        float wear = fabricWear(vSuitAt, uSeam.z, cfp) * uSeam.w;
        float l = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
        vec3 faded = clamp(mix(diffuseColor.rgb, vec3(l), ${f(W.desat)}) * ${f(W.lift)} + ${f(W.add)}, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, faded, wear);
        roughnessFactor = clamp(roughnessFactor + wear * ${f(W.rough)} * (1.0 - uWet), 0.05, 1.0);
        fbSheen *= 1.0 - 0.6 * wear;
      }`;
}

/** After lights_fragment_end: the sheen lobe on the light the lights summed (see the header). */
export function fabricLight() {
  if (!FABRIC.on) return '';
  return `if (fbSheen > 0.0) { // #2165
    float fbV = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    vec3 fbIn = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse * ${f(FB.ambient)}) / max(diffuseColor.rgb, vec3(${f(FB.minAlbedo)}));
    reflectedLight.directSpecular += fbIn * mix(diffuseColor.rgb, vec3(1.0), fbWhite) * (fbSheen * ${f(FB.gain)} * pow(fbV, ${f(FB.power)}) * (1.0 - fbV));
  }`;
}

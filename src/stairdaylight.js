import * as THREE from 'three';
import { STAIR_DAYLIGHT as S } from './config.js';

// #2183: daylight and surface detail for the stairwells (Hus A / B / C / L cores). The cores bake ONE artificial-light colour into
// their vertices (MeshBasic); this adds a second baked scalar per vertex, `dayK` = how much of the daylight that falls through the
// core's own glass panes reaches it, blended by one uniform (`uDay`). The shader also modulates the colour with one small shared
// texture sampled in world coordinates (paint grain, a hand-height wear band on walls, polished patches on treads and floors).
// No extra draw call, light or render pass; all four houses share ONE program (`customProgramCacheKey`). Phones skip it (lowMemory).

/** The panes' daylight sources from their geometries (any plane / thin box): centre and half size; the thinnest axis is the normal. */
export function glassSources(geos) {
  const out = [];
  const box = new THREE.Box3();
  for (const g of geos) {
    g.computeBoundingBox(); box.copy(g.boundingBox);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const ax = s.x <= s.z ? 'x' : 'z'; // panes stand upright: the normal lies in the plane
    const w = ax === 'x' ? s.z : s.x;
    out.push({ x: c.x, y: c.y, z: c.z, nx: ax === 'x' ? 1 : 0, nz: ax === 'z' ? 1 : 0, area: Math.max(0.05, w * s.y) });
  }
  return out;
}

/** The daylight share (0…1+) reaching a surface point (x, y, z) with unit normal (nx, ny, nz) from the panes `sources`. Pure. */
export function dayReach(x, y, z, nx, ny, nz, sources, K = S) {
  let k = 0;
  for (const p of sources) {
    const dx = p.x - x, dy = p.y - y, dz = p.z - z, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1e-6;
    const face = Math.max(0, (nx * dx + ny * dy + nz * dz) / d); // 1 = turned straight at the pane
    k += (K.facing + (1 - K.facing) * face) * Math.min(1.6, Math.sqrt(p.area) * 0.7) / (1 + d2 / (K.reach * K.reach));
  }
  return Math.min(1.5, k);
}

/** The blend value the shader gets: the day share (DayCycle.daylight) thinned by an overcast sky; 0 when the effect is off. Pure. */
export function dayBlend(daylight, overcast, on = true, K = S) {
  if (!on) return 0;
  const d = Math.min(1, Math.max(0, daylight)), o = Math.min(1, Math.max(0, overcast));
  return d * (1 - K.overcast * o);
}

/**
 * Add the `dayK` attribute to every NON-INDEXED baked geometry in `geos` (all of them: they are merged afterwards, which needs
 * equal attributes). The face normal comes from the triangle. No sources → zeros (the attribute still exists).
 */
export function addDayAttribute(geos, sources, K = S) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const g of geos) {
    const p = g.attributes.position, out = new Float32Array(p.count);
    if (sources.length) for (let i = 0; i + 2 < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      if (!Number.isFinite(n.x + n.y + n.z)) n.set(0, 0, 0); // a degenerate triangle: no facing term (a NaN would blank the vertex)
      for (let j = 0; j < 3; j++) out[i + j] = dayReach(p.getX(i + j), p.getY(i + j), p.getZ(i + j), n.x, n.y, n.z, sources, K);
    }
    g.setAttribute('dayK', new THREE.BufferAttribute(out, 1));
  }
  return geos;
}

/**
 * The shader's day term on one baked linear colour `rgb` ([r, g, b]) — the same maths as the vertex patch in `patchStairMaterial`,
 * (`dayK` is sharpened by `sharp` so the light gathers round the panes instead of filling a small core evenly),
 * kept here so it can be tested: far from the panes the lamp light is dimmed to `ambient` by day, near them the daylight lifts it by up
 * to `gain` (tinted), and a soft shoulder above `knee` keeps the lift under `cap` with the colour's hue (no blown-out whites). Pure.
 */
export function dayShade(rgb, dayK, day, K = S) {
  const dk = Math.min(1, Math.max(0, dayK)) ** K.sharp, d = dk * day, lamp = 1 + (K.ambient - 1) * day * (1 - dk);
  const c = rgb.map((v) => v * lamp), b = c.map((v, i) => v * (1 + K.gain * d * K.tint[i]));
  const m = Math.max(...b, 1e-4), mc = Math.max(...c);
  const t = m > K.knee ? K.knee + (K.cap - K.knee) * (1 - Math.exp(-(m - K.knee) / (K.cap - K.knee))) : m;
  return b.map((v) => v * (Math.max(t, Math.min(m, mc)) / m));
}

/** The seeded value-noise texture shared by every stairwell material: r = fine grain, g = broad patches (both 0…1, tileable). */
export function detailTexture(size = S.texSize) {
  const grid = (cells, seed) => { // tileable value noise on a cells × cells lattice
    const v = new Float32Array(cells * cells);
    let s = seed; for (let i = 0; i < v.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; v[i] = s / 4294967296; }
    return (u, w) => {
      const x = u * cells, y = w * cells, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), at = (i, j) => v[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
      return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
    };
  };
  const fine = grid(size / 2, 7), fine2 = grid(size / 4, 11), broad = grid(5, 3), data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, w = y / size, i = (y * size + x) * 4;
    data[i] = Math.round(255 * (0.6 * fine(u, w) + 0.4 * fine2(u, w))); data[i + 1] = Math.round(255 * broad(u, w)); data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

/** Shared uniforms (one program for all four houses): main.js sets `uDay` / `uDetail` each frame / on a quality change. */
export const stairDayUniforms = { uDay: { value: 0 }, uDetail: { value: 0 }, uTex: { value: null } };

/** Patch a stairwell's vertex-coloured MeshBasicMaterial. `floors`: this house's storey floor heights (m) for the wear band. */
export function patchStairMaterial(mat, floors, K = S) {
  const f = (v) => v.toFixed(3);
  if (!stairDayUniforms.uTex.value) stairDayUniforms.uTex.value = detailTexture();
  const fl = Array.from({ length: 6 }, (_, i) => (i < floors.length ? floors[i] : -1000));
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, stairDayUniforms, { uFloors: { value: fl } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float dayK; uniform float uDay; varying vec3 vWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_COLOR
{ float dk = pow(clamp(dayK, 0.0, 1.0), ${f(K.sharp)}), d = dk * uDay;
  vec3 c = vColor.rgb * mix(1.0, ${f(K.ambient)}, uDay * (1.0 - dk));
  vec3 b = c * (vec3(1.0) + ${f(K.gain)} * d * vec3(${K.tint.map(f).join(', ')}));
  float m = max(max(b.r, b.g), max(b.b, 1e-4)), mc = max(max(c.r, c.g), c.b);
  float t = m > ${f(K.knee)} ? ${f(K.knee)} + ${f(K.cap - K.knee)} * (1.0 - exp(-(m - ${f(K.knee)}) / ${f(K.cap - K.knee)})) : m;
  vColor.rgb = b * (max(t, min(m, mc)) / m); }
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uTex; uniform float uDetail; uniform float uFloors[6]; varying vec3 vWorld;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (uDetail > 0.0) {
        vec3 dn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float wall = 1.0 - step(0.5, abs(dn.y));
        vec2 puv = mix(vWorld.xz, vec2(vWorld.x + vWorld.z, vWorld.y), wall);
        float fineN = texture2D(uTex, puv * ${K.scale[0].toFixed(3)}).r, broadN = texture2D(uTex, puv * ${K.scale[1].toFixed(3)}).g;
        float band = 0.0;
        for (int i = 0; i < 6; i++) band = max(band, 1.0 - smoothstep(0.0, ${K.wearHalf.toFixed(3)}, abs(vWorld.y - uFloors[i] - ${K.wearHeight.toFixed(3)})));
        float k = 1.0 + ${K.detailAmount.toFixed(3)} * (fineN - 0.5) * 2.0;
        k *= 1.0 - wall * band * ${K.wearAmount.toFixed(3)} * (0.45 + 0.55 * broadN);
        k += (1.0 - wall) * smoothstep(0.55, 0.85, broadN) * ${K.polish.toFixed(3)};
        diffuseColor.rgb *= mix(1.0, k, uDetail);
      }`);
  };
  mat.customProgramCacheKey = () => 'stairdaylight2';
  return mat;
}

import * as THREE from 'three';
import { haloGeometry, haloMaterial } from './lamphalo.js';
import { LIGHTING } from './config.js';

const H = LIGHTING.halo;
const clamp = (v) => Math.max(0, Math.min(1, v));

/** #2203: the same switched lamp has a perceptible halo only against the evening/night room. Exposure compensates
 * its additive (not tone-mapped) sprite so a brighter view does not make the apparent glare stronger. */
export function indoorHaloStrength(daylight, exposure = 1) {
  const night = clamp((H.day[1] - daylight) / (H.day[1] - H.day[0]));
  return H.peak * night * night * (3 - 2 * night) / Math.max(H.exposureMin, exposure);
}

/** Light through a shade is strongest near the bulb, soft at the rim. Radius is the shade's normalised distance
 * from the bulb (0 centre, 1 rim); all materials retain their own hue and any existing folds/cloth texture. */
export function shadeEmissionAt(radius) {
  return H.shadeRim + (1 - H.shadeRim) * Math.exp(-H.shadeFalloff * radius * radius);
}

let radialMap;
function emissionMap() {
  if (radialMap) return radialMap;
  // Cylinder/paper UVs wrap in u: a radial bulb's falloff is a vertical band, continuous at the seam.
  const n = H.textureSize, data = new Uint8Array(n * 4);
  for (let y = 0; y < n; y++) {
    const k = Math.round(255 * shadeEmissionAt(Math.abs((y + 0.5) / n - 0.5) * 2));
    data.set([k, k, k, 255], y * 4);
  }
  radialMap = new THREE.DataTexture(data, 1, n);
  radialMap.minFilter = radialMap.magFilter = THREE.LinearFilter;
  radialMap.needsUpdate = true;
  return radialMap;
}

/** Preserve an existing emissive map (paper folds): combine the radial light with it in the existing material's
 * shader, rather than replacing the map. Untextured shades share one tiny 1×64 emissive map. */
export function shadeEmission(material) {
  if (!material?.emissive || material.userData.shadeEmission) return;
  const previous = material.onBeforeCompile, cache = material.customProgramCacheKey.bind(material);
  const before = material.emissiveMap;
  material.emissiveMap ??= emissionMap();
  const state = material.userData.shadeEmission = { before, enabled: { value: 1 } };
  if (before) {
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.uShadeEmission = state.enabled;
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uShadeEmission;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\nfloat shadeR = abs( vEmissiveMapUv.y - 0.5 ) * 2.0;\ntotalEmissiveRadiance *= mix( 1.0, ${H.shadeRim.toFixed(3)} + ${(1 - H.shadeRim).toFixed(3)} * exp( -${H.shadeFalloff.toFixed(3)} * shadeR * shadeR ), uShadeEmission );`);
    };
    material.customProgramCacheKey = () => `${cache()}-shade-emission2203`;
  }
  material.needsUpdate = true;
}

/** #2203: one instanced quad batch for the real lamp anchors. Position/colour uploads occur only when a moved,
 * switched, faded or recoloured lamp changes. Depth testing keeps walls and shades opaque; never an extra light/pass. */
export class IndoorHalos {
  constructor(entries, { lowMemory = false } = {}) {
    this.entries = entries; this.level = 3; this.daylight = 1; this.enabled = true;
    this.mesh = null;
    if (lowMemory || !entries.length) return;
    const geometry = haloGeometry([0, 0, 0, 0], { drop: 0 });
    const material = haloMaterial(0xffffff, { ...H, instanced: true });
    const mesh = this.mesh = new THREE.InstancedMesh(geometry, material, entries.length);
    mesh.name = 'indoorLampHalos'; mesh.frustumCulled = false; mesh.renderOrder = 3;
    mesh.castShadow = mesh.receiveShadow = false; mesh.raycast = () => {}; mesh.visible = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.matrix = new THREE.Matrix4(); this.colour = new THREE.Color();
    this.on = new Float32Array(entries.length); this.dirty = true;
    const view = new THREE.Vector2();
    mesh.onBeforeRender = (renderer) => {
      const target = renderer.getRenderTarget();
      material.userData.halo.uHaloViewH.value = target ? target.height : renderer.getDrawingBufferSize(view).y;
      material.opacity = this.enabled ? indoorHaloStrength(this.daylight, renderer.toneMappingExposure) : 0;
    };
    entries.forEach((_, i) => mesh.setColorAt(i, this.colour.setRGB(0, 0, 0)));
  }

  set(i, power) { if (this.mesh) this.on[i] = power; }

  commit() {
    const m = this.mesh;
    if (!m) return;
    let any = false, matrices = false, colours = false;
    this.entries.forEach(({ lamp }, i) => {
      const p = lamp.pos, off = i * 16, data = m.instanceMatrix.array;
      if (data[off + 12] !== Math.fround(p.x) || data[off + 13] !== Math.fround(p.y) || data[off + 14] !== Math.fround(p.z) || this.dirty) {
        m.setMatrixAt(i, this.matrix.makeTranslation(p.x, p.y, p.z)); matrices = true;
      }
      this.colour.setHex(lamp.color).multiplyScalar(this.on[i]);
      const c = m.instanceColor.array, j = i * 3;
      if (c[j] !== Math.fround(this.colour.r) || c[j + 1] !== Math.fround(this.colour.g) || c[j + 2] !== Math.fround(this.colour.b)) { m.setColorAt(i, this.colour); colours = true; }
      if (this.on[i] > 0.001) any = true;
    });
    if (matrices) m.instanceMatrix.needsUpdate = true;
    if (colours) m.instanceColor.needsUpdate = true;
    this.dirty = false;
    m.visible = this.enabled && this.level > 0 && this.daylight < H.day[1] && any;
  }
}

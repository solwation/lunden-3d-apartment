import * as THREE from 'three';
import { CAR_FINISH as C } from './config.js';
import { outdoorReflection } from './neighborglass.js';
import { wetSurface } from './wetsurface.js'; // #2175: rain on the paint and trim

// #2097: the parked cars' finish (street car park, streetlife.js; east car parks, eastlot.js; their far LOD, viewlod.js).
// Plain MeshStandardMaterials — no onBeforeCompile of their own, so the lamp wash (#2090) and the LOD dither keep wrapping
// them exactly as before and site instance batching still sees a native vertex stage. The paint reflects the one shared
// procedural outdoor cubemap (neighborglass.js; three prefilters it once for every user), view-dependent with Fresnel and
// blurred by the paint's roughness; the trim batch reads per-part roughness/metalness from an 8 × 1 map through a constant
// uv per part (no new batch or draw). Night dims the reflection (setCarFinishNight, from the day cycle's window update).

export const TRIM_PARTS = Object.keys(C.trim);
const tracked = new Set();
let trimMap = null, night = 0;

/** The outdoor reflection, or null without a DOM (node tests: the materials stay valid, just unreflective). */
const environment = () => (typeof document === 'undefined' ? null : outdoorReflection());

/** u of a trim part's texel in the trim surface map (constant over the part). */
export const trimU = (key) => (TRIM_PARTS.indexOf(key) + 0.5) / TRIM_PARTS.length;

/** The 8 × 1 roughness (G) / metalness (B) map of the trim parts, nearest-sampled, no mipmaps. */
export function trimSurfaceMap() {
  if (trimMap) return trimMap;
  const data = new Uint8Array(TRIM_PARTS.length * 4);
  TRIM_PARTS.forEach((k, i) => { const [r, m] = C.trim[k]; data.set([255, Math.round(r * 255), Math.round(m * 255), 255], i * 4); });
  trimMap = new THREE.DataTexture(data, TRIM_PARTS.length, 1);
  trimMap.magFilter = trimMap.minFilter = THREE.NearestFilter; trimMap.generateMipmaps = false;
  trimMap.name = 'car-trim-surface'; trimMap.needsUpdate = true;
  return trimMap;
}

/** Remember a material whose reflection follows the night (also viewlod.js's clones: userData survives clone()). */
export function trackCarFinish(m) {
  if (m?.userData?.carReflection == null) return m;
  tracked.add(m); m.envMapIntensity = m.userData.carReflection * level();
  return m;
}
const level = () => THREE.MathUtils.lerp(C.reflectionDay, C.reflectionNight, night);
const reflective = (m, k) => { m.envMap = environment(); m.userData.carReflection = k / C.reflectionDay; return trackCarFinish(m); };

/** The four parked-car batch materials: [paint (instance colour), trim (per-part surface map), glass, tyres]. */
export function parkedCarMaterials() {
  const paint = reflective(new THREE.MeshStandardMaterial({ color: new THREE.Color(C.paint.diffuse, C.paint.diffuse, C.paint.diffuse),
    roughness: C.paint.roughness, metalness: C.paint.metalness }), C.reflectionDay);
  wetSurface(paint, 'car'); // #2175: darker, glossier paint with dropwise beads (desktop; a plain material stays plain on phones)
  const trim = reflective(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1,
    roughnessMap: trimSurfaceMap(), metalnessMap: trimSurfaceMap() }), C.reflectionDay * C.trimReflection);
  wetSurface(trim, 'metal');
  return [paint, trim,
    new THREE.MeshStandardMaterial({ color: 0x33495c, roughness: 0.05, metalness: 0.55 }), // glass: as before
    new THREE.MeshStandardMaterial({ color: 0x141517, roughness: C.tyre.roughness })];
}

/** The coarse far car's material (viewlod.js): rougher, dimmer reflection — calm at a distance. */
export function farCarMaterial() {
  return wetSurface(reflective(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: C.far.roughness, metalness: C.far.metalness }),
    C.reflectionDay * C.far.reflection), 'car');
}

/** 0 day … 1 night: every tracked car material's reflection strength (cheap; skipped when unchanged). */
export function setCarFinishNight(n) {
  if (n === night) return;
  night = n;
  const k = level();
  for (const m of tracked) m.envMapIntensity = m.userData.carReflection * k;
}

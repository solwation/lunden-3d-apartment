import * as THREE from 'three';
import { CLOUD_SHADOW as C } from './config.js';

// Cloud shadows (#2102): soft, large patches where the sun's direct light is dimmed, drifting with the wind over the ground, roofs and
// facades whenever the sky is partly cloudy. No pass, texture or program of its own: three's lights chunks are patched once at import
// (like the fog chunks in aerialhaze.js) so the shadow-casting directional light (three sorts it first: index < NUM_DIR_LIGHT_SHADOWS,
// i.e. the sun / moon of main.js) is multiplied by an analytic, periodic value-noise pattern per lit fragment. Every lit built-in
// material (standard, physical, lambert, phong, toon) and every onBeforeCompile variant of them keeps its single program. A fragment
// finds its cloud by following the sun up to a deck CLOUD_SHADOW.height m above it, so a wall and the ground in front of it share one
// moving cloud. Strength 0 (clear sky, full overcast, night, indoors, above / inside the cloud deck, low quality) skips it with one
// uniform branch. Materials whose program has no cloud uniforms (custom ShaderMaterials) read 0 = no effect.

/** Shared uniform values (plain {x,y,z,w} objects: three clones Vector values per material, not these). */
export const cloudShadowUniforms = {
  cloudShadowA: { value: { x: 0, y: 0, z: C.height, w: 0 } }, // drift offset x, z (m, wrapped to the tile), deck height (m), strength
  cloudShadowB: { value: { x: 0, y: 0, z: C.thr[0], w: C.soft } }, // sun slope x, z (sun.xz / sun.y), noise threshold, edge softness
};

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const PARS = /* glsl */`
uniform vec4 cloudShadowA, cloudShadowB;
float csHash( vec2 i, float n ) { i = mod( i, n ); return fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float csNoise( vec2 p, float n ) { // value noise, periodic every n cells (#2102)
	vec2 i = floor( p ), t = fract( p ); t = t * t * ( 3.0 - 2.0 * t );
	return mix( mix( csHash( i, n ), csHash( i + vec2( 1.0, 0.0 ), n ), t.x ), mix( csHash( i + vec2( 0.0, 1.0 ), n ), csHash( i + vec2( 1.0, 1.0 ), n ), t.x ), t.y );
}
float cloudShadowAt( vec3 viewPos ) { // direct-sun factor at a view-space point: 1 = no cloud
	if ( cloudShadowA.w <= 0.0 ) return 1.0;
	vec3 w = cameraPosition + viewPos * mat3( viewMatrix ); // world position
	vec2 p = ( w.xz + cloudShadowB.xy * ( cloudShadowA.z - w.y ) + cloudShadowA.xy ) * ${f(1 / C.cell)};
	float n = 0.62 * csNoise( p, ${f(C.cells)} ) + 0.38 * csNoise( p * 2.0 + vec2( 17.0, 5.0 ), ${f(2 * C.cells)} );
	return 1.0 - cloudShadowA.w * smoothstep( cloudShadowB.z - cloudShadowB.w, cloudShadowB.z + cloudShadowB.w, n );
}
`;
const INFO = 'getDirectionalLightInfo( directionalLight, directLight );';
const HOOK = `${INFO}
		#if ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directLight.color *= cloudShadowAt( geometryPosition ); // #2102
		#endif`;

/** Patch three's lights chunks once (idempotent). Throws if three's chunks changed shape, so a three upgrade cannot silently drop it. */
export function installCloudShadows(T = THREE) {
  const S = T.ShaderChunk;
  if (S.lights_fragment_begin.includes('cloudShadowAt')) return false;
  if (S.lights_fragment_begin.split(INFO).length !== 2 || !S.lights_fragment_begin.includes('vec3 geometryPosition = - vViewPosition;'))
    throw new Error('cloudshadow: unexpected three lights chunks');
  S.lights_pars_begin += PARS;
  S.lights_fragment_begin = S.lights_fragment_begin.replace(INFO, HOOK);
  Object.assign(T.UniformsLib.lights, cloudShadowUniforms); // custom lit ShaderMaterials merge UniformsLib.lights
  for (const k in T.ShaderLib) if (T.ShaderLib[k].uniforms?.directionalLights) Object.assign(T.ShaderLib[k].uniforms, cloudShadowUniforms);
  return true;
}

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const WIND = (() => { const [x, z] = C.wind, l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; })();
const TILE = C.cell * C.cells; // the pattern repeats every TILE m in x and z
const wrap = (v) => ((v % TILE) + TILE) % TILE;

/** Where the clouds are after `t` s: the pattern offset (m, wrapped) and the unwrapped distance travelled along the wind. */
export function cloudDrift(t) {
  const d = C.speed * t;
  return { x: wrap(-WIND.x * d), z: wrap(-WIND.z * d), dx: WIND.x * d, dz: WIND.z * d };
}

/** The cloud-shadow parameters for a sky state (pure; DayCycle feeds it each frame). oc: overcast below the deck 0…1; sunY: the
 * sun's height (unit direction y); off 0…1 (inside the deck / indoors / quality off). Returns { strength, thr, soft, slope: {x, z} }. */
export function cloudShadowState({ sunDir, oc, off = 0 }) {
  const cover = smooth(C.fade[0], C.fade[1], oc) * (1 - smooth(C.solid[0], C.solid[1], oc));
  const strength = C.strength * cover * smooth(C.sun[0], C.sun[1], sunDir.y) * (1 - Math.min(1, Math.max(0, off)));
  const y = Math.max(sunDir.y, 0.12);
  return { strength, thr: C.thr[0] + (C.thr[1] - C.thr[0]) * Math.min(1, Math.max(0, oc)), soft: C.soft, slope: { x: sunDir.x / y, z: sunDir.z / y } };
}

/** Write a state and the drift at time t (s) into the shared uniforms. */
export function applyCloudShadows(s, t) {
  const A = cloudShadowUniforms.cloudShadowA.value, B = cloudShadowUniforms.cloudShadowB.value, d = cloudDrift(t);
  Object.assign(A, { x: d.x, y: d.z, z: C.height, w: s.strength });
  Object.assign(B, { x: s.slope.x, y: s.slope.z, z: s.thr, w: s.soft });
}

// The shader's pattern in JS (tests): the direct-sun factor at world point (x, y, z) for the current uniforms. GLSL's sin/fract hash
// is mirrored with doubles, so values match the GPU closely but not bit for bit.
const hash = (x, z, n) => { x = ((x % n) + n) % n; z = ((z % n) + n) % n; const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(px, pz, n) {
  const ix = Math.floor(px), iz = Math.floor(pz); let tx = px - ix, tz = pz - iz; tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
  const a = hash(ix, iz, n), b = hash(ix + 1, iz, n), c = hash(ix, iz + 1, n), d = hash(ix + 1, iz + 1, n);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}
export function cloudShadowAt(x, y, z) {
  const A = cloudShadowUniforms.cloudShadowA.value, B = cloudShadowUniforms.cloudShadowB.value;
  if (A.w <= 0) return 1;
  const px = (x + B.x * (A.z - y) + A.x) / C.cell, pz = (z + B.y * (A.z - y) + A.y) / C.cell;
  const n = 0.62 * noise(px, pz, C.cells) + 0.38 * noise(px * 2 + 17, pz * 2 + 5, 2 * C.cells);
  return 1 - A.w * smooth(B.z - B.w, B.z + B.w, n);
}

installCloudShadows();

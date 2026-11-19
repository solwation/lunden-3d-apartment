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
/** The noise both the ground shadows and the sky's clouds read (#2154): csField(p) with p in cell units on the deck plane. */
export const CLOUD_NOISE_GLSL = /* glsl */`
float csHash( vec2 i, float n ) { i = mod( i, n ); return fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float csNoise( vec2 p, float n ) { // value noise, periodic every n cells (#2102)
	vec2 i = floor( p ), t = fract( p ); t = t * t * ( 3.0 - 2.0 * t );
	return mix( mix( csHash( i, n ), csHash( i + vec2( 1.0, 0.0 ), n ), t.x ), mix( csHash( i + vec2( 0.0, 1.0 ), n ), csHash( i + vec2( 1.0, 1.0 ), n ), t.x ), t.y );
}
float csField( vec2 p ) { return 0.62 * csNoise( p, ${f(C.cells)} ) + 0.38 * csNoise( p * 2.0 + vec2( 17.0, 5.0 ), ${f(2 * C.cells)} ); }
`;
const PARS = /* glsl */`
uniform vec4 cloudShadowA, cloudShadowB;
${CLOUD_NOISE_GLSL}
float cloudShadowAt( vec3 viewPos ) { // direct-sun factor at a view-space point: 1 = no cloud
	if ( cloudShadowA.w <= 0.0 ) return 1.0;
	vec3 w = cameraPosition + viewPos * mat3( viewMatrix ); // world position
	vec2 p = ( w.xz + cloudShadowB.xy * ( cloudShadowA.z - w.y ) + cloudShadowA.xy ) * ${f(1 / C.cell)};
	float n = csField( p );
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

/** #2117: the deck's drift velocity (m/s, x/z) for the weather's wind ({ x, z } m/s downwind at 10 m): along it at `windScale` × its speed,
 * clamped to `drift`; a calm keeps `last` direction ({ x, z } unit) at the slowest drift; without a wind the fixed `speed` along `wind`. */
export function cloudVelocity(wind, last = WIND) {
  const v = wind ? Math.hypot(wind.x, wind.z) : -1;
  if (v < 0) return { x: WIND.x * C.speed, z: WIND.z * C.speed };
  const s = Math.min(C.drift[1], Math.max(C.drift[0], v * C.windScale));
  return v > 1e-3 ? { x: (wind.x / v) * s, z: (wind.z / v) * s } : { x: last.x * s, z: last.z * s };
}

/** #2117: advance an integrated drift `pos` { x, z, dx, dz, ux, uz } by dt s in the weather's wind (dx, dz wrapped to the tile, so the
 * pattern never jumps and the numbers stay small); x, z = the pattern offset as `cloudDrift` gives it. */
export function stepCloudDrift(pos, dt, wind) {
  const u = { x: pos.ux ?? WIND.x, z: pos.uz ?? WIND.z }, v = cloudVelocity(wind, u), l = Math.hypot(v.x, v.z);
  if (l > 0) { pos.ux = v.x / l; pos.uz = v.z / l; }
  pos.dx = wrap((pos.dx ?? 0) + v.x * dt); pos.dz = wrap((pos.dz ?? 0) + v.z * dt);
  pos.x = wrap(-pos.dx); pos.z = wrap(-pos.dz);
  return pos;
}

/** The cloud-shadow parameters for a sky state (pure; DayCycle feeds it each frame). oc: overcast below the deck 0…1; sunY: the
 * sun's height (unit direction y); off 0…1 (inside the deck / indoors / quality off). Returns { strength, thr, soft, slope: {x, z} }. */
export function cloudShadowState({ sunDir, oc, off = 0 }, out = null) {
  if (!out) out = { strength: 0, thr: 0, soft: 0, slope: { x: 0, z: 0 } }; // `out` (#2136): overwritten instead of allocating (per-frame caller)
  const cover = smooth(C.fade[0], C.fade[1], oc) * (1 - smooth(C.solid[0], C.solid[1], oc));
  const strength = C.strength * cover * smooth(C.sun[0], C.sun[1], sunDir.y) * (1 - Math.min(1, Math.max(0, off)));
  const y = Math.max(sunDir.y, 0.12);
  out.strength = strength; out.thr = C.thr[0] + (C.thr[1] - C.thr[0]) * Math.min(1, Math.max(0, oc)); out.soft = C.soft; out.slope.x = sunDir.x / y; out.slope.z = sunDir.z / y;
  return out;
}

/** #2154: the sky's cloud coverage for the weather's overcast `oc` (0…1), as threshold / softness on the SAME noise the ground shadows
 * read: from `oc` = `sky.ramp` it is exactly the shadows' threshold (so a cloud overhead casts its shadow where the sky shows it);
 * below that the threshold rises to `sky.clearThr` (nothing above a clear sky). Overcast fills the rest through the shader's floor. */
export function skyCloudState(oc, out = null) {
  if (!out) out = { thr: 1, soft: 0 };
  const o = Math.min(1, Math.max(0, oc)), thr = C.thr[0] + (C.thr[1] - C.thr[0]) * o;
  out.thr = C.sky.clearThr + (thr - C.sky.clearThr) * smooth(0, C.sky.ramp, o); out.soft = C.sky.soft;
  return out;
}

/** Write a state and the drift at time t (s) — or an integrated drift { x, z } (stepCloudDrift, #2117) — into the shared uniforms. */
export function applyCloudShadows(s, t) {
  const A = cloudShadowUniforms.cloudShadowA.value, B = cloudShadowUniforms.cloudShadowB.value, d = typeof t === 'number' ? cloudDrift(t) : t;
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
/** The base cloud field at deck-plane world point (x, z) for the drift currently applied (JS mirror of csField; the sky adds fine octaves on top). */
export function cloudFieldAt(x, z) {
  const A = cloudShadowUniforms.cloudShadowA.value, px = (x + A.x) / C.cell, pz = (z + A.y) / C.cell;
  return 0.62 * noise(px, pz, C.cells) + 0.38 * noise(px * 2 + 17, pz * 2 + 5, 2 * C.cells);
}
/** Cloud density 0…1 of the sky in unit direction (dx, dy, dz) seen from (cx, cz), base octaves only: the same plane / offset as the shadows. */
export function skyCloudDensity(dx, dy, dz, cx, cz, s) {
  if (dy < 0.05) return 0;
  return smooth(s.thr - s.soft, s.thr + s.soft, cloudFieldAt(cx + dx / dy * C.height, cz + dz / dy * C.height));
}
export function cloudShadowAt(x, y, z) {
  const A = cloudShadowUniforms.cloudShadowA.value, B = cloudShadowUniforms.cloudShadowB.value;
  if (A.w <= 0) return 1;
  const px = (x + B.x * (A.z - y) + A.x) / C.cell, pz = (z + B.y * (A.z - y) + A.y) / C.cell;
  const n = 0.62 * noise(px, pz, C.cells) + 0.38 * noise(px * 2 + 17, pz * 2 + 5, 2 * C.cells);
  return 1 - A.w * smooth(B.z - B.w, B.z + B.w, n);
}

installCloudShadows();

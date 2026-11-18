import * as THREE from 'three';
import { HAZE } from './config.js';

// Aerial perspective (#2100): the scene's linear fog gets a colour that depends on the view ray and a distance curve that
// depends on the weather. No new pass, texture or program: three's own fog chunks are patched once at import, so every fogged
// material (standard, lambert, basic, points, sprites and the custom fog ShaderMaterials) keeps its single program.
// - Mid-distance haze turns slightly bluer (sky light scattered into the ray) and lightens to the sky's horizon colour at full
//   fog, so far buildings and trees melt into the sky instead of into one flat grey-blue.
// - Towards the sun the haze warms: at full fog it takes exactly the sky shader's horizon glow (+ a small daytime scatter halo
//   the sky shows too), so a hazed silhouette and the sky behind it match at sunrise/sunset.
// - The curve between fog near and far: clear days keep three's smoothstep (lighter haze), overcast/rain lift the mid-range.
// Everything is zero (= three's stock fog) at night, under water, inside the cloud deck and in any program whose material has no
// haze uniforms (UniformsUtils.clone keeps the plain-object values below by reference, so all materials share them).

/** Shared uniform values (plain {x,y,z,w} objects on purpose: three clones Vector/Color values per material, not these). */
export const hazeUniforms = {
  fogHazeSun: { value: { x: 0, y: 1, z: 0, w: 6 } },   // world direction to the sun, w = glow exponent (the sky's pow(s, 6))
  fogHazeWarm: { value: { x: 0, y: 0, z: 0, w: 0 } },  // output-space colour added towards the sun at full fog; w = curve weight
  fogHazeBlue: { value: { x: 0, y: 0, z: 0, w: HAZE.k } }, // output-space colour added at mid haze (peak at fogFactor .5); w = curve k
};

const PARS_V = /* glsl */`
#ifdef USE_FOG
	varying vec3 vFogDir;
#endif`;
const VERT = /* glsl */`
#ifdef USE_FOG
	vFogDir = mvPosition.xyz * mat3( viewMatrix ); // camera-relative world offset (#2100)
#endif`;
const PARS_F = /* glsl */`
#ifdef USE_FOG
	varying vec3 vFogDir;
	uniform vec4 fogHazeSun, fogHazeWarm, fogHazeBlue;
	// #2100: three's smoothstep(near, far) blended towards a normalised exponential build-up (weight w, steepness k)
	float hazeCurve( float d, float near, float far ) {
		float s = smoothstep( near, far, d ), x = clamp( ( d - near ) / max( far - near, 1e-3 ), 0.0, 1.0 );
		float k = max( fogHazeBlue.w, 1e-2 );
		return mix( s, ( 1.0 - exp( - k * x ) ) / ( 1.0 - exp( - k ) ), clamp( fogHazeWarm.w, 0.0, 1.0 ) );
	}
#endif`;
const LINEAR = 'float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );';
const MIX = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';
const FRAG_MIX = /* glsl */`vec3 hazeDir = normalize( vFogDir + vec3( 0.0, 1e-4, 0.0 ) );
	float hazeSun = pow( max( dot( hazeDir, fogHazeSun.xyz ), 0.0 ), max( fogHazeSun.w, 1.0 ) );
	vec3 hazeColor = fogColor + fogHazeBlue.rgb * ( 4.0 * fogFactor * ( 1.0 - fogFactor ) ) + fogHazeWarm.rgb * ( hazeSun * fogFactor );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColor, fogFactor );`;

/** Patch three's fog chunks once (idempotent). Throws if three's chunks changed shape, so a three upgrade cannot silently drop it. */
export function installHaze(T = THREE) {
  const C = T.ShaderChunk;
  if (C.fog_fragment.includes('hazeColor')) return false;
  if (!C.fog_fragment.includes(LINEAR) || !C.fog_fragment.includes(MIX) || !C.fog_vertex.includes('vFogDepth')) throw new Error('aerialhaze: unexpected three fog chunks');
  C.fog_pars_vertex += PARS_V;
  C.fog_vertex += VERT;
  C.fog_pars_fragment += PARS_F;
  C.fog_fragment = C.fog_fragment.replace(LINEAR, 'float fogFactor = hazeCurve( vFogDepth, fogNear, fogFar );').replace(MIX, FRAG_MIX);
  // built-in materials clone ShaderLib uniforms at program creation; custom fog ShaderMaterials merge UniformsLib.fog
  Object.assign(T.UniformsLib.fog, hazeUniforms);
  for (const k in T.ShaderLib) if (T.ShaderLib[k].uniforms?.fogColor) Object.assign(T.ShaderLib[k].uniforms, hazeUniforms);
  return true;
}

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const toOut = (c) => c.clone().convertLinearToSRGB(); // fog is mixed after colorspace_fragment, i.e. in output (sRGB) space
const minus = (a, b) => a.setRGB(a.r - b.r, a.g - b.g, a.b - b.b); // signed (Color.sub clamps at 0)

/** The normalised fog curve of the shader (for tests): 0 … 1 over d from near to far. */
export function hazeCurve(d, near, far, w, k) {
  const s = smooth(near, far, d), x = Math.min(1, Math.max(0, (d - near) / Math.max(far - near, 1e-3))), kk = Math.max(k, 1e-2);
  return s + ((1 - Math.exp(-kk * x)) / (1 - Math.exp(-kk)) - s) * Math.min(1, Math.max(0, w));
}

/** The haze parameters for a sky state (pure; DayCycle feeds it each frame). horizon/glow are linear THREE.Colors as the sky
 * shader gets them; day 0…1, oc overcast 0…1 (below the deck), glowAmt the sky's uGlowAmt, off 0…1 (cloud inside / flash).
 * Returns { sun: Vector3, warm: Color (output space), blue: Color (output space), w, k, scatter: Color (linear, for the sky) }. */
export function hazeState({ sunDir, horizon, glow, glowAmt, day, oc, off = 0 }) {
  const on = 1 - off, clear = day * (1 - oc);
  // a small daytime forward-scatter halo around a low sun (clear sky only), drawn identically by the sky shader
  const scatter = new THREE.Color().setRGB(...HAZE.scatter.color).multiplyScalar(HAZE.scatter.amount * clear * smooth(-0.05, 0.1, sunDir.y) * on);
  const H = horizon, hazeOut = toOut(H);
  const warm = minus(toOut(H.clone().add(glow.clone().multiplyScalar(glowAmt)).add(scatter)), hazeOut).multiplyScalar(on);
  const blue = minus(toOut(H.clone().multiply(new THREE.Color().setRGB(...HAZE.blue))), hazeOut).multiplyScalar(day * (1 - HAZE.overcastBlue * oc) * on);
  const w = (HAZE.clear.w + (HAZE.overcast.w - HAZE.clear.w) * oc) * day * on;
  return { sun: sunDir.clone(), warm, blue, w, k: HAZE.k, scatter };
}

/** Write a hazeState into the shared uniforms. */
export function applyHaze(s) {
  const U = hazeUniforms;
  Object.assign(U.fogHazeSun.value, { x: s.sun.x, y: s.sun.y, z: s.sun.z });
  Object.assign(U.fogHazeWarm.value, { x: s.warm.r, y: s.warm.g, z: s.warm.b, w: s.w });
  Object.assign(U.fogHazeBlue.value, { x: s.blue.r, y: s.blue.g, z: s.blue.b, w: s.k });
}

/** Back to three's stock fog (under water, #1944: its own pulled-in fog colour). */
export function clearHaze() {
  const U = hazeUniforms;
  Object.assign(U.fogHazeWarm.value, { x: 0, y: 0, z: 0, w: 0 });
  Object.assign(U.fogHazeBlue.value, { x: 0, y: 0, z: 0 });
}

installHaze();

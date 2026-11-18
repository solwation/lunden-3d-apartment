// #2089: matt, lightly brushed / powder-coated metal for outdoor railings and handrails. A fragment-only patch of the
// existing MeshStandardMaterial: world-position brush lines and soft cloudiness in roughness (faded to their mean below
// pixel size), a little more roughness with distance and a discreet ambient-lit edge light. No texture, draw, uniform,
// light or per-frame work; vertex positions are unchanged (rememberFragmentCompile). tools/railmetaltest.mjs checks the
// patch against three's own shader sources in Node.
import { RAIL_METAL as R } from './config.js';
import { rememberFragmentCompile } from './vertexcompile.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x)); // GLSL float literal

const VERTEX_HEAD = 'varying vec3 vRailPos;';
const VERTEX_BODY = `vec4 railWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
railWorld = instanceMatrix * railWorld;
#endif
vRailPos = ( modelMatrix * railWorld ).xyz;`;

const FRAGMENT_HEAD = `varying vec3 vRailPos;
float railHash1( float n ) { n = fract( n * 0.1031 ); n *= n + 33.33; n *= n + n; return fract( n ); }
float railHash3( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
float railLine( float x ) { float i = floor( x ), t = fract( x ); t = t * t * ( 3.0 - 2.0 * t ); return mix( railHash1( i ), railHash1( i + 1.0 ), t ); }
float railCloud( vec3 x ) {
  vec3 i = floor( x ), t = fract( x ); t = t * t * ( 3.0 - 2.0 * t );
  return mix( mix( mix( railHash3( i ), railHash3( i + vec3( 1, 0, 0 ) ), t.x ), mix( railHash3( i + vec3( 0, 1, 0 ) ), railHash3( i + vec3( 1, 1, 0 ) ), t.x ), t.y ),
    mix( mix( railHash3( i + vec3( 0, 0, 1 ) ), railHash3( i + vec3( 1, 0, 1 ) ), t.x ), mix( railHash3( i + vec3( 0, 1, 1 ) ), railHash3( i + vec3( 1, 1, 1 ) ), t.x ), t.y ), t.z );
}`;

// After color_fragment: the mask (low-saturation colours only), the brush lines (across a rail: along y on upright
// faces, along x + z on flat ones) and the cloudiness, each faded to 0 once its period nears a pixel.
const FRAGMENT_COLOR = `vec3 railN = normalize( cross( dFdx( vRailPos ), dFdy( vRailPos ) ) );
float railS = ( abs( railN.y ) > 0.7 ? vRailPos.x + vRailPos.z : vRailPos.y ) * ${f(R.streakFreq)};
float railStreak = ( railLine( railS ) * 2.0 - 1.0 ) * ( 1.0 - smoothstep( 0.3, 0.9, fwidth( railS ) ) );
vec3 railP = vRailPos * ${f(R.mottleFreq)};
float railMottle = ( railCloud( railP ) * 2.0 - 1.0 ) * ( 1.0 - smoothstep( 0.3, 0.9, length( fwidth( railP ) ) ) );
float railHi = max( max( diffuseColor.r, diffuseColor.g ), diffuseColor.b ), railLo = min( min( diffuseColor.r, diffuseColor.g ), diffuseColor.b );
float railMask = 1.0 - smoothstep( ${f(R.saturation[0])}, ${f(R.saturation[1])}, railHi > 1e-4 ? ( railHi - railLo ) / railHi : 0.0 );
diffuseColor.rgb *= 1.0 + ${f(R.tint)} * railMottle * railMask;`;

// After roughnessmap_fragment: calm variation, then a floor that rises with distance (no specular sparkle on thin bars).
const FRAGMENT_ROUGHNESS = `float railRough = clamp( roughnessFactor + ${f(R.streak)} * railStreak + ${f(R.mottle)} * railMottle, 0.0, 1.0 );
railRough = max( railRough, mix( 0.0, ${f(R.far)}, smoothstep( ${f(R.near)}, ${f(R.farAt)}, length( vViewPosition ) ) ) );
roughnessFactor = mix( roughnessFactor, railRough, railMask );`;

// Before aomap_fragment (after lights_fragment_end): the edge light, a share of this fragment's ambient/sky irradiance.
const FRAGMENT_RIM = `float railRim = pow( 1.0 - saturate( dot( normal, geometryViewDir ) ), ${f(R.rimPower)} );
reflectedLight.indirectSpecular += ${f(R.rim)} * railRim * railMask * irradiance * RECIPROCAL_PI;`;

/** The source-string patch (exported for the Node test). Throws if three's chunks are missing, so a three upgrade fails loudly. */
export function railMetalShader(shader) {
  const put = (src, anchor, text, after = true) => {
    if (!src.includes(anchor)) throw new Error(`railmetal: missing ${anchor}`);
    return src.replace(anchor, after ? `${anchor}\n${text}` : `${text}\n${anchor}`);
  };
  shader.vertexShader = put(put(shader.vertexShader, '#include <common>', VERTEX_HEAD), '#include <project_vertex>', VERTEX_BODY);
  let s = put(shader.fragmentShader, '#include <common>', FRAGMENT_HEAD);
  s = put(s, '#include <color_fragment>', FRAGMENT_COLOR);
  s = put(s, '#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS);
  shader.fragmentShader = put(s, '#include <aomap_fragment>', FRAGMENT_RIM, false);
  return shader;
}

const cacheKey = () => 'rail-metal-2089';
rememberFragmentCompile(railMetalShader); // fragment-only: vertex positions stay native (detail.js phone culling)
/** Patch a MeshStandardMaterial in place (every railing shares one program per variant) and return it. `roughness`
 * defaults to RAIL_METAL.roughness; pass null to keep the material's own (a mixed vertex-coloured batch). */
export function railMetal(material, roughness = R.roughness) {
  if (roughness !== null) material.roughness = roughness;
  material.onBeforeCompile = railMetalShader;
  material.customProgramCacheKey = cacheKey;
  material.userData.railMetal = true;
  return material;
}

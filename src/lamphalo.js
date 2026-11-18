import * as THREE from 'three';
import { glowMaterial, fadeGlowWithFog } from './groundglow.js';
import { wetUniforms } from './wetground.js';

// #2104: a soft halo round every street/path/road lamp head at night: light without lights. One merged additive mesh of
// camera-facing quads (a billboard per head, expanded in the vertex shader, so no per-frame CPU work or uploads), the shared
// groundglow fall-off texture, fading with the lamps' own glow and into the fog/aerial haze (#2100) like the ground pools.
// - A halo is `size` m (radius) in the world, but never smaller than `minPx` pixels: far away it keeps that footprint and
//   loses brightness by the area it gained (no sub-pixel quads that sparkle while walking).
// - It is drawn `toward` m in front of its head (towards the eye), so the lamp's own housing does not cut it in half.
// - The glass faces down: seen from above (a balcony, a roof) the halo dims to `above`.

/** The quads: per lamp head (`at` = [x, y, z, …] every `stride` floats) four corners at its centre `drop` m below the glass,
 * `haloCorner` = (corner x, corner y, size scale), `scale(i)` = lamp i's size factor. Indexed, two triangles per head. */
export function haloGeometry(at, { drop = 0.05, stride = 4, scale = () => 1 } = {}) {
  const n = Math.floor(at.length / stride), pos = new Float32Array(n * 12), corner = new Float32Array(n * 12), uv = new Float32Array(n * 8), index = [];
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < n; i++) {
    const s = scale(i);
    C.forEach(([cx, cy], k) => {
      const v = i * 4 + k;
      pos.set([at[i * stride], at[i * stride + 1] - drop, at[i * stride + 2]], v * 3);
      corner.set([cx, cy, s], v * 3);
      uv.set([(cx + 1) / 2, (cy + 1) / 2], v * 2);
    });
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('haloCorner', new THREE.BufferAttribute(corner, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

const HALO_VERT_HEAD = /* glsl */`
attribute vec3 haloCorner;
uniform vec4 uHalo; // size m, min pixels, toward m, dim seen from above
uniform float uHaloViewH; // the drawing buffer's height in pixels
varying float vHaloFade;`;
const HALO_VERT = /* glsl */`
vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
float haloDist = max( length( mvPosition.xyz ), 0.1 );
mvPosition.xyz += ( -mvPosition.xyz / haloDist ) * min( uHalo.z, haloDist * 0.5 ); // in front of the housing
float haloPx = 2.0 * max( -mvPosition.z, 0.1 ) / ( projectionMatrix[ 1 ][ 1 ] * max( uHaloViewH, 1.0 ) ); // m per pixel there
float haloR = uHalo.x * haloCorner.z, haloS = max( haloR, uHalo.y * haloPx );
vec3 haloW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
float haloUp = clamp( ( haloW.y - cameraPosition.y ) / max( distance( haloW, cameraPosition ), 0.1 ), -1.0, 1.0 );
vHaloFade = ( haloR * haloR ) / ( haloS * haloS ) * mix( uHalo.w, 1.0, smoothstep( -0.35, 0.15, haloUp ) );
mvPosition.xy += haloCorner.xy * haloS;
gl_Position = projectionMatrix * mvPosition;`;

/** The halos' material: groundglow's additive glow (opacity = the level), fading into the fog, billboarded per head. */
export function haloMaterial(color, { size = 0.9, minPx = 3, toward = 0.3, above = 0.35 } = {}) {
  const material = fadeGlowWithFog(glowMaterial(color));
  material.polygonOffset = false;
  material.side = THREE.FrontSide;
  const uniforms = { uHalo: { value: new THREE.Vector4(size, minPx, toward, above) }, uHaloViewH: { value: 600 } };
  const fogFade = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    fogFade.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    const project = '#include <project_vertex>', alpha = '#include <premultiplied_alpha_fragment>';
    if (!shader.vertexShader.includes(project) || !shader.fragmentShader.includes(alpha)) throw new Error('Halo material: missing chunks');
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${HALO_VERT_HEAD}`).replace(project, HALO_VERT);
    // the fall-off cubed: a bright core round the glass and a long soft tail instead of an even disc
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHaloFade;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= sampledDiffuseColor.r * sampledDiffuseColor.r;')
      .replace(alpha, `gl_FragColor.a *= vHaloFade;\n${alpha}`);
  };
  material.customProgramCacheKey = () => 'street-lamp-halo-v1';
  material.userData.halo = uniforms;
  return material;
}

/** #2104: the street pools' brighter middle right under the head (the falloff × (1 + core × falloff²), so the rim is
 * unchanged), a little stronger on a wet street (`wet` × the #2099 film); fragment-only, its own program cache key. */
export function poolCore(material, { core = 0.7, wet = 0.5 } = {}) {
  const previous = material.onBeforeCompile, uniforms = { uPoolCore: { value: new THREE.Vector2(core, wet) }, uGroundWet: wetUniforms.uGroundWet };
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms = Object.assign(shader.uniforms ?? {}, uniforms);
    const map = '#include <map_fragment>';
    if (!shader.fragmentShader.includes(map)) return; // (a partial shader in tools/streetlighttest.html's fog check)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec2 uPoolCore;\nuniform vec3 uGroundWet;')
      .replace(map, `${map}\ndiffuseColor.rgb *= 1.0 + uPoolCore.x * ( 1.0 + uPoolCore.y * clamp( uGroundWet.x, 0.0, 1.0 ) ) * sampledDiffuseColor.r * sampledDiffuseColor.r;`);
  };
  material.customProgramCacheKey = () => 'street-lamp-pool-core-v1';
  return material;
}

/** One mesh of halos for the heads in `at` (see haloGeometry); hidden until `fade` shows it. */
export function buildLampHalos(at, opts = {}) {
  const mesh = new THREE.Mesh(haloGeometry(at, opts), haloMaterial(opts.color ?? 0xffd9a0, opts));
  mesh.name = 'streetLampHalos';
  mesh.frustumCulled = false; // the quads' corners only exist in the shader; one draw for the whole site
  mesh.renderOrder = 3;       // after the ground pools
  mesh.visible = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.raycast = () => {};
  const size = new THREE.Vector2(), viewH = mesh.material.userData.halo.uHaloViewH;
  mesh.onBeforeRender = (renderer) => { const t = renderer.getRenderTarget(); viewH.value = t ? t.height : renderer.getDrawingBufferSize(size).y; };
  return mesh;
}

/** Follow the lamps' glow level (0 … 1) at `peak` opacity; hidden when off. */
export function fadeHalos(mesh, glow, peak) {
  mesh.material.opacity = glow * peak;
  mesh.visible = glow > 0;
}

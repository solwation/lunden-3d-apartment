// #2205: shallow roller/spray relief in the existing painted shell materials. Artistic assumptions, no displacement.
import * as THREE from 'three';
import { PAINT_SURFACE as P } from './config.js';
import { rememberFragmentCompile } from './vertexcompile.js';

export const paintDetail = { value: 1 };
export function paintDetailAt(distance) {
  const t = Math.max(0, Math.min(1, (distance - P.fade[0]) / (P.fade[1] - P.fade[0])));
  return 1 - t * t * (3 - 2 * t);
}
let texture;
/** One periodic, lightly smoothed height/roughness field; linear R=height and G=roughness deviation about 0.5. */
export function paintPixels() {
  const n = P.size, white = new Float32Array(n * n), out = new Uint8Array(n * n * 4);
  for (let i = 0; i < white.length; i++) {
    let h = (Math.imul(i + P.seed, 374761393) ^ 668265263) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    white[i] = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const at = (x, y) => white[((y + n) % n) * n + (x + n) % n];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = (at(x, y) * 4 + at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 8;
    const j = (y * n + x) * 4;
    out[j] = Math.round(k * 255); out[j + 1] = Math.round((0.5 + (k - 0.5) * P.roughGrain) * 255); out[j + 3] = 255;
  }
  return out;
}
export function paintTexture() {
  if (!texture) {
    texture = new THREE.DataTexture(paintPixels(), P.size, P.size);
    texture.name = 'paint-roller-spray'; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true;
  }
  return texture;
}
/** World projection needs no UV changes on shared/merged walls; only fragment normal/roughness change. */
export function paintSurface(material, ceiling = false) {
  if (material.userData.paintSurface) return material;
  const spec = ceiling ? P.ceiling : P.wall;
  material.userData.paintSurface = ceiling ? 'ceiling' : 'wall';
  const packed = paintTexture();
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = function(shader, renderer) {
    before.call(this, shader, renderer);
    Object.assign(shader.uniforms, { uPaintMap: { value: packed }, uPaintDetail: paintDetail });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPaintPosition;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPaintPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPaintPosition;\nuniform sampler2D uPaintMap;\nuniform float uPaintDetail;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float paintWeight = uPaintDetail * ( 1.0 - smoothstep( ${P.fade[0].toFixed(3)}, ${P.fade[1].toFixed(3)}, length( vViewPosition ) ) );
vec3 paintN = abs( cross( dFdx( vPaintPosition ), dFdy( vPaintPosition ) ) );
vec2 paintUv = ( paintN.y >= max( paintN.x, paintN.z ) ? vPaintPosition.xz : ( paintN.x > paintN.z ? vPaintPosition.zy : vPaintPosition.xy ) ) / ${spec.tile.toFixed(5)};
vec2 paintUvDx = dFdx( paintUv ), paintUvDy = dFdy( paintUv );
vec4 paintSample = vec4( 0.5 );
if ( paintWeight > 0.0 ) {
  paintSample = textureGrad( uPaintMap, paintUv, paintUvDx, paintUvDy );
  roughnessFactor = clamp( roughnessFactor + ( paintSample.g - 0.5 ) * ${P.roughness.toFixed(4)} * paintWeight, 0.04, 1.0 );
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 paintDx = dFdx( -vViewPosition ), paintDy = dFdy( -vViewPosition );
float paintHeight = paintSample.r * ${spec.depth.toFixed(6)};
vec2 paintDh = vec2( dFdx( paintHeight ), dFdy( paintHeight ) );
if ( paintWeight > 0.0 ) {
  vec3 paintR1 = cross( paintDy, normal ), paintR2 = cross( normal, paintDx );
  float paintDet = dot( paintDx, paintR1 );
  vec3 paintGrad = sign( paintDet ) * ( paintDh.x * paintR1 + paintDh.y * paintR2 );
  normal = normalize( abs( paintDet ) * normal - paintGrad * paintWeight );
}`);
  };
  rememberFragmentCompile(material.onBeforeCompile, before);
  const base = key === THREE.Material.prototype.customProgramCacheKey ? () => before.toString() : key;
  material.customProgramCacheKey = function() { return `${base.call(this)}|paint2205-${ceiling ? 'ceiling' : 'wall'}`; };
  material.needsUpdate = true;
  return material;
}

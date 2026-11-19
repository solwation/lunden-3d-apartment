// #2148: turns a bicycle mesh's wheels, crank (pedals stay level) and steered parts in the VERTEX SHADER, from the `aBike` attribute
// (part, steered; bikeride.js bikeVertexParts) and the per-bicycle uniform `uBike` = (wheel, crank, steer): no extra draw call, no CPU rewrite.
// One material (and uniform) per bicycle - three.js re-uploads a built-in material's uniforms only when the material changes between
// draws - sharing one program (the cache key).
import * as THREE from 'three';
import { BIKE_RIDE as R } from './config.js';
import { bikeVertexParts } from './bikeride.js';

/** Give `geometry` the `aBike` attribute (kind: 'frame' | 'tyres' | 'metal' | 'spokes' | 'any', see bikeVertexParts). */
export function addBikeParts(geometry, kind) {
  const n = geometry.attributes.position.count, { parts, steered } = bikeVertexParts(geometry.attributes.position.array, kind, n), b = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { b[i * 2] = parts[i]; b[i * 2 + 1] = steered[i]; }
  geometry.setAttribute('aBike', new THREE.BufferAttribute(b, 2));
  return geometry;
}

/** Patch a Lambert / Basic `material` (vertex colours) so that it turns by `uniform.value` (Vector4: wheel, crank, steer). Returns the uniform. */
export function turnableBikeMaterial(material) {
  const uBike = { value: new THREE.Vector4() }, k = R.steerPivotX.toFixed(3), previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uBike = uBike;
    shader.vertexShader = 'attribute vec2 aBike;\nuniform vec4 uBike;\nvec2 bikeRot(vec2 p, vec2 c, float a) { float s = sin(a), k = cos(a); vec2 d = p - c; return c + vec2(d.x * k - d.y * s, d.x * s + d.y * k); }\n'
      + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float bikePart = aBike.x;
  if (bikePart > 0.5 && bikePart < 1.5) transformed.xy = bikeRot(transformed.xy, vec2(-0.5, 0.34), uBike.x);
  else if (bikePart > 1.5 && bikePart < 2.5) transformed.xy = bikeRot(transformed.xy, vec2(0.42, 0.34), uBike.x);
  else if (bikePart > 2.5 && bikePart < 3.5) transformed.xy = bikeRot(transformed.xy, vec2(-0.05, 0.36), uBike.y);
  else if (bikePart > 3.5) { float c0 = transformed.y > 0.36 ? 0.53 : 0.19, dy = c0 - 0.36; transformed.xy = vec2(-0.05 - dy * sin(uBike.y), 0.36 + dy * cos(uBike.y)) + vec2(transformed.x + 0.05, transformed.y - c0); }
  if (aBike.y > 0.5) { float k = cos(uBike.z), s = sin(uBike.z), dx = transformed.x - ${k}; transformed.x = ${k} + dx * k + transformed.z * s; transformed.z = -dx * s + transformed.z * k; }`);
  };
  material.customProgramCacheKey = () => 'bike-turn-2148-' + material.type;
  return uBike;
}

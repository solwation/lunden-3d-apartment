import { Vector2 } from 'three';
import { NAMES } from './olof.js';

/** The real resting body is shown only after the eye reaches its furniture anchor. */
export function restBodyReady(rest, playing = true) {
  const s = rest.spot;
  return !!(playing && rest.active && rest.t >= 1 && s && !s.gymPose && !s.gymWirePose && (s.kind === 'sit' || s.kind === 'lie'));
}

/** One program for all looks/views. Reuse skin labels: no new geometry, attributes or textures. */
export function installSelfView(material) {
  const uniform = material.userData.u.uSelfView = { value: new Vector2() };
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
  const head = NAMES.indexOf('head'), arm0 = NAMES.indexOf('shoulderL'), arm1 = NAMES.indexOf('handR');
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.uSelfView = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSelfPart;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSelfPart.x = max(dot(skinWeight, vec4(1.0) - step(vec4(0.5), abs(skinIndex - vec4(${head}.0)))), step(0.5, facePart) * (1.0 - step(39.5, facePart)));
        // The first sewn sleeve row has torso-only weights, but retains its authored arm centre.
        vSelfPart.y = max(step(0.001, abs(armPump.x)), dot(skinWeight, step(vec4(${arm0}.0 - 0.5), skinIndex) * step(skinIndex, vec4(${arm1}.0 + 0.5))));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uSelfView; varying vec2 vSelfPart;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if ((uSelfView.x > 0.5 && vSelfPart.x > 0.5) || (uSelfView.y > 0.5 && vSelfPart.y > 0.00001)) discard;
        // Only our body has this inner near plane: no shirt/shoulder surface through the eye.
        // The scene, camera, held hands and the complete mirror body keep their existing near plane.
        if (uSelfView.x > 0.5 && vViewPosition.z < 0.30) discard;`);
  };
  material.customProgramCacheKey = function () { return key.call(this) + '-selfview2080'; };
}

import * as THREE from 'three';
import { PERF } from './config.js';
import { hasNativeVertexCompile } from './vertexcompile.js';

const positions = new WeakMap(), instances = new WeakMap();
const finiteBox = box => Number.isFinite(box.min.x + box.min.y + box.min.z + box.max.x + box.max.y + box.max.z);
function bounds(geometry) {
  const p = geometry?.attributes.position;
  if (!p || p.isInterleavedBufferAttribute || p.isGLBufferAttribute || p.itemSize !== 3 || p.normalized ||
      !(p.array instanceof Float32Array) || p.usage !== THREE.StaticDrawUsage ||
      p.getX !== THREE.BufferAttribute.prototype.getX || p.getY !== THREE.BufferAttribute.prototype.getY ||
      p.getZ !== THREE.BufferAttribute.prototype.getZ) return null;
  let entry = positions.get(geometry);
  if (!entry || entry.p !== p || entry.array !== p.array || entry.version !== p.version || entry.count !== p.count) {
    const box = new THREE.Box3().setFromBufferAttribute(p);
    if (box.isEmpty() || !finiteBox(box)) return null;
    entry = {p, array:p.array, version:p.version, count:p.count, box}; positions.set(geometry, entry);
  }
  return entry.box;
}

/** Additional exact-box color-frustum proof. Original masks still drive shadows and physical rays. */
export function installTightFrustum(renderer) {
  const control = {enabled:true};
  const render = renderer.render, shadow = renderer.shadowMap.render;
  let active = null;
  const restore = state => { for (const q of state) q.object.layers.mask = q.mask; };
  const hide = state => { for (const q of state) q.object.layers.mask = 0; };
  renderer.shadowMap.render = function (...args) {
    if (!active) return shadow.apply(this, args);
    // Must wrap OUTSIDE shadow tiles: they copy the original parent's mask here.
    const state = active, suspended = state.suspended; state.suspended = true; restore(state);
    try { return shadow.apply(this, args); } finally { state.suspended = suspended; if (!suspended) hide(state); }
  };
  renderer.render = function (scene, camera, ...args) {
    // A nested reflection needs its own complete population, including objects behind the main camera.
    const parent = active;
    if (parent) restore(parent);
    active = null;
    try {
      if (!control.enabled || camera.layers.mask !== 1 || camera.isArrayCamera ||
          !(camera.isPerspectiveCamera || camera.isOrthographicCamera) ||
          scene.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || renderer.getRenderTarget()) {
        return render.call(this, scene, camera, ...args);
      }
      if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
      if (!camera.parent && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
      const box = new THREE.Box3(), part = new THREE.Box3(), matrix = new THREE.Matrix4();
      const state = []; active = state;
      scene.traverseVisible(object => {
        if (!(object.isMesh || object.isLineSegments) || object.isSkinnedMesh || object.isBatchedMesh || !object.frustumCulled ||
            !object.layers.test(camera.layers) || object.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
            object.onAfterRender !== THREE.Object3D.prototype.onAfterRender || object.geometry?.morphAttributes.position?.length) return;
        // The entrance adapter owns both its color proxies and original shadow masks.
        for (let p = object; p; p = p.parent) if (p.name === 'entrance-plants') return;
        const materials = [object.material].flat();
        if (!materials.length || materials.some(m => !m || m.isShaderMaterial || m.isRawShaderMaterial ||
            m.displacementMap || m.onBeforeRender !== THREE.Material.prototype.onBeforeRender || !hasNativeVertexCompile(m))) return;
        // Keep native sphere culling; only refine its false positives with the full actual vertex box.
        if (!frustum.intersectsObject(object)) return;
        const local = bounds(object.geometry); if (!local) return;
        if (object.isInstancedMesh) {
          if (object.getMatrixAt !== THREE.InstancedMesh.prototype.getMatrixAt || object.morphTexture) return;
          const attribute = object.instanceMatrix;
          let entry = instances.get(object);
          if (!entry || entry.local !== local || entry.attribute !== attribute || entry.array !== attribute.array ||
              entry.version !== attribute.version || entry.count !== object.count) {
            box.makeEmpty();
            for (let i = 0; i < object.count; i++) {
              object.getMatrixAt(i, matrix); box.union(part.copy(local).applyMatrix4(matrix));
            }
            entry = {local, attribute, array:attribute.array, version:attribute.version, count:object.count, box:box.clone()};
            instances.set(object, entry);
          }
          box.copy(entry.box);
        } else box.copy(local);
        box.applyMatrix4(object.matrixWorld);
        if (box.isEmpty() || !finiteBox(box)) return;
        // Numerical guard for Float32 shader transforms, independent of quality/distance/LOD.
        box.expandByScalar(PERF.frustumPad);
        if (!frustum.intersectsBox(box)) state.push({object, mask:object.layers.mask});
      });
      hide(state);
      return render.call(this, scene, camera, ...args);
    } finally {
      if (active) restore(active);
      active = parent;
      if (parent && !parent.suspended) hide(parent);
    }
  };
  return control;
}

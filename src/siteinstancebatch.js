import * as THREE from 'three';
import { hasNativeVertexCompile } from './vertexcompile.js';
import { wholeBoxOccluded } from './occlusion.js';
import { PERF } from './config.js';

// Only these fixed environment batches participate. Car LOD owns its original buffers/counts/hysteresis.
const selected = o => /^tree-(trunks|birches|crowns) /.test(o.name) || /^streetLamp(Posts|Heads)$/.test(o.name) || o.userData.carBatch || o.name === 'car-far';
const finite = box => Number.isFinite(box.min.x + box.min.y + box.min.z + box.max.x + box.max.y + box.max.z);
function native(source) {
  const g = source.geometry, p = g?.attributes.position, m = source.material;
  if (!source.isInstancedMesh || !source.frustumCulled || source.morphTexture || g.morphAttributes.position?.length ||
      !p || p.isInterleavedBufferAttribute || p.normalized || p.itemSize !== 3 || !(p.array instanceof Float32Array) ||
      p.usage !== THREE.StaticDrawUsage || p.getX !== THREE.BufferAttribute.prototype.getX ||
      p.getY !== THREE.BufferAttribute.prototype.getY || p.getZ !== THREE.BufferAttribute.prototype.getZ ||
      Array.isArray(m) || !m || m.transparent || m.isShaderMaterial || m.isRawShaderMaterial || m.displacementMap ||
      !hasNativeVertexCompile(m) || m.onBeforeRender !== THREE.Material.prototype.onBeforeRender || g.attributes.plantWind ||
      source.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || source.onAfterRender !== THREE.Object3D.prototype.onAfterRender ||
      source.getMatrixAt !== THREE.InstancedMesh.prototype.getMatrixAt || !(source.instanceMatrix.array instanceof Float32Array) ||
      !Number.isInteger(source.count) || source.count < 0 || source.count > source.instanceMatrix.count ||
      (source.instanceColor && (!(source.instanceColor.array instanceof Float32Array) || source.instanceColor.count < source.count))) return false;
  // Renderer-time LOD gates may rewrite their children's masks after packing. Leave those sources native.
  for (let parent = source.parent; parent; parent = parent.parent) if (parent.isLOD) return false;
  return true;
}
// Instancing's normal shader assumes orthogonal axes. Keep non-uniform/sheared/reflected source frames native.
function uniformFrame(matrix) {
  const e = matrix.elements, x = new THREE.Vector3(e[0], e[1], e[2]), y = new THREE.Vector3(e[4], e[5], e[6]), z = new THREE.Vector3(e[8], e[9], e[10]);
  const scale = x.lengthSq(), tolerance = 1e-8 * scale;
  return scale > 0 && matrix.determinant() > 0 && Math.abs(y.lengthSq() - scale) <= tolerance &&
    Math.abs(z.lengthSq() - scale) <= tolerance && Math.abs(x.dot(y)) <= tolerance &&
    Math.abs(x.dot(z)) <= tolerance && Math.abs(y.dot(z)) <= tolerance;
}

/** Main-color compaction of complete existing site instances; originals retain shadows, physical rays and LOD state. */
export function installSiteInstanceBatch(renderer, scene, occluders = () => []) {
  const groups = new Map(), sources = [];
  scene.traverse(o => {
    if (!selected(o) || !native(o)) return;
    const key = `${o.geometry.uuid}/${o.material.uuid}/${o.receiveShadow}/${!!o.instanceColor}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o); sources.push(o);
  });
  const capacities = new WeakMap(sources.map(o => [o, o.instanceMatrix.count]));
  const root = new THREE.Group(); root.name = 'site-instance-batches'; root.visible = false;
  scene.add(root);
  const batches = [...groups.values()].map(meshes => {
    const first = meshes[0], capacity = meshes.reduce((n, o) => n + o.instanceMatrix.count, 0);
    const batch = new THREE.InstancedMesh(first.geometry, first.material, capacity);
    batch.name = 'site-instance-' + first.name.split(' ')[0];
    batch.receiveShadow = first.receiveShadow; batch.castShadow = false;
    batch.frustumCulled = false; // every submitted instance already passed its complete-box test
    batch.raycast = () => {};
    if (first.instanceColor) batch.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    root.add(batch); return { meshes, batch };
  });
  const matrix = new THREE.Matrix4(), world = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  const part = new THREE.Box3(), frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
  const shown = o => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return o.material.visible !== false; } return false; };
  const boxes = new WeakMap();
  function pack(camera) {
    if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
    if (!camera.parent && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
    root.updateWorldMatrix(true, false); inverse.copy(root.matrixWorld).invert();
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
    const opaque = occluders(), eye = camera.getWorldPosition(new THREE.Vector3()), used = [];
    for (const { meshes, batch } of batches) {
      let n = 0;
      for (const source of meshes) {
        if (!native(source) || source.geometry !== batch.geometry || source.material !== batch.material ||
            source.receiveShadow !== batch.receiveShadow || !!source.instanceColor !== !!batch.instanceColor || !uniformFrame(source.matrixWorld) || !uniformFrame(root.matrixWorld) ||
            source.instanceMatrix.count !== capacities.get(source) || !shown(source) || !source.layers.test(camera.layers) || (source.frustumCulled && !frustum.intersectsObject(source))) continue;
        const p = source.geometry.attributes.position;
        let entry = boxes.get(source.geometry);
        if (!entry || entry.p !== p || entry.array !== p.array || entry.version !== p.version || entry.count !== p.count) {
          entry = {p, array: p.array, version: p.version, count: p.count, box: new THREE.Box3().setFromBufferAttribute(p)};
          boxes.set(source.geometry, entry);
        }
        const box = entry.box;
        if (box.isEmpty() || !finite(box)) continue;
        const start = n; let valid = true;
        for (let i = 0; i < source.count; i++) {
          source.getMatrixAt(i, matrix); world.multiplyMatrices(source.matrixWorld, matrix);
          part.copy(box).applyMatrix4(world).expandByScalar(PERF.frustumPad);
          if (!finite(part)) { n = start; valid = false; break; }
          if (!frustum.intersectsBox(part) || (part.distanceToPoint(eye) > PERF.detail.minDist && wholeBoxOccluded(eye, part, opaque, PERF.detail.occlusionMargin))) continue;
          batch.setMatrixAt(n, matrix.multiplyMatrices(inverse, world));
          if (batch.instanceColor) {
            const c = source.instanceColor;
            for (let k = 0; k < 3; k++) batch.instanceColor.array[n * 3 + k] = c ? c.array[i * 3 + k] : 1;
          }
          n++;
        }
        if (valid) used.push(source);
      }
      batch.count = n; batch.visible = n > 0; batch.instanceMatrix.needsUpdate = true;
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    }
    return used;
  }
  let active = null;
  const restore = state => state.sources.forEach((o, i) => { o.layers.mask = state.masks[i]; });
  const hide = () => active.sources.forEach(o => { o.layers.mask = 0; });
  const render = renderer.render, shadow = renderer.shadowMap.render;
  renderer.shadowMap.render = function (...args) {
    if (!active) return shadow.apply(this, args);
    const state = active; state.suspended = true; restore(state);
    try { return shadow.apply(this, args); }
    finally { state.suspended = false; hide(); }
  };
  const control = { enabled: true, root, sources };
  renderer.render = function (renderScene, camera, ...args) {
    const parent = active;
    // Reflections/targets and all-layer warm-up retain the original complete population.
    if (parent) { restore(parent); root.visible = false; active = null; }
    try {
      if (parent || scene.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || !control.enabled || renderScene !== scene || camera.layers.mask !== 1 || camera.isArrayCamera ||
          !(camera.isPerspectiveCamera || camera.isOrthographicCamera) || renderer.getRenderTarget()) {
        return render.call(this, renderScene, camera, ...args);
      }
      const used = pack(camera); active = { sources: used, masks: used.map(o => o.layers.mask), suspended: false };
      root.visible = true; hide();
      return render.call(this, renderScene, camera, ...args);
    } finally {
      if (active) restore(active);
      active = parent;
      root.visible = !!parent;
      if (parent && !parent.suspended) hide();
    }
  };
  return control;
}

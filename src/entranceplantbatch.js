import * as THREE from 'three';
import { PLANT_WIND } from './config.js';

/** Color-only batching of the fixed L entrance pots/soil and opted-in foliage. Original meshes remain the physical and shadow sources. */
export function installEntrancePlantBatch(renderer, plants, {foliage = false} = {}) {
  if (!plants?.userData.records?.length) return null;
  const root = new THREE.Group(); root.name = 'entrance-rigid-batches'; root.userData.enabled = true; root.userData.foliage = foliage;
  const groups = new Map(), sources = [], windSources = new Set();
  for (const {model} of plants.userData.records) for (const mesh of model.children.filter((m, i) => i < 2 || (foliage && m.geometry?.attributes.plantWind))) {
    if (mesh.geometry.attributes.plantWind) windSources.add(mesh);
    const key = `${mesh.geometry.uuid}/${mesh.material.uuid}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh); sources.push(mesh);
  }
  const inverse = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  const batches = [...groups.values()].map(meshes => {
    const first = meshes[0], batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    const wind = windSources.has(first);
    batch.name = wind ? 'entrance-foliage-color' : 'entrance-rigid-color'; batch.castShadow = false; batch.receiveShadow = first.receiveShadow;
    batch.customDepthMaterial = first.customDepthMaterial; batch.customDistanceMaterial = first.customDistanceMaterial;
    // Compression can recompute a source sphere after windShadow. Never mutate/trust that sphere for a new proxy.
    const envelope = wind ? new THREE.Box3().setFromBufferAttribute(first.geometry.attributes.position) : null;
    if (envelope) { envelope.min.x -= PLANT_WIND.maxDisplacement; envelope.max.x += PLANT_WIND.maxDisplacement; envelope.min.z -= PLANT_WIND.maxDisplacement; envelope.max.z += PLANT_WIND.maxDisplacement; }
    batch.raycast = () => {}; // physical layer-7 traces still hit each original mesh exactly once
    root.add(batch); return {meshes, batch, envelope};
  });
  plants.add(root);
  const shown = mesh => {
    for (let o = mesh; o; o = o.parent) if (!o.visible) return false;
    return mesh.material.visible !== false;
  };
  let renderFoliage = foliage;
  const union = new THREE.Box3(), transformed = new THREE.Box3(), stored = new THREE.Matrix4();
  function pack(all = false) {
    plants.updateWorldMatrix(true, false); inverse.copy(plants.matrixWorld).invert();
    for (const {meshes, batch, envelope} of batches) {
      let count = 0; union.makeEmpty();
      for (const mesh of meshes) if (all || ((!envelope || renderFoliage) && mesh.layers.isEnabled(0) && shown(mesh))) {
        mesh.updateWorldMatrix(true, false);
        batch.setMatrixAt(count, matrix.multiplyMatrices(inverse, mesh.matrixWorld));
        if (envelope) { batch.getMatrixAt(count, stored); union.union(transformed.copy(envelope).applyMatrix4(stored)); }
        count++;
      }
      batch.count = count; batch.visible = count > 0; batch.instanceMatrix.needsUpdate = true;
      if (envelope) union.getBoundingSphere(batch.boundingSphere ??= new THREE.Sphere()); else batch.computeBoundingSphere();
    }
  }
  pack(true); // ordinary WarmUp compiles/uploads the native instance variant behind its cover
  let active = null;
  const hideSources = () => sources.forEach((mesh, i) => { mesh.layers.mask = !windSources.has(mesh) || renderFoliage ? 0 : active[i]; });
  const render = renderer.render, shadow = renderer.shadowMap.render;
  renderer.shadowMap.render = function (...args) {
    if (!active) return shadow.apply(this, args);
    // Three builds the color render list BEFORE traversing shadow casters. These original masks affect shadows only.
    sources.forEach((mesh, i) => { mesh.layers.mask = active[i]; });
    try { return shadow.apply(this, args); }
    finally { hideSources(); }
  };
  renderer.render = function (scene, camera, ...args) {
    if (active) return render.call(this, scene, camera, ...args); // reflection render: same complete eligible population
    root.visible = root.userData.enabled;
    // WarmUp intentionally draws mixed/all layers and sliced uploads; keep its source masks and policy untouched.
    if (!root.visible || camera.layers.mask !== 1) return render.call(this, scene, camera, ...args);
    active = sources.map(mesh => mesh.layers.mask); renderFoliage = root.userData.foliage;
    try {
      pack();
      hideSources();
      return render.call(this, scene, camera, ...args);
    } finally {
      sources.forEach((mesh, i) => { mesh.layers.mask = active[i]; });
      active = null; // DetailCuller's cached masks and all physical rays are unchanged outside a draw
    }
  };
  return root;
}

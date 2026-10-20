import * as THREE from 'three';

/** Color-only batching of the fixed L entrance pots/soil. Original meshes remain the physical and shadow sources. */
export function installEntrancePlantBatch(renderer, plants) {
  if (!plants?.userData.records?.length) return null;
  const root = new THREE.Group(); root.name = 'entrance-rigid-batches'; root.userData.enabled = true;
  const groups = new Map(), sources = [];
  for (const {model} of plants.userData.records) for (const mesh of model.children.slice(0, 2)) {
    const key = `${mesh.geometry.uuid}/${mesh.material.uuid}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh); sources.push(mesh);
  }
  const inverse = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  const batches = [...groups.values()].map(meshes => {
    const first = meshes[0], batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.name = 'entrance-rigid-color'; batch.castShadow = false; batch.receiveShadow = first.receiveShadow;
    batch.raycast = () => {}; // physical layer-7 traces still hit each original mesh exactly once
    root.add(batch); return {meshes, batch};
  });
  plants.add(root);
  const shown = mesh => {
    for (let o = mesh; o; o = o.parent) if (!o.visible) return false;
    return mesh.material.visible !== false;
  };
  function pack(all = false) {
    plants.updateWorldMatrix(true, false); inverse.copy(plants.matrixWorld).invert();
    for (const {meshes, batch} of batches) {
      let count = 0;
      for (const mesh of meshes) if (all || (mesh.layers.isEnabled(0) && shown(mesh))) {
        mesh.updateWorldMatrix(true, false);
        batch.setMatrixAt(count++, matrix.multiplyMatrices(inverse, mesh.matrixWorld));
      }
      batch.count = count; batch.visible = count > 0; batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere();
    }
  }
  pack(true); // ordinary WarmUp compiles/uploads the native instance variant behind its cover
  let active = null;
  const render = renderer.render, shadow = renderer.shadowMap.render;
  renderer.shadowMap.render = function (...args) {
    if (!active) return shadow.apply(this, args);
    // Three builds the color render list BEFORE traversing shadow casters. These original masks affect shadows only.
    sources.forEach((mesh, i) => { mesh.layers.mask = active[i]; });
    try { return shadow.apply(this, args); }
    finally { for (const mesh of sources) mesh.layers.mask = 0; }
  };
  renderer.render = function (scene, camera, ...args) {
    if (active) return render.call(this, scene, camera, ...args); // reflection render: same complete eligible population
    root.visible = root.userData.enabled;
    // WarmUp intentionally draws mixed/all layers and sliced uploads; keep its source masks and policy untouched.
    if (!root.visible || camera.layers.mask !== 1) return render.call(this, scene, camera, ...args);
    active = sources.map(mesh => mesh.layers.mask);
    try {
      pack();
      for (const mesh of sources) mesh.layers.mask = 0;
      return render.call(this, scene, camera, ...args);
    } finally {
      sources.forEach((mesh, i) => { mesh.layers.mask = active[i]; });
      active = null; // DetailCuller's cached masks and all physical rays are unchanged outside a draw
    }
  };
  return root;
}

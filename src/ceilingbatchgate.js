import * as THREE from 'three';
import { GARAGE, PERF, PLANT_WIND } from './config.js';
import { wholeBoxOccluded } from './occlusion.js';

// Exactly the ceiling rectangles emitted by Garage: no stair cores or open exterior recesses.
export const garageCeilings = () => GARAGE.rects.filter(r => r.id !== 'core' && !r.core && !r.outside)
  .map(r => ({ x0:r.x0, x1:r.x1, z0:r.z0, z1:r.z1, y0:GARAGE.ceiling, y1:GARAGE.ceiling }));
const HIDDEN = 7; // existing render-only layer; physical traces include it

/** Opt-in complete static batches. No geometry, instance buffers, visible flags or raycasts change. */
export class CeilingBatchGate extends THREE.Object3D {
  constructor(meshes, baseShown = () => true) {
    super(); this.name = 'ceiling-batch-gate'; this.isLOD = true; this.autoUpdate = true;
    this.meshes = meshes; this.baseShown = baseShown; this.occluders = garageCeilings();
    this.box = new THREE.Box3(); this.part = new THREE.Box3(); this.eye = new THREE.Vector3();
    this.bounds = meshes.map(mesh => {
      if (mesh.isInstancedMesh) { if (!mesh.boundingBox) mesh.computeBoundingBox(); }
      else if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = (mesh.isInstancedMesh ? mesh.boundingBox : mesh.geometry.boundingBox).clone();
      // The shader clamps sway to this existing maximum in both horizontal axes.
      if (mesh.geometry.attributes.plantWind) { box.min.x -= PLANT_WIND.maxDisplacement; box.max.x += PLANT_WIND.maxDisplacement; box.min.z -= PLANT_WIND.maxDisplacement; box.max.z += PLANT_WIND.maxDisplacement; }
      return box;
    });
    this.add(...meshes);
  }
  update(camera) {
    // All-layer warm-up/compile passes retain their masks, including sliced warm-up's hidden items.
    if (camera.layers.isEnabled(HIDDEN)) return;
    this.eye.setFromMatrixPosition(camera.matrixWorld); this.box.makeEmpty();
    this.meshes.forEach((mesh,i) => this.box.union(this.part.copy(this.bounds[i]).applyMatrix4(mesh.matrixWorld)));
    const shown = this.baseShown() && !wholeBoxOccluded(this.eye, this.box, this.occluders, PERF.detail.occlusionMargin);
    for (const mesh of this.meshes) mesh.layers.set(shown ? 0 : HIDDEN);
  }
}

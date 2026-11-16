import * as THREE from 'three';
import { CHICKEN } from './config.js';

let legGeometry; // shared across live portions and reloads, like the whole bird's source geometry

/** The hand's leg reads like the inventory's 🍗 emoji: meat above an exposed white bone. Materials still belong to the bird,
 * so golden and burnt pieces keep its actual cooking colour. Wings and breast pieces keep their own source geometry. */
export function chickenPieceModel(meshes, { drumstick = false, body = false } = {}) {
  const model = new THREE.Group();
  if (drumstick) {
    const c = CHICKEN.piece.leg;
    const profile = [[0, 0], [0.27, 0.02], [0.55, 0.15], [0.86, 0.35], [1, 0.6], [0.91, 0.82], [0.6, 0.96], [0, 1]];
    legGeometry ??= {
      meat: new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * c.radius, y * c.meatLength)), 24),
      bone: new THREE.CylinderGeometry(c.boneRadius, c.boneRadius, c.boneLength, 12),
      knob: new THREE.SphereGeometry(c.knobRadius, 12, 8),
    };
    const meat = new THREE.Mesh(legGeometry.meat, meshes[0].material);
    meat.name = 'chicken-piece-meat'; model.add(meat);
    const bone = new THREE.Mesh(legGeometry.bone, meshes[1].material);
    bone.position.y = -c.boneLength / 2; bone.name = 'chicken-piece-bone'; model.add(bone);
    for (const side of [-1, 1]) {
      const knob = new THREE.Mesh(legGeometry.knob, meshes[1].material);
      knob.position.set(side * c.knobRadius * 0.62, -c.boneLength, 0);
      knob.scale.y = 0.85; knob.name = 'chicken-piece-knuckle'; model.add(knob);
    }
  } else {
    const box = new THREE.Box3();
    for (const source of meshes) {
      const clone = new THREE.Mesh(source.geometry, source.material);
      // These are direct children of the bird: local transforms keep its world position/yaw out of the hand and reload.
      clone.position.copy(source.position); clone.quaternion.copy(source.quaternion); clone.scale.copy(source.scale);
      model.add(clone); box.expandByObject(clone);
    }
    const middle = box.getCenter(new THREE.Vector3());
    for (const clone of model.children) {
      clone.position.sub(middle);
      if (body) { clone.position.multiplyScalar(0.4); clone.scale.multiplyScalar(0.4); }
    }
  }
  model.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return model;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chickenPieceModel } from './chickenpiece.js';

const bounds = model => { model.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(model); return [...b.min.toArray(), ...b.max.toArray()]; };
function source() {
  const bird = new THREE.Group(), meat = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xb8662a }));
  meat.position.set(.075, .06, .07); meat.scale.set(.045, .04, .07); bird.add(meat);
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(.009, .012, .05, 8), new THREE.MeshStandardMaterial({ color: 0xf1e7d2 }));
  bone.position.set(.08, .08, .14); bird.add(bone); return { bird, meshes: [meat, bone] };
}
test('a leg has taller tapered meat, an exposed pale bone and two distinct knuckles, retaining the cooked materials', () => {
  const { meshes } = source(), model = chickenPieceModel(meshes, { drumstick: true });
  const meat = model.getObjectByName('chicken-piece-meat'), bone = model.getObjectByName('chicken-piece-bone');
  const knuckles = model.children.filter(m => m.name === 'chicken-piece-knuckle');
  const m = bounds(meat), b = bounds(bone);
  assert.ok(m[4] - m[1] > m[3] - m[0], 'long silhouette rather than round lump');
  assert.ok(b[1] < m[1] && b[4] <= m[1] + .001, 'white bone remains exposed below meat');
  assert.equal(knuckles.length, 2); assert.ok(knuckles[0].position.x < 0 && knuckles[1].position.x > 0);
  assert.equal(meat.material, meshes[0].material); assert.equal(bone.material, meshes[1].material);
  meshes[0].material.color.set(0x251208); assert.equal(meat.material.color.getHex(), 0x251208, 'burnt colour remains the bird material');
  assert.ok(bounds(model).every(Number.isFinite));
});
test('wing/body hand geometry is invariant to the bird world pose and keeps the source unchanged', () => {
  const { bird, meshes } = source(), original = meshes.map(m => [m.position.toArray(), m.quaternion.toArray(), m.scale.toArray()]);
  for (const body of [false, true]) {
    const baseline = bounds(chickenPieceModel(meshes, { body }));
    bird.position.set(8, 1.5, -4); bird.rotation.set(.3, 1.8, -.1); bird.scale.setScalar(.7); bird.updateMatrixWorld(true);
    assert.deepEqual(bounds(chickenPieceModel(meshes, { body })), baseline);
    assert.deepEqual(meshes.map(m => [m.position.toArray(), m.quaternion.toArray(), m.scale.toArray()]), original);
    assert.ok(meshes.every(m => m.parent === bird));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBestiaryModel } from '../src/bestiarymodels.js';
import { BREEDS, loadRiggedCatModel } from '../src/cat.js';

test('loadRiggedCatModel resolves and caches rigged cat gltf data', async () => {
  const gltf1 = await loadRiggedCatModel();
  assert.ok(gltf1 && gltf1.scene, 'gltf1 must have scene');
  const gltf2 = await loadRiggedCatModel();
  assert.equal(gltf1, gltf2, 'Repeated call must return cached gltf');
});

test('createBestiaryModel attaches SkinnedMesh with 26 bones and shared geometry', async () => {
  const b = BREEDS.find((b) => b.name === 'huskatt');
  const c = b.coats.find((c) => c.name === 'svartvit');

  const kittenModel = await createBestiaryModel({ kind: 'cat', breed: b.name, coat: c.name, kitten: true });
  let kittenSkinned = 0;
  let kittenBones = 0;
  kittenModel.object.traverse((o) => {
    if (o.isSkinnedMesh) kittenSkinned++;
    if (o.isBone) kittenBones++;
  });
  assert.equal(kittenSkinned, 1, 'Kitten must have 1 SkinnedMesh');
  assert.equal(kittenBones, 26, 'Kitten must have 26 bones');

  // Verify bounding box is tightly fitted to the cat (not corrupted by 1m procedural spheres)
  const bounds = new THREE.Box3().setFromObject(kittenModel.object);
  const extent = bounds.getSize(new THREE.Vector3());
  assert.ok(extent.x < 0.4 && extent.y < 0.6 && extent.z < 0.6, `Bounds must fit cat, got extent: ${JSON.stringify(extent)}`);

  kittenModel.dispose();

  // Test that subsequent cat model geometry remains intact after previous dispose
  const adultModel = await createBestiaryModel({ kind: 'cat', breed: 'siames', coat: 'siames', kitten: false });
  let adultSkinned = 0;
  let posCount = 0;
  adultModel.object.traverse((o) => {
    if (o.isSkinnedMesh) {
      adultSkinned++;
      posCount = o.geometry.attributes.position.count;
    }
  });
  assert.equal(adultSkinned, 1, 'Adult cat must have 1 SkinnedMesh');
  assert.ok(posCount > 100, `Geometry position buffer must not be disposed, got ${posCount} vertices`);

  adultModel.dispose();
});

test('createBestiaryModel supports all 8 cat breeds and coat variants without error', async () => {
  for (const b of BREEDS) {
    for (const c of b.coats) {
      const m = await createBestiaryModel({ kind: 'cat', breed: b.name, coat: c.name, kitten: false });
      assert.ok(m.object, `Must create model for ${b.name}/${c.name}`);
      m.dispose();
    }
  }
});

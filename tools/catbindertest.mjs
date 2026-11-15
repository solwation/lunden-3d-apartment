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

test('createBestiaryModel builds a cat from the shared primitive geometry that fits a portrait', async () => {
  // #1918: the cat is built from shared primitives (no SkinnedMesh any more); portraits only need meshes and tight bounds.
  const b = BREEDS.find((b) => b.name === 'huskatt');
  const c = b.coats.find((c) => c.name === 'svartvit');
  for (const kitten of [true, false]) {
    const model = await createBestiaryModel({ kind: 'cat', breed: b.name, coat: c.name, kitten });
    let meshes = 0;
    model.object.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes > 10, `cat must have its body parts, got ${meshes}`);
    const extent = new THREE.Box3().setFromObject(model.object).getSize(new THREE.Vector3());
    assert.ok(extent.x < 0.4 && extent.y < 0.6 && extent.z < 0.6, `Bounds must fit cat, got ${JSON.stringify(extent)}`);
    model.dispose();
  }
  // Shared geometry must survive a dispose.
  const again = await createBestiaryModel({ kind: 'cat', breed: 'siames', coat: 'siames', kitten: false });
  let verts = 0;
  again.object.traverse((o) => { if (o.isMesh) verts += o.geometry.attributes.position.count; });
  assert.ok(verts > 100, `geometry must not be disposed, got ${verts}`);
  again.dispose();
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

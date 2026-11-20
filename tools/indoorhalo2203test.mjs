import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { indoorHaloStrength, shadeEmissionAt, shadeEmission, IndoorHalos } from '../src/indoorhalo.js';
import { LIGHTING } from '../src/config.js';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };

test('night halo fades continuously to zero by day and compensates exposure', () => {
  assert.equal(indoorHaloStrength(1), 0);
  assert.equal(indoorHaloStrength(LIGHTING.halo.day[1]), 0);
  assert.ok(indoorHaloStrength(0) > indoorHaloStrength(0.25));
  assert.ok(indoorHaloStrength(0.25) > indoorHaloStrength(0.49));
  assert.equal(indoorHaloStrength(0, 2), indoorHaloStrength(0, 1) / 2);
  assert.ok(Number.isFinite(indoorHaloStrength(0, 0)));
});

test('shade light has a smooth bright centre, dim rims, and preserves an existing emissive map', () => {
  assert.equal(shadeEmissionAt(0), 1);
  assert.ok(shadeEmissionAt(0.5) < 0.8 && shadeEmissionAt(1) < 0.4);
  const material = new THREE.MeshStandardMaterial(), folds = new THREE.Texture();
  material.emissiveMap = folds;
  shadeEmission(material); const callback = material.onBeforeCompile;
  shadeEmission(material); assert.equal(material.onBeforeCompile, callback);
  assert.equal(material.emissiveMap, folds);
  const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  assert.equal(shader.uniforms.uShadeEmission.value, 1);
  assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance *= mix('));
  const a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial();
  shadeEmission(a); shadeEmission(b);
  assert.equal(a.emissiveMap, b.emissiveMap);
  assert.equal(a.emissiveMap.image.width * a.emissiveMap.image.height, 64);
});

test('one instanced batch follows independent lamps, movement and colour, hides off/day/lowest/phone', () => {
  const entries = [0, 1].map(i => ({ lamp: { pos: new THREE.Vector3(i + 1, 2, 3), color: 0xffd59a } }));
  const halos = new IndoorHalos(entries), m = halos.mesh;
  assert.ok(m.isInstancedMesh); assert.equal(m.count, 2); assert.equal(m.geometry.index.count, 6);
  halos.daylight = 0; halos.set(0, 1); halos.commit(); assert.equal(m.visible, true);
  assert.equal(m.instanceColor.array[3], 0);
  entries[0].lamp.pos.set(4, 5, 6); entries[0].lamp.color = 0xff0000; halos.commit();
  const matrix = new THREE.Matrix4(); m.getMatrixAt(0, matrix);
  assert.deepEqual(matrix.elements.slice(12, 15), [4, 5, 6]);
  assert.deepEqual(Array.from(m.instanceColor.array.slice(0, 3)), [1, 0, 0]);
  halos.set(0, 0); halos.commit(); assert.equal(m.visible, false);
  halos.set(1, 1); halos.daylight = 1; halos.commit(); assert.equal(m.visible, false);
  halos.daylight = 0; halos.level = 0; halos.commit(); assert.equal(m.visible, false);
  assert.equal(new IndoorHalos(entries, { lowMemory: true }).mesh, null);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  m.material.onBeforeCompile(shader, null);
  assert.ok(shader.vertexShader.includes('modelViewMatrix * instanceMatrix'));
  assert.ok(shader.vertexShader.includes('modelMatrix * instanceMatrix'));
  assert.ok(m.material.depthTest && !m.material.depthWrite && !m.castShadow);
});

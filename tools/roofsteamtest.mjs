import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ROOF_STEAM as S } from '../src/config.js';
import { steamDensity, plumeAt, nearOutlets, RoofSteam } from '../src/roofsteam.js';

test('condensation grows in cold, is absent in warmth and thins in strong wind', () => {
  assert.equal(steamDensity(8), 0); assert.equal(steamDensity(20), 0);
  assert.equal(steamDensity(-12), 1); assert(steamDensity(0) > steamDensity(5));
  assert(steamDensity(-5, 12) < steamDensity(-5, 1));
  for (let t = -30; t < 30; t++) assert(steamDensity(t, 20) >= 0 && steamDensity(t, 20) <= 1);
});
test('plume rises vertically at its outlet, then bends downwind symmetrically without a jump', () => {
  const start = plumeAt(0, { x: 7, z: -3 }); assert(Math.hypot(start.x, start.y, start.z) === 0);
  assert.deepEqual(plumeAt(3, {}), { x: 0, y: 3 * S.rise, z: 0 });
  const a = plumeAt(3, { x: 7, z: -3 }), b = plumeAt(3, { x: -7, z: 3 });
  assert(a.x > 0 && a.z < 0 && a.y > 0); assert.equal(a.x, -b.x); assert.equal(a.z, -b.z);
  assert(plumeAt(.001, { x: 7 }).x < .00001); assert.equal(plumeAt(4, { x: 3 }).y, 4 * S.rise);
});
test('nearest selection excludes far outlets, resolves equal distances consistently and limits capacity', () => {
  const eye = { x: 0, y: 0, z: 0 }, sources = [{ x: 8, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: -2, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }];
  assert.deepEqual(nearOutlets(sources, eye, 2).map(s => s.index), [1, 2]);
  assert.equal(nearOutlets(sources, eye).length, 3);
});
test('production batch follows temperature, wind, view range and quality; phone budget is smaller', () => {
  const scene = new THREE.Scene(), sources = new THREE.Group(); sources.position.x = 10;
  sources.userData.roofSteam = Array.from({ length: 30 }, (_, i) => [i, 20, 0]); scene.add(sources);
  const camera = new THREE.PerspectiveCamera(), weather = { temp: -10, wind: { x: 6, z: -2 } }, day = { daylight: 1 };
  const r = new RoofSteam({ scene, camera, weather, day }); r.update(.1);
  assert.equal(r.sources[0].x, 10); assert.equal(r.count, S.maxSources * S.points);
  assert.equal(scene.children.filter(o => o.name === 'roof-steam').length, 1); assert(r.object.visible);
  assert.equal(r.object.castShadow, false); assert.equal(r.object.material.depthWrite, false);
  assert([...r.pos.array].every(Number.isFinite)); assert(r.pos.array[0] > r.sources[0].x);
  weather.temp = 12; r.update(.1); assert(!r.object.visible && r.count === 0);
  weather.temp = -10; camera.position.x = 1000; r.update(.5); r.update(.1); r.update(.1); r.update(.1); assert(!r.object.visible);
  camera.position.x = 0; r.setLevel(0); r.update(.1); assert(!r.object.visible);
  r.setLevel(1); r.update(.1); assert.equal(r.count, Math.ceil(S.maxSources * S.lowLevelShare) * S.points);
  day.daylight = 0; r.update(.1); assert.equal(r.object.material.uniforms.uLight.value, S.minLight); r.dispose();
  const phone = new RoofSteam({ scene, camera, weather, day, phone: true }); phone.update(.1);
  assert.equal(phone.count, S.phoneSources * S.phonePoints); assert(phone.count < S.maxSources * S.points); phone.dispose();
});

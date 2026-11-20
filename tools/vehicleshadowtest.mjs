// #2185: vehicle contact shadows (src/vehicleshadow.js). Function-level: footprints in the vehicle's own frame, the
// pool profile, one merged mesh whose per-vehicle range switches off, and the matrices -> items mapping.
// node --test tools/vehicleshadowtest.mjs (three resolvable as 'three').
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
const { vehicleFootprint, shadeAt, buildVehicleShadow, itemsFromMatrices } = await import('../src/vehicleshadow.js');
const { VEHICLE_SHADOW: K } = await import('../src/config.js');

test('a car: body pool plus one patch per wheel, aligned with its nose', () => {
  const e = vehicleFootprint({ x: 10, z: 20, ax: 0, az: -3, kind: 'car' });
  assert.equal(e.length, 5);
  assert.deepEqual([e[0].x, e[0].z, e[0].ax, e[0].az], [10, 20, 0, -1]);
  const wheels = e.slice(1).map((w) => [Math.round((w.x - 10) * 100) / 100, Math.round((w.z - 20) * 100) / 100].join());
  assert.equal(new Set(wheels).size, 4, 'four distinct wheel positions');
  assert.ok(e.slice(1).every((w) => Math.abs(Math.hypot(w.x - 10, w.z - 20) - Math.hypot(K.tyre.x, K.tyre.z)) < 1e-9));
  assert.equal(vehicleFootprint({ x: 0, z: 0, ax: 1, az: 0, kind: 'car' }, true).length, 1, 'phones: body only');
});
test('a bike: a single narrow strip along the bike', () => {
  const [s, ...rest] = vehicleFootprint({ x: 0, z: 0, ax: 1, az: 0, kind: 'bike' });
  assert.equal(rest.length, 0);
  assert.ok(s.ra > s.rb * 3);
});
test('profile: full strength out to the plateau, nothing at the rim, easing between', () => {
  assert.ok(Math.abs(shadeAt(0, 0.5) - 0.5) < 1e-9);
  assert.ok(Math.abs(shadeAt(K.plateau, 0.5) - 0.5) < 1e-9);
  assert.equal(shadeAt(1, 0.5), 1);
  assert.ok(shadeAt(0.85, 0.5) > 0.5 && shadeAt(0.85, 0.5) < 1);
  assert.ok(shadeAt(0.8, 0.5) < shadeAt(0.95, 0.5));
});
test('one merged mesh; a vehicle switches off and on again by its own range', () => {
  const v = buildVehicleShadow([{ x: 0, z: 0, ax: 1, az: 0, kind: 'car' }, { x: 10, z: 0, ax: 1, az: 0, kind: 'bike' }], () => 1);
  assert.equal(v.count, 2); assert.ok(v.mesh.isMesh);
  const c = v.mesh.geometry.attributes.color, pos = v.mesh.geometry.attributes.position;
  assert.ok(pos.count > 0 && Math.abs(pos.getY(0) - (1 + K.lift)) < 1e-6, 'draped on the ground sample');
  const dark = () => { let n = 0; for (let i = 0; i < c.count; i++) if (c.getX(i) < 0.99) n++; return n; };
  const all = dark(); assert.ok(all > 0);
  v.set(1, false); const noBike = dark(); assert.ok(noBike < all);
  v.set(0, false); assert.equal(dark(), 0);
  v.set(0, true); v.set(1, true); assert.equal(dark(), all);
  assert.equal(buildVehicleShadow([], () => 0).mesh, null);
});
test('items from instance matrices: position and nose axis', () => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(3, 0.1, 4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1));
  const [i] = itemsFromMatrices([m], 'car');
  assert.ok(Math.abs(i.x - 3) < 1e-9 && Math.abs(i.z - 4) < 1e-9 && Math.abs(i.ax) < 1e-9 && Math.abs(i.az + 1) < 1e-9);
});

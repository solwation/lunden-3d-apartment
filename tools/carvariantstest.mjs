// #2201: parked-car body types. Function-level: deterministic weighted type pick, footprints, the warp keeps bodies inside the
// parked footprint and wheels on the ground, and per-type instanced batches. node --test tools/carvariantstest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
if (typeof self === 'undefined') globalThis.self = globalThis;
const { carTypeFor, carTypeSize, lengthMap, warpGeometry, CAR_TYPES } = await import('../src/carvariants.js');
const { CAR_VARIANTS: V } = await import('../src/config.js');
const { loadParkedCarModel } = await import('../src/carmodel.js');
await loadParkedCarModel();
const { carGeometry, parkedCarBatches } = await import('../src/streetlife.js');

test('type pick: deterministic, covers every type, follows the weights', () => {
  const a = Array.from({ length: 4000 }, (_, i) => carTypeFor(i, 7));
  assert.deepEqual(a, Array.from({ length: 4000 }, (_, i) => carTypeFor(i, 7)));
  assert.notDeepEqual(a.slice(0, 50), Array.from({ length: 50 }, (_, i) => carTypeFor(i, 8)), 'the seed matters');
  const total = Object.values(V).reduce((s, t) => s + t.weight, 0);
  for (const k of CAR_TYPES) assert.ok(Math.abs(a.filter((t) => t === k).length / 4000 - V[k].weight / total) < 0.03, k);
});
test('length map: identity for the base, wheel zones rigid, monotonic', () => {
  const id = lengthMap(V.compact);
  for (const x of [-2.16, -1.3, 0, 0.7, 1.345, 2.1]) assert.ok(Math.abs(id(x) - x) < 1e-9);
  for (const k of CAR_TYPES) {
    const f = lengthMap(V[k]), h = V[k].wb / 2;
    assert.ok(Math.abs(f(1.345) - h) < 1e-9 && Math.abs(f(-1.345) + h) < 1e-9, `${k}: wheels at ±wheelbase/2`);
    assert.ok(Math.abs((f(1.6) - f(1.1)) - 0.5) < 1e-9, `${k}: the arch zone keeps its length`);
    let prev = -Infinity; for (let x = -2.3; x <= 2.3; x += 0.05) { assert.ok(f(x) > prev); prev = f(x); }
  }
});
test('footprints: every type fits the parked footprint (4.34 x 1.84) and the types differ', () => {
  const lens = new Set();
  for (const k of CAR_TYPES) {
    const s = carTypeSize(k); lens.add(Math.round(s.hx * 100));
    assert.ok(Math.abs(s.cx) + s.hx <= 2.17 + 1e-9 && s.hz <= 0.92 + 1e-9, `${k} fits`);
    assert.ok(Math.abs(s.cx) < 0.1);
  }
  assert.ok(lens.size >= 4, 'at least four different lengths');
});
test('warped geometry: bounds inside the footprint, wheels on the ground, taller SUV/van, shorter small car', () => {
  const bb = (g) => g.computeBoundingBox() || g.boundingBox;
  const sizes = {};
  for (const k of CAR_TYPES) {
    const [body, trim, glass, tyres] = carGeometry(k), b = new THREE.Box3();
    for (const g of [body, trim, glass, tyres]) b.union(bb(g));
    sizes[k] = b.getSize(new THREE.Vector3());
    assert.ok(b.min.x >= -2.2 && b.max.x <= 2.2 && b.max.z <= 0.95 && b.min.z >= -0.95, `${k} within footprint ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)}`);
    assert.ok(Math.abs(bb(tyres).min.y) < 1e-6, `${k} tyres touch the ground`);
    assert.ok(Number.isFinite(sizes[k].x + sizes[k].y + sizes[k].z));
  }
  assert.ok(sizes.small.x < sizes.compact.x - 0.4 && sizes.suv.y > sizes.compact.y + 0.1 && sizes.van.y > sizes.suv.y + 0.1);
  const g = warpGeometry(carGeometry('compact')[0], 'compact'); assert.equal(g.attributes.position.count, carGeometry('compact')[0].attributes.position.count);
});
test('parked batches: one set of three (paint, trim incl. tyres, glass) per occurring type, tagged, instance counts add up', () => {
  const mats = Array.from({ length: 12 }, (_, i) => new THREE.Matrix4().makeTranslation(i * 3, 0, 0)), types = mats.map((_, i) => carTypeFor(i, 3));
  const out = parkedCarBatches(mats, mats.map(() => 0xffffff), types, 'street');
  const present = new Set(types);
  assert.equal(out.length, present.size * 3);
  for (const t of present) {
    const set = out.filter((m) => m.userData.carType === t);
    assert.equal(set.length, 3); assert.ok(set.every((m) => m.count === types.filter((x) => x === t).length && m.userData.carBatch === 'street'));
  }
});
test('tyres in the trim batch: the parked trim geometry carries them (rubber colour, a trim-map uv), the plain one does not', () => {
  const plain = carGeometry('compact'), merged = carGeometry('compact', { tyresInTrim: true });
  assert.equal(merged[3], null);
  assert.equal(merged[1].attributes.position.count, plain[1].attributes.position.count + plain[3].attributes.position.count);
  assert.ok(merged[1].attributes.color && merged[1].attributes.uv);
});

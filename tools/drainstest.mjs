// #2121: manhole covers, gully grates and courtyard drains (src/drains.js): deterministic placement on the asphalt / against a
// kerb / on a courtyard walk, clear of the repair patches, crossings and island; one flat up-facing mesh; phone material without
// compile hooks. node --test tools/drainstest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { drainPlacements, drainGeometry, drainMaterial, footprint, keepOut, buildDrains } from '../src/drains.js';
import { onRoad, samples } from '../src/roads.js';
import { SITE, STREET_DRAINS as D, COURTYARD } from '../src/config.js';

const places = drainPlacements(), by = (k) => places.filter((p) => p.kind === k);

test('deterministic, and a fair number of each kind', () => {
  assert.deepEqual(drainPlacements(), places);
  assert.ok(by('manhole').length >= 5, `manholes ${by('manhole').length}`);
  assert.ok(by('gully').length >= 16, `gullies ${by('gully').length}`);
  assert.equal(by('yard').length, D.yard.at.length);
  for (const row of D.rows) assert.ok(places.some((p) => p.road === row.road && p.kind === 'manhole'), `${row.road} has a manhole`);
});

test('street covers lie wholly on their own road\'s asphalt, not on another road (junctions, the drive)', () => {
  for (const p of places.filter((q) => q.road)) {
    const road = SITE.roads.find((r) => r.name === p.road);
    for (const [x, z] of footprint(p)) {
      assert.ok(onRoad(x, z, -0.004), `${p.kind} at ${p.x.toFixed(1)},${p.z.toFixed(1)} off the asphalt`);
      assert.ok(!onRoad(x, z, 0, road), `${p.kind} at ${p.x.toFixed(1)},${p.z.toFixed(1)} on another road`);
    }
  }
});

test('manholes on the centre line; gullies against a kerb (the ground just outside is not road)', () => {
  for (const p of by('manhole')) assert.equal(p.across, 0);
  for (const p of by('gully')) {
    const road = SITE.roads.find((r) => r.name === p.road);
    let best = null, bd = Infinity; // the nearest centre-line sample: the edge distance there
    for (const q of samples(road)) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
    const outer = Math.abs(p.across) + D.gully.across / 2;
    assert.ok(Math.abs(best.w / 2 - D.gully.kerbGap - outer) < 0.05, `gully ${p.x.toFixed(1)},${p.z.toFixed(1)}: ${outer.toFixed(2)} vs half ${best.w / 2}`);
    const ox = p.x + Math.sign(p.across) * Math.sin(p.yaw) * 0.7, oz = p.z + Math.sign(p.across) * Math.cos(p.yaw) * 0.7;
    assert.ok(!onRoad(ox, oz), `gully ${p.x.toFixed(1)},${p.z.toFixed(1)}: no kerb beside it`);
  }
});

test('clear of repair patches, zebra / bridgehead crossings, the island and each other', () => {
  const rects = keepOut();
  assert.ok(rects.length >= SITE.street.patches.length + 2);
  for (const p of places) {
    const f = footprint(p), xs = f.map((q) => q[0]), zs = f.map((q) => q[1]);
    for (const [x0, x1, z0, z1] of rects) assert.ok(Math.max(...xs) <= x0 || Math.min(...xs) >= x1 || Math.max(...zs) <= z0 || Math.min(...zs) >= z1,
      `${p.kind} at ${p.x.toFixed(1)},${p.z.toFixed(1)} touches [${x0}, ${x1}, ${z0}, ${z1}]`);
  }
  for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++)
    assert.ok(Math.hypot(places[i].x - places[j].x, places[i].z - places[j].z) >= 1.5, 'two covers on top of each other');
});

test('courtyard grates on a paved walk, clear of bollards, benches and trees', () => {
  for (const p of by('yard')) {
    assert.ok(footprint(p).every(([x, z]) => COURTYARD.paths.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)), `${p.x},${p.z} off the walks`);
    const near = [...COURTYARD.benches.map((b) => [b.x, b.z, 1.0]), ...COURTYARD.trees.map(([x, z]) => [x, z, 0.8])];
    for (const row of COURTYARD.bollards.rows) for (let x = row.x0; x <= row.x1 + 1e-6; x += row.step) near.push([x, row.z, 0.35]);
    for (const [x, z, r] of near) assert.ok(Math.hypot(p.x - x, p.z - z) > r, `${p.x},${p.z} too close to ${x},${z}`);
  }
});

test('geometry: flat, up-facing, a few mm over each ground, bounded size; phone material has no compile hooks', () => {
  const ground = (x, z) => 0.01 * x - 0.02 * z, yard = () => 0.3;
  const all = drainGeometry(places, ground, yard);
  assert.deepEqual(Object.keys(all.attributes).sort(), ['color', 'normal', 'position']);
  assert.ok(!all.index && all.attributes.position.count / 3 < 4000, `${all.attributes.position.count / 3} triangles`);
  for (const [list, G, lift] of [[places.filter((q) => q.road), ground, D.lift], [by('yard'), yard, D.yardLift]]) {
    const p = drainGeometry(list, ground, yard).attributes.position, n = drainGeometry(list, ground, yard).attributes.normal;
    for (let i = 0; i < p.count; i++) {
      assert.ok(n.getY(i) > 0.99, 'faces up');
      const dy = p.getY(i) - G(p.getX(i), p.getZ(i));
      assert.ok(Math.abs(dy - lift) < 1e-5 || Math.abs(dy - lift - D.step) < 1e-5, `height over its ground ${dy}`);
    }
  }
  const lite = drainMaterial(true);
  assert.equal(lite.onBeforeCompile, THREE.Material.prototype.onBeforeCompile, 'phones: the plain program');
  assert.ok(lite.vertexColors && !lite.map);
  assert.match(drainMaterial(false).customProgramCacheKey(), /wet2099-paint/);
  const mesh = buildDrains(() => 0, () => 0, true);
  assert.ok(mesh.isMesh && !mesh.castShadow && mesh.name === 'street-drains');
});

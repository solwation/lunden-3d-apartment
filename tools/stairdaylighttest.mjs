// #2183: function-level checks of the stairwells' daylight helpers (src/stairdaylight.js). No browser.
//   node --test tools/stairdaylighttest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { glassSources, dayReach, dayBlend, addDayAttribute, detailTexture, dayShade } from '../src/stairdaylight.js';

const pane = new THREE.PlaneGeometry(1.2, 1.5).translate(0, 1.5, 0); // faces z, in the plane z = 0

test('glassSources finds the centre and the normal axis', () => {
  const [s] = glassSources([pane]);
  assert.deepEqual([s.x, s.y, s.z, s.nx, s.nz], [0, 1.5, 0, 0, 1]);
  assert.ok(Math.abs(s.area - 1.8) < 1e-5);
});

test('dayReach falls with distance and favours surfaces turned at the pane', () => {
  const src = glassSources([pane]);
  const near = dayReach(0, 1.5, 1, 0, 0, -1, src), far = dayReach(0, 1.5, 6, 0, 0, -1, src), away = dayReach(0, 1.5, 1, 0, 0, 1, src);
  assert.ok(near > far * 2.5, `near ${near} vs far ${far}`);
  assert.ok(near > away, 'facing > turned away');
  assert.ok(away > 0, 'a turned-away surface still gets a little');
  assert.equal(dayReach(0, 0, 0, 0, 1, 0, []), 0, 'no panes, no daylight');
  assert.ok(dayReach(0, 1.5, 0.01, 0, 0, -1, src) <= 1.5, 'capped');
});

test('dayBlend follows the day and is thinned by overcast, 0 when off', () => {
  assert.equal(dayBlend(1, 0), 1);
  assert.equal(dayBlend(0, 0), 0);
  assert.ok(dayBlend(1, 1) < dayBlend(1, 0) && dayBlend(1, 1) > 0);
  assert.equal(dayBlend(1, 0, false), 0);
  assert.equal(dayBlend(-3, 5), 0);
});

test('addDayAttribute gives every merged geometry a dayK of its vertex count, bright near a pane', () => {
  const src = glassSources([pane]);
  const a = new THREE.BoxGeometry(1, 1, 1).translate(0, 1.5, 1.2).toNonIndexed(), b = new THREE.BoxGeometry(1, 1, 1).translate(0, 1.5, 9).toNonIndexed();
  addDayAttribute([a, b], src);
  assert.equal(a.attributes.dayK.count, a.attributes.position.count);
  const mean = (g) => g.attributes.dayK.array.reduce((x, y) => x + y, 0) / g.attributes.dayK.count;
  assert.ok(mean(a) > mean(b) * 2, `${mean(a)} vs ${mean(b)}`);
  const merged = THREE.BufferGeometry.prototype.clone.call(a); // same attribute set merges (BufferGeometryUtils needs equal sets)
  assert.deepEqual(Object.keys(a.attributes).sort(), Object.keys(b.attributes).sort());
  assert.ok(merged);
});

test('detailTexture is deterministic, sized and varied', () => {
  const t = detailTexture(32), u = detailTexture(32);
  assert.equal(t.image.data.length, 32 * 32 * 4);
  assert.deepEqual(Array.from(t.image.data.slice(0, 64)), Array.from(u.image.data.slice(0, 64)));
  const r = Array.from({ length: 32 * 32 }, (_, i) => t.image.data[i * 4]);
  assert.ok(Math.max(...r) - Math.min(...r) > 60, 'fine channel has contrast');
});

test('dayShade: brighter at a pane than deep in, unchanged at night, never blown out, colour kept', () => {
  const beige = [0.62, 0.56, 0.45], white = [0.86, 0.86, 0.84], grey = [0.35, 0.36, 0.38];
  assert.deepEqual(dayShade(beige, 1, 0), beige, 'night (uDay 0): the baked lamp light as before');
  for (const c of [beige, white, grey]) {
    const near = dayShade(c, 1, 1), deep = dayShade(c, 0, 1), sum = (v) => v[0] + v[1] + v[2];
    assert.ok(sum(near) > sum(deep) * 1.3, `near ${near} vs deep ${deep}`);
    assert.ok(sum(deep) < sum(c), 'deep in the core is darker by day than under the lamps alone');
    assert.ok(Math.max(...near) < 0.97, `no clipping: ${near}`);
  }
  const lifted = dayShade(grey, 1, 1);
  assert.ok(lifted[0] > grey[0] * 1.2, 'a mid grey near the glass is visibly lifted');
  const ratio = (v) => v[0] / v[2], b = dayShade(beige, 0.8, 1);
  assert.ok(Math.abs(ratio(b) - ratio(beige)) / ratio(beige) < 0.12, `hue kept: ${b}`);
  const hot = dayShade([1.1, 1.1, 1.05], 1, 1); // a vertex the baked lamps already pushed over 1
  assert.ok(Math.max(...hot) <= 1.1 + 1e-9 && Math.max(...hot) >= 0.97, `never darker than the lamp max, compressed toward 1: ${hot}`);
});

test('addDayAttribute: a degenerate triangle gets a finite dayK (a NaN blanks the vertex in the shader)', () => {
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 1, 0, 1, 1, 0, 1, 1], 3));
  addDayAttribute([g], glassSources([pane]));
  assert.ok(Array.from(g.attributes.dayK.array).every(Number.isFinite));
});

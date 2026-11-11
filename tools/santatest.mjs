import test from 'node:test';
import assert from 'node:assert/strict';
import { santaState } from '../src/santaconfig.js';

test('Santa follows Christmas Eve boundaries, including backwards clock changes', () => {
  const day = { month: 12, date: 24, hour: 0 };
  for (const [hour, state] of [[14.999, 'away'], [15, 'sitting'], [15.999, 'sitting'], [16, 'sleeping'], [20.999, 'sleeping'], [21, 'away'], [16, 'sleeping'], [15, 'sitting'], [14, 'away']]) {
    day.hour = hour;
    assert.equal(santaState(day), state, `hour ${hour}`);
  }
  for (const [month, date] of [[12, 23], [12, 25], [11, 24], [1, 24]]) {
    assert.equal(santaState({ month, date, hour: 15.5 }), 'away');
  }
});

// Exercise the actual constructor before loading the asset: this is the Pages/failed-request path.
import * as THREE from 'three';
import { Santa, loadSantaModel } from '../src/santa.js';
import { LANDSKRONA } from '../src/config.js';
function guest() {
  const scene = new THREE.Scene(), pickable = new THREE.Group(); scene.add(pickable);
  pickable.userData.rest = { spots: [-.35, .2, .75].map(x => ({ x, y: LANDSKRONA.seatHeight, z: -.08 })) };
  const sofa = { pickable, spots: [{}, {}, {}] }, day = { month: 12, date: 24, hour: 15 };
  return new Santa({ scene, sofa, day });
}
function check(santa) {
  assert.equal(santa.state, 'sitting');
  assert.equal(santa.visible, true);
  const g = santa.fig.body.geometry;
  assert.ok(g.attributes.position.count > 1000);
  assert.equal(g.attributes.color.count, g.attributes.position.count);
  g.computeBoundingBox(); assert.ok(g.boundingBox.max.y > 1.1, 'whole bent hat retained');
  const colors = Array.from(g.attributes.color.array);
  santa.sips = 10; santa.updateBlush();
  assert.notDeepEqual(Array.from(g.attributes.color.array), colors, 'cheeks still blush');
  let minY = Infinity;
  for (let i = 0, p = santa.fig.legs.geometry.attributes.position; i < p.count; i++) minY = Math.min(minY, p.getY(i) + santa.object.position.y);
  assert.ok(Math.abs(minY) < .001, `soles reach floor: ${minY}`);
  santa.day.hour = 16; santa.update(1);
  assert.equal(santa.sleeping, true); assert.equal(santa.fig.glass.visible, false);
  assert.equal(santa.fig.legs.geometry, santa.legPoses.sleeping);
  assert.ok(santa.head.toArray().every(Number.isFinite));
  santa.day.hour = 21; santa.update(0); assert.equal(santa.visible, false);
}
test('actual Santa starts without a GLB and keeps complete sitting/sleeping anatomy', () => check(guest()));
test('loaded GLB keeps the same actual Santa sitting/sleeping behaviour', async () => {
  assert.ok(await loadSantaModel()); check(guest());
});

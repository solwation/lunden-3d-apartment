// #1945: the blue mussels' placement on the real river (pure rules of src/musselfield.js with the real samplers) and their regrowth.
// Requires the pinned local Three.js 0.170.0 dependency (riverbridge.js / surroundings.js). node --test tools/musselfieldtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSSELS as C, SITE, WALK } from '../src/config.js';
import { riverPath, riverAt, pierBoxes, waterYAt, deckAt } from '../src/riverbridge.js';
import { swimWater, swimBedY, farWalls } from '../src/farwalk.js';
import { diveMax } from '../src/swim.js';
import { musselSpots, MusselField, bedSpot, seeded, segDistance } from '../src/musselfield.js';

const foot = SITE.bridges.road.foot / 2 + C.pierClear, piers = pierBoxes().map((p) => ({ ...p, half: foot }));
const place = (over = {}) => musselSpots({ path: riverPath, frame: riverAt, open: swimWater, bedY: swimBedY, bounds: WALK, cfg: C, piers, walls: (x, z) => farWalls(x, z, SITE.bridges.bedY), ...over });
const spots = place();

test('the mussels lie in the channel, on the bed, in open water inside the walkable area', () => {
  assert(spots.length > 150 && spots.length < 600, `count ${spots.length}`);
  for (const s of spots) {
    const q = riverAt(s.x, s.z);
    assert(q.distance <= q.width / 2 - C.edge + 1e-9, `in the channel: ${q.distance} of ${q.width / 2}`);
    assert(swimWater(s.x, s.z), 'open water');
    assert.equal(s.y, swimBedY(s.x, s.z));
    const depth = waterYAt(s.x, s.z) - s.y;
    assert(depth > 0.3 && depth < SITE.bridges.pool + 0.7, `depth ${depth}`);
    assert(s.x > WALK.x0 + C.boundsClear && s.x < WALK.x1 - C.boundsClear && s.z > WALK.z0 + C.boundsClear && s.z < WALK.z1 - C.boundsClear);
    assert(s.size >= C.size[0] && s.size <= C.size[1]);
  }
});

test('clear of the bridge piers\' footings and of every wall; some lie under the bridges', () => {
  for (const s of spots) {
    for (const p of pierBoxes()) { const ex = s.x - p.x, ez = s.z - p.z; assert(Math.max(Math.abs(ex * p.dx + ez * p.dz), Math.abs(-ex * p.dz + ez * p.dx)) >= SITE.bridges.road.foot / 2 + C.pierClear); }
    for (const w of farWalls(s.x, s.z, SITE.bridges.bedY)) assert(segDistance(s.x, s.z, w) >= C.wallClear);
  }
  assert(spots.some((s) => deckAt(s.x, s.z) !== null), 'mussels under a bridge deck');
});

test('along the whole swimmable stretch: no long gap, deep and shallow ones', () => {
  const along = spots.map((s) => riverAt(s.x, s.z).along).sort((a, b) => a - b);
  let gap = 0; for (let i = 1; i < along.length; i++) gap = Math.max(gap, along[i] - along[i - 1]);
  assert(gap < 4 * C.spacing, `largest gap ${gap} m`);
  assert(along.at(-1) - along[0] > 300, `stretch ${along.at(-1) - along[0]} m`);
  const depths = spots.map((s) => waterYAt(s.x, s.z) - s.y);
  // from the surface (the eye SWIM.eye over the water) only the shallow ones are within HOLD.reach; a diver gets down to all of them
  assert(depths.some((d) => d > 1.5) && depths.some((d) => d < 1), 'deep and shallow');
  for (const s of spots) assert(diveMax(waterYAt(s.x, s.z) - s.y) >= 0, 'a diver can go down here');
});

test('deterministic: the same seed gives the same bed, another seed another', () => {
  assert.deepEqual(place(), spots);
  const other = place({ seed: C.seed + 1 });
  assert.notDeepEqual(other.map((s) => [s.x, s.z]), spots.map((s) => [s.x, s.z]));
  const a = seeded(7), b = seeded(7); for (let i = 0; i < 5; i++) { const v = a(); assert.equal(v, b()); assert(v >= 0 && v < 1); }
});

test('a rule that drops spots does not move the others', () => {
  const half = place({ open: (x, z) => swimWater(x, z) && x < 0 }), key = (s) => `${s.x},${s.z}`, all = new Set(spots.map(key));
  assert(half.length > 0 && half.length < spots.length);
  for (const s of half) assert(all.has(key(s)));
});

test('regrowth: a taken mussel is gone, and back after its time once allowed', () => {
  const list = spots.slice(0, 6).map((s) => ({ ...s })), f = new MusselField(list, { regrow: [10, 20] }, () => 0.5);
  assert.equal(f.take(list[0]), true); assert.equal(f.take(list[0]), false); assert.equal(list[0].gone, true); assert.equal(list[0].t, 15);
  assert.equal(f.update(14.9), null); assert.equal(list[0].gone, true);
  assert.equal(f.update(0.2, () => false), null, 'held back while the diver is near'); assert.equal(list[0].gone, true);
  assert.deepEqual(f.update(0.1), [list[0]]); assert.equal(list[0].gone, false); assert.equal(f.out.length, 0);
  f.take(list[1]); f.take(list[2]); assert.equal(f.restore(list[1]), true); assert.equal(f.restore(list[1]), false);
  assert.equal(list[1].gone, false); assert.deepEqual(f.out, [list[2]]);
  assert.deepEqual(f.update(30), [list[2]]); assert.equal(f.take(list[2]), true, 'it can be taken again');
});

test('bedSpot: where a diver puts a mussel down', () => {
  const flat = () => -2, open = () => true;
  const down = bedSpot({ x: 0, y: -1.6, z: 0 }, { x: 0.6, y: -0.8, z: 0 }, 2, flat, open);
  assert(down && Math.abs(down.y + 2) < 1e-9 && down.x > 0.2 && down.x < 0.45 && down.distance < 0.6);
  const level = bedSpot({ x: 0, y: -1.6, z: 0 }, { x: 1, y: 0, z: 0 }, 2, flat, open); // looking level: the bed a little ahead
  assert(level && level.x === 1 && Math.abs(level.distance - Math.hypot(1, 0.4)) < 1e-9);
  assert.equal(bedSpot({ x: 0, y: 0.1, z: 0 }, { x: 0.6, y: -0.8, z: 0 }, 2, flat, open), null, 'out of reach from above deep water');
  assert.equal(bedSpot({ x: 0, y: -1.6, z: 0 }, { x: 0.6, y: -0.8, z: 0 }, 2, flat, () => false), null, 'not on the bank');
});

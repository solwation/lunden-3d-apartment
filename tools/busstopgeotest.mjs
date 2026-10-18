// node --test tools/busstopgeotest.mjs — #1301: the bus stop's data and geometry (OSM-sourced position, inside the walkable area, clear of the roads).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE, WALK } from '../src/config.js';
import { B, busStopPoint, toLocal, onBusStop, busStopSegments, length } from '../src/busstopgeo.js';

test('the kerb is the OSM platform way, straight, and the platform lies inside the walkable area', () => {
  assert.equal(B.kerb.length, 3);
  const [s1, t1] = toLocal(...B.kerb[1]); assert.ok(Math.abs(t1) < 0.05, 'the middle node lies on the straight kerb line');
  for (const [s, t] of [[0, 0], [length, 0], [0, B.width], [length, B.width]]) {
    const [x, z] = busStopPoint(s, t); assert.ok(x > WALK.x0 && x < WALK.x1 && z > WALK.z0 && z < WALK.z1, `corner ${s},${t} inside WALK`);
  }
  assert.ok(length > 15 && length < 25, 'about 21 m, like the way');
});
test('the shelter stands on the platform at the OSM node, the sign and the bin too', () => {
  const [cs, ct] = toLocal(...B.shelter.at);
  assert.ok(ct - B.shelter.depth / 2 > 0.5 && ct + B.shelter.depth / 2 < B.width, 'inside the platform, a kerb strip free in front');
  assert.ok(onBusStop(...B.shelter.at) && cs > 0 && cs < length);
  assert.ok(onBusStop(...busStopPoint(B.sign.s, B.sign.t)) && onBusStop(...busStopPoint(B.bin.s, B.bin.t)));
  const sBin = B.bin.s, sh = B.shelter.len / 2;
  assert.ok(sBin > cs + sh + B.bin.r || sBin < cs - sh - B.bin.r, 'the bin stands beside the shelter, not inside it');
  assert.equal(busStopSegments().length, 3);
});
test('the platform keeps off the carriageways (bus bay approach and Sankt Lars väg)', () => {
  const roads = [...SITE.south.paths, ...SITE.south.access].filter((p) => p.surface === 'asphalt' && p.w >= 4.5 && /^(95035967|189432572|189432530|36918923)$/.test(p.source));
  assert.equal(roads.length, 4, 'the bus bay approach 95035967 is in the model');
  const dist = (p, [x, z]) => Math.min(...p.path.slice(1).map(([c, d], i) => { const [a, b] = p.path[i], dx = c - a, dz = d - b, t = Math.max(0, Math.min(1, ((x - a) * dx + (z - b) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a - t * dx, z - b - t * dz); }));
  for (const p of roads) for (let s = 0; s <= length; s += 1) for (const t of [0, B.width]) {
    assert.ok(dist(p, busStopPoint(s, t)) > p.w / 2 - 0.05, `${p.source} at ${s},${t}`);
  }
});

// #2181: sound occlusion helpers (pure; fake worlds, no Web Audio). Run: node --test tools/soundocclusiontest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cellOf, occlusionFor, doorsOnLine } from '../src/soundocclusion.js';
import { OCCLUSION as O, BIRD_SONG as B } from '../src/config.js';

const door = (seg, t, y = 0) => ({ t, object: { position: { y } }, segment: () => seg });
// A flat with a wall at x=5 on level 0 (z 0..6; the doorway gap is not in the wall list) and a door at z 6.5..7.5.
const world = (over = {}) => ({
  size: { x: 20, z: 20 }, levels: [{ wallSegments: [[5, 0, 5, 6]] }, { wallSegments: [] }],
  roomAt: (lv, x) => (x < 5 ? 'Kök' : 'Vardagsrum'), doors: [door([5, 6.5, 5, 7.5], 0)], ...over,
});
const at = (x, y, z) => ({ x, y, z });

test('same room: no estimate (no filter is built)', () => {
  assert.equal(occlusionFor(world(), at(1, 1.5, 1), at(3, 1.5, 4)), null);
});
test('through a wall: dulled, quieter, low-pass in range', () => {
  const r = occlusionFor(world(), at(2, 1.5, 3), at(8, 1.5, 3));
  assert.deepEqual(r.parts, ['wall']);
  assert.ok(r.gain < 1 && r.gain > 0 && r.hz === O.wall.hz);
});
test('doorway on the line: closed door dulls, open door barely', () => {
  const w = world(), a = at(2, 1.5, 7), b = at(8, 1.5, 7);
  const closed = occlusionFor(w, a, b);
  w.doors[0].t = 1;
  const open = occlusionFor(w, a, b);
  assert.deepEqual(closed.parts, ['door']); assert.deepEqual(open.parts, ['openDoor']);
  assert.ok(closed.hz < open.hz && closed.gain < open.gain);
  assert.ok(open.gain > 0.8, 'an open door is almost clear');
});
test('a door on another storey does not count', () => {
  const w = world({ doors: [door([5, 6.5, 5, 7.5], 0, 3.25)] });
  assert.deepEqual(doorsOnLine(w, at(2, 1.5, 7), at(8, 1.5, 7), 1.5), { closed: 0, open: 0 });
});
test('upstairs vs downstairs: slab', () => {
  const r = occlusionFor(world(), at(2, 1.5, 3), at(2, 4.3, 3));
  assert.deepEqual(r.parts, ['floor']);
  assert.ok(r.hz <= O.floor.hz);
});
test('outside vs inside: facade; an open entrance door only dulls lightly', () => {
  const w = world({ doors: [door([8, 20.5, 9, 20.5], 0)] });
  assert.deepEqual(occlusionFor(w, at(2, 1.5, 3), at(2, 0, 30)).parts, ['facade']);
  const w2 = world({ doors: [door([1.5, 19.5, 2.5, 19.5], 1)] }); // open door in the line
  assert.deepEqual(occlusionFor(w2, at(2, 1.5, 3), at(2, 0, 30)).parts, ['openDoor']);
});
test('losses are capped and the cut-off never falls below minHz', () => {
  const r = occlusionFor(world({ doors: [] }), at(2, 1.5, 3), at(30, 4.3, 3));
  assert.ok(r.gain >= Math.pow(10, -O.maxDb / 20) - 1e-9 && r.hz >= O.minHz);
});
test('cells: playroom, core and visited flat are their own cells', () => {
  const c = (w, p) => cellOf(world(w), p).kind;
  assert.equal(c({ playroom: { contains: () => true } }, at(1, 0, 1)), 'play');
  assert.equal(c({ core: { contains: () => true } }, at(1, 0, 1)), 'core');
  assert.equal(c({ unitAt: () => ({ id: 7, levelAt: () => 0, roomAt: () => 'Kök' }) }, at(1, 0, 1)), 'unit');
  assert.equal(cellOf(world(), at(100, 0, 100)).kind, 'out');
  const r = occlusionFor(world({ core: { contains: (x) => x > 15 } }), at(2, 1.5, 3), at(17, 1.5, 3));
  assert.deepEqual(r.parts, ['wall'], 'stairwell vs flat without a door on the line');
});
test('non-finite positions never throw', () => {
  assert.doesNotThrow(() => occlusionFor(world(), at(2, 1.5, 3), at(NaN, 0, 0)));
});
test('bird call from outside heard indoors: only the facade occlusion, not facade x BIRD_SONG.indoors (#2178 double-attenuation)', () => {
  const w = world({ doors: [] }), r = occlusionFor(w, at(2, 1.5, 3), at(2, 6, 30)); // a treetop outdoors, listener indoors
  assert.deepEqual(r.parts, ['facade']);
  assert.equal(B.indoors, 1, 'the scheduler adds no second indoor factor');
  const total = B.level.song * B.indoors * r.gain; // what audio.js hears: scheduler level x occlusion
  assert.ok(Math.abs(total - B.level.song * Math.pow(10, -O.facade.db / 20)) < 1e-12);
});

// #2180: interior mapping helpers (src/interiormap.js): deterministic rooms, sane geometry, baked attributes, shader anchors.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import { roomSpec, roomVertex, roomColours, roomLevels, interiorMapShader, roomLightShader } from '../src/interiormap.js';
import { paneTints } from '../src/glasspanes.js';
import { ROOM_MAP as R } from '../src/config.js';
import * as THREE from 'three';
test('room is a deterministic function of the pane, within the configured ranges', () => {
  const kinds = new Set();
  for (let k = 0; k < 400; k++) {
    const a = roomSpec(k * 1.3, 3 + (k % 5) * 2.8, -k * .7, .6, .7), b = roomSpec(k * 1.3, 3 + (k % 5) * 2.8, -k * .7, .6, .7);
    assert.deepEqual(a, b);
    assert(a.depth >= R.depth[0] && a.depth <= R.depth[1]);
    assert(a.latLo < -a.halfw && a.latHi > a.halfw, 'room wider than the pane');
    assert(a.floorV < -a.halfh && a.ceilV > a.halfh, 'floor under, ceiling over the pane');
    const h = a.ceilV - a.floorV; assert(h >= R.height[0] - 1e-9 && h <= R.height[1] + 1e-9);
    assert(a.cover >= 0 && a.cover <= 1 && a.seed >= 0 && a.seed < 1); kinds.add(a.name);
  }
  assert.deepEqual([...kinds].sort(), R.kinds.map((x) => x.name).sort(), 'every dressing occurs');
  assert.notDeepEqual(roomSpec(0, 3, 0, .6, .7), roomSpec(1.5, 3, 0, .6, .7));
  assert(!/Math\.random|Date|performance/.test(readFileSync('src/interiormap.js', 'utf8')));
});
test('floor-to-ceiling glass doors start at the floor; frames and thick boxes get no room', () => {
  const door = roomSpec(0, 3, 0, .5, 1.1), win = roomSpec(0, 3, 0, .5, .7);
  assert(Math.abs(door.floorV + 1.1 + R.doorSill) < 1e-9 && win.floorV < -.7 - R.sill[0] + 1e-9);
  assert.equal(roomVertex([0, 0, 0], [1.2, 0.03, 0.02])[3], 0, 'a thin horizontal strip');
  assert.equal(roomVertex([0, 0, 0], [1.2, 1.4, 1.2])[3], 0, 'a thick box');
  assert.equal(roomVertex([0, 1, 0], [1.2, 2.4, 0.01])[3] > 0, true);
  assert.equal(roomVertex([0, 1, 0], [1.2, 2.4, 0.01]).length, 12);
});
test('paneTints bakes the room attributes per pane (single panes and merged batches) and nothing without rooms', () => {
  const quad = (x0, x1, y0, y1, z) => [x0, y1, z, x0, y0, z, x1, y1, z, x0, y0, z, x1, y0, z, x1, y1, z];
  const geo = (pos) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g; };
  const [m] = paneTints([geo([...quad(0, 1.2, 1, 2.4, 0), ...quad(10, 11.2, 1, 2.4, 0)])], 0xffffff, undefined, roomVertex);
  for (const k of ['roomC', 'roomA', 'roomB']) assert.equal(m.attributes[k].count, 12) || assert.equal(m.attributes[k].itemSize, 4);
  assert.equal(m.attributes.roomC.getX(0), m.attributes.roomC.getX(5)); assert.notEqual(m.attributes.roomC.getX(0), m.attributes.roomC.getX(6));
  assert(Math.abs(m.attributes.roomC.getX(0) - .6) < 1e-6 && m.attributes.roomC.getW(0) > 0 && m.attributes.roomB.getZ(0) > 0.59);
  const [plain] = paneTints([geo(quad(0, 1.2, 1, 2.4, 0))]); assert(!plain.attributes.roomC);
});
test('palette picks and brightness levels are bounded; night is darker than day', () => {
  for (let i = 0; i < 50; i++) { const c = roomColours(i / 50); for (const v of [c.wall, c.floor, c.fabric]) assert(v.length === 3); }
  const [d, f] = roomLevels(0), [n, g] = roomLevels(1); assert(d > n && f > g && n > 0 && d <= 1);
});
test('the shader patches find three\'s anchors (a three upgrade fails here)', () => {
  const phys = THREE.ShaderLib.physical, basic = THREE.ShaderLib.basic;
  const out = interiorMapShader({ uniforms: {}, vertexShader: phys.vertexShader, fragmentShader: phys.fragmentShader });
  assert(out.fragmentShader.includes('roomColour(') && out.vertexShader.includes('vRoomC') && out.uniforms.uRoomLevel);
  const glow = roomLightShader({ vertexShader: basic.vertexShader, fragmentShader: basic.fragmentShader });
  assert(glow.fragmentShader.includes('vGlowSeed') && glow.vertexShader.includes('instanceMatrix'));
});

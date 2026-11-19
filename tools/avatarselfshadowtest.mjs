// #2143: the avatar's analytic sun self-shadow, headless. node --test tools/avatarselfshadowtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { capsuleOcclusion, brimOcclusion, selfOcclusion, brimShape } from '../src/avatarselfshadow.js';
import { sunSelf } from '../src/avatarlight.js';
import { AVATAR_SELF_SHADOW as C } from '../src/config.js';

const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const up = unit([0.3, 1, 0.2]), high = [0, 1, 0];
const torso = { a: [0, 0.95, 0], b: [0, 1.4, 0], r: 0.1 };

test('sun behind a capsule from the point: no shadow; straight above and away: none', () => {
  assert.equal(capsuleOcclusion([0, 2, 0], high, torso), 0); // a point above the capsule, sun overhead: nothing between
  assert.equal(capsuleOcclusion([0.3, 1.2, 0], unit([1, 1, 0]), torso), 0); // sun on the far side of the point
});

test('a point under a capsule with the sun overhead is shadowed, beside it is not, and the edge is smooth', () => {
  const arm = { a: [-0.2, 1.5, 0], b: [0.2, 1.5, 0], r: 0.04 };
  assert.ok(capsuleOcclusion([0, 1.1, 0], high, arm) > 0.95);
  assert.equal(capsuleOcclusion([0.5, 1.1, 0], high, arm), 0);
  const edge = [0, 0.02, 0.04, 0.06, 0.08, 0.1].map((z) => capsuleOcclusion([0, 1.1, z], high, arm));
  for (let i = 1; i < edge.length; i++) assert.ok(edge[i] <= edge[i - 1] + 1e-9, 'monotone falloff ' + edge);
  assert.ok(edge.some((v) => v > 0.05 && v < 0.95), 'a penumbra exists ' + edge);
});

test('the penumbra widens with distance from the occluder', () => {
  const arm = { a: [-0.3, 1.8, 0], b: [0.3, 1.8, 0], r: 0.04 };
  const width = (y) => { let n = 0; for (let z = 0; z < 0.3; z += 0.002) { const o = capsuleOcclusion([0, y, z], high, arm); if (o > 0.05 && o < 0.95) n++; } return n; };
  assert.ok(width(0.9) > width(1.6));
});

test('a point on the capsule\'s own surface is not shaded by it (sun facing side and flank)', () => {
  assert.equal(capsuleOcclusion([0, 1.2, 0.115], unit([0, 0.3, 1]), torso), 0); // front surface, sun in front
  assert.ok(capsuleOcclusion([0.115, 1.2, 0], high, torso) < 0.05); // flank with the sun overhead
});

test('an arm raised beside the chest shades the torso under it; arms at the side do not with the sun overhead', () => {
  const chest = [0, 1.25, 0.11], arm = { a: [-0.1, 1.45, 0.12], b: [0.1, 1.45, 0.12], r: 0.035 }; // a forearm across above the chest
  assert.ok(selfOcclusion(chest, unit([0, 1, 0.1]), [torso, arm], null) > 0.5 * C.max);
  const sideArm = { a: [0.22, 1.35, 0], b: [0.24, 1.05, 0], r: 0.035 };
  assert.ok(selfOcclusion(chest, high, [torso, sideArm], null) < 0.05);
});

test('the head shades the chest under the chin at high sun; capped by C.max', () => {
  const head = { a: [0, 1.62, 0], b: [0, 1.72, 0], r: 0.078 }, chest = [0, 1.45, 0.02];
  const o = selfOcclusion(chest, unit([0, 1, 0.15]), [head, torso], null);
  assert.ok(o > 0.5 * C.max && o <= C.max + 1e-9);
});

test('the cap\'s peak and the hat\'s brim shade the eyes at a high midday sun (55 deg, in front), not from behind or below', () => {
  const noon = unit([0, 1, 0.7]); // the sun 55 degrees up, straight ahead of the face (head frame: +z forward)
  for (const kind of [1, 4]) {
    const b = brimShape(kind), eyes = [0, 0.1, 0.085]; // the eyes ~ 7 cm under the plane, near the front of the skull
    assert.ok(b.rx > 0.05 && b.rz > 0.03, 'shape ' + JSON.stringify(b));
    assert.ok(brimOcclusion(eyes, noon, b) > 0.8, 'kind ' + kind);
    assert.equal(brimOcclusion(eyes, unit([0, -0.2, 1]), b), 0, 'sun below the plane');
  }
  const cap = brimShape(1), eyes = [0, 0.1, 0.085];
  assert.ok(brimOcclusion(eyes, unit([0, 1, -1.5]), cap) < 0.05, 'sun behind the head: the peak does not shade the face');
  assert.equal(brimOcclusion(eyes, noon, null), 0); // no headwear
  assert.equal(brimShape(3), null); assert.equal(brimShape(0), null);
  assert.ok(brimOcclusion([0, 0.1, 0.085], unit([0, 1, 0.1]), cap) < 0.2, 'a nearly overhead sun puts the peak\'s shadow beyond the eyes (lower face lit)');
});

test('brim: smooth edge (monotone from inside to outside) and a point above the plane is not shaded', () => {
  const b = brimShape(4);
  const xs = [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14].map((d) => brimOcclusion([d + 0.0, b.y - 0.05, b.cz], high, b));
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] <= xs[i - 1] + 1e-9, 'edge ' + xs);
  assert.equal(brimOcclusion([0, b.y + 0.05, 0], high, b), 0);
});

test('cap peak points the right way: forwards (+z) for kind 1, backwards for kind 2', () => {
  assert.ok(brimShape(1).cz > 0.05 && brimShape(2).cz < -0.05);
});

test('sunSelf: strength follows the sun intensity, zero in shade, indoors and at night; direction is position minus target', () => {
  const lights = (i) => ({ sun: { intensity: i, position: { x: 10, y: 20, z: 0 }, target: { position: { x: 10, y: 0, z: 0 } } } });
  const [d, k] = sunSelf({ kind: 'outdoors' }, {}, lights(3));
  assert.deepEqual([d.x, d.y, d.z].map((v) => +v.toFixed(3)), [0, 1, 0]); assert.equal(k, 1);
  assert.ok(sunSelf({ kind: 'outdoors' }, {}, lights(1.5))[1] > 0.4 && sunSelf({ kind: 'outdoors' }, {}, lights(1.5))[1] < 0.6);
  assert.equal(sunSelf({ kind: 'outdoors', shade: true }, {}, lights(3))[1], 0);
  assert.equal(sunSelf({ kind: 'room' }, {}, lights(3))[1], 0);
  assert.equal(sunSelf({ kind: 'outdoors' }, {}, lights(0.2))[1] < 0.1, true);
  assert.equal(sunSelf({ kind: 'outdoors' }, {}, null)[1], 0);
});

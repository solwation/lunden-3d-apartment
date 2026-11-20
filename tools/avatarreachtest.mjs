// #2161: the remote figure's reach for a door handle / a thing: frame conversion, bend from height, timeline, far targets ignored; the door and
// thing hooks. Run: node --test tools/avatarreachtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { reachWeight, reachPose, toFigureFrame, bendFor, REACH_TOTAL } from '../src/avatarreach.js';
import { REACH } from '../src/config.js';
import { DoorSync } from '../src/doorsync.js';
import { ThingShare } from '../src/thingshare.js';

test('frame: a point ahead of a figure facing east is +z; to its left is +x; height is above the floor', () => {
  const a = toFigureFrame([2, 1.2, 0], 1, 0, Math.PI / 2, 0.5); // facing +x (yaw 90 deg): 1 m ahead
  assert.ok(Math.abs(a[2] - 1) < 1e-9 && Math.abs(a[0]) < 1e-9 && Math.abs(a[1] - 0.7) < 1e-9);
  const b = toFigureFrame([0, 0, 1], 0, 0, 0, 0); assert.deepEqual(b.map((v) => +v.toFixed(9)), [0, 0, 1]);
  const l = toFigureFrame([-1, 0, 0], 0, 0, Math.PI / 2); assert.ok(l[2] < -0.99, 'facing +x, world -x is behind');
  const m = toFigureFrame([0, 0, -1], 0, 0, Math.PI / 2); assert.ok(m[0] < -0.99 || m[0] > 0.99);
});
test('timeline: 0 outside, rises over about 0.35 s, holds, returns to 0', () => {
  assert.equal(reachWeight(0), 0); assert.equal(reachWeight(-1), 0); assert.equal(reachWeight(REACH_TOTAL), 0); assert.equal(reachWeight(NaN), 0);
  assert.equal(REACH.up, 0.35); assert.equal(reachWeight(REACH.up), 1); assert.equal(reachWeight(REACH.up + REACH.hold / 2), 1);
  assert.ok(reachWeight(REACH.up / 2) > 0.3 && reachWeight(REACH.up / 2) < 0.7);
  let prev = 0; for (let t = 0.01; t <= REACH.up; t += 0.01) { const w = reachWeight(t); assert.ok(w >= prev - 1e-9); prev = w; }
  prev = 1; for (let t = REACH.up + REACH.hold; t < REACH_TOTAL; t += 0.01) { const w = reachWeight(t); assert.ok(w <= prev + 1e-9); prev = w; }
});
test('bend: none at handle height, full for the floor, monotone', () => {
  assert.equal(bendFor(1.0), 0); assert.equal(bendFor(1.3), 0); assert.equal(bendFor(0), 1); assert.equal(bendFor(REACH.bendTo), 1);
  assert.ok(bendFor(0.5) > 0.4 && bendFor(0.5) < 0.7); assert.ok(bendFor(0.3) > bendFor(0.6));
});
test('pose: a handle ahead and to the right uses the right hand, no crouch; a thing on the floor crouches, leans forward, looks down', () => {
  const t = REACH.up + 0.01;
  const h = reachPose([-0.3, 1.0, 0.5], t); assert.equal(h.side, -1); assert.equal(h.crouch, 0); assert.equal(Math.abs(h.lean), 0);
  assert.ok(h.hand.at[0] < 0 && h.hand.at[2] > 0.3, 'wrist forward and right');
  const reach = Math.hypot(h.hand.at[0] - -0.2, h.hand.at[1] - REACH.shoulder, h.hand.at[2] - 0.02); assert.ok(reach <= REACH.arm + 1e-9);
  const f = reachPose([0.4, 0.05, 0.4], t); assert.equal(f.side, 1);
  assert.ok(f.crouch > 0.7 && f.lean < -0.1 && f.head < -0.4, JSON.stringify(f));
  assert.ok(f.hand.at[1] < 1.0 && f.hand.at[1] < h.hand.at[1] - 0.3, 'the wrist goes down for the floor');
  assert.equal(reachPose([-0.3, 1.0, 0.5], 0), null); assert.equal(reachPose([-0.3, 1.0, 0.5], REACH_TOTAL + 1), null);
  const early = reachPose([-0.3, 1.0, 0.5], REACH.up / 2); assert.ok(early.w < 1 && early.w > 0);
});
test('far, behind and malformed targets are ignored', () => {
  const t = REACH.up + 0.01;
  assert.equal(reachPose([0, 1, REACH.range + 0.5], t), null); assert.equal(reachPose([3, 1, 0.5], t), null);
  assert.equal(reachPose([0, 1, -1], t), null); assert.equal(reachPose([NaN, 1, 1], t), null); assert.equal(reachPose(null, t), null);
  assert.ok(reachPose([0, 1, REACH.range - 0.2], t), 'just in range');
});
test('doorsync: a remote change reports who and where; our own echo or an unchanged door does not', () => {
  const door = { isOpen: false, toggle() { this.isOpen = !this.isOpen; }, opening: () => ({ center: [3, 4] }) };
  const ds = new DoorSync({ send: () => {} }), seen = [];
  ds.register('w0', door); ds.onRemote = (by, at, m) => seen.push([by, at, m.o]);
  ds.receive({ t: 'dr', i: 'w0', o: 1, at: 1, by: 'p2' });
  assert.deepEqual(seen, [['p2', [3, null, 4], 1]]);
  ds.receive({ t: 'dr', i: 'w0', o: 1, at: 2, by: 'p2' }); assert.equal(seen.length, 1, 'already open: nothing');
  ds.receive({ t: 'dr', list: [['w0', 0]] }); assert.equal(seen.length, 1, 'the welcome list: nothing');
  assert.equal(ds.where('nope'), null); assert.equal(new DoorSync().where('w0'), null);
});
test('thingshare: another player taking / putting reports where; our own does not', () => {
  const pos = { x: 1, y: 0.4, z: 2 };
  const model = { position: { constructor: Object }, updateWorldMatrix() {}, getWorldPosition: () => pos, visible: true, quaternion: { set() {} } };
  const ts = new ThingShare({ scene: { add() {} }, me: () => 'me', hand: { held: () => null, drop() {}, stowed: () => false } }), seen = [];
  const item = { model, take() {}, goHome() {}, held: false, placed: false, position: model.position };
  const e = ts.register('t0', item); ts.onOther = (by, at, m) => seen.push([by, at, m]);
  ts.apply(e, { m: 'held', by: 'p2' }, 'room'); assert.deepEqual(seen, [['p2', [1, 0.4, 2], 'held']]);
  item.model.position.set = () => {}; item.model.quaternion.set = () => {};
  ts.apply(e, { m: 'world', by: 'p2', p: [5, 0.1, 6], q: [0, 0, 0, 1] }, 'room'); assert.deepEqual(seen[1], ['p2', [5, 0.1, 6], 'world']);
  ts.apply(e, { m: 'world', by: 'me', p: [5, 0.1, 6], q: [0, 0, 0, 1] }, 'room'); ts.apply(e, { m: 'held', by: 'p2' }, 'welcome');
  assert.equal(seen.length, 2);
});

// #2038: free hands at rest (uneven curl, follows the gait) and conversational gestures while talking (src/avatartalk.js).
// node --test tools/avatartalktest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_TALK as T } from '../src/config.js';
import { newTalk, stepTalk, talkHand } from '../src/avatartalk.js';
import { newRest, stepRest, restFingers, gripAngles } from '../src/avatargrip.js';
import { Avatar, armTarget } from '../src/avatar.js';

const DT = 1 / 60;
let now = 0; // the talking mouth (#1122) runs on performance.now: follow the simulated clock
Object.defineProperty(performance, 'now', { value: () => now * 1000, configurable: true, writable: true });
const fing = (av, side) => av.material.userData.u.uFing.value.slice(side ? 5 : 0, side ? 10 : 5).flatMap((v) => [v.x, v.y]);
const make = (look, seed) => { const av = new Avatar(look); av.handRest = newRest(seed); av.talkState = newTalk(seed); return av; }; // (seeded: the same unevenness every run)
const run = (av, secs, state = {}, each = null) => { for (let i = 0; i < Math.round(secs / DT); i++) { now += DT; av.update(DT, state); each?.(av, i); } };

test('talk state: gestures while talking, exactly zero after it ends', () => {
  const s = newTalk(7), heads = [], ys = [], tilts = [];
  for (let i = 0; i < 6 / DT; i++) { const o = stepTalk(s, DT, { talking: true, mouth: 0.5 }); heads.push(o.head); ys.push(o.hand[1][1]); tilts.push(o.tilt); }
  assert.ok(s.amt > 0.95, 'eases in');
  assert.ok(Math.min(...heads) < -T.nod * 0.4, 'nods');
  assert.ok(Math.max(...tilts.map(Math.abs)) > T.tilt * 0.5, 'tilts');
  assert.ok(Math.max(...ys) > T.lift[1] * 0.5 && Math.max(...ys) - Math.min(...ys.slice(60)) > 0.05, 'the right hand lifts and lowers again');
  let o, k = 0;
  for (; k < 5 / DT; k++) { o = stepTalk(s, DT, { talking: false }); if (!o.amt) break; }
  assert.ok(k * DT < 2.5, `back to rest in ${(k * DT).toFixed(2)} s`);
  assert.equal(o.head, 0); assert.equal(o.tilt, 0); assert.deepEqual(o.hand, [[0, 0, 0], [0, 0, 0]]); assert.deepEqual(o.open, [0, 0]);
  const decay = []; const s2 = newTalk(3); for (let i = 0; i < 60; i++) stepTalk(s2, DT, { talking: true });
  for (let i = 0; i < 30; i++) decay.push(stepTalk(s2, DT, { talking: false }).amt);
  assert.ok(decay.every((v, i) => i === 0 || v <= decay[i - 1]), 'decays monotonically (no jump)');
});

test('talk state: a busy hand never moves, a quiet pose mutes everything', () => {
  const s = newTalk(11);
  for (let i = 0; i < 8 / DT; i++) { const o = stepTalk(s, DT, { talking: true, free: [true, false] }); assert.deepEqual(o.hand[1], [0, 0, 0]); assert.equal(o.open[1], 0); }
  const q = newTalk(11);
  for (let i = 0; i < 4 / DT; i++) { const o = stepTalk(q, DT, { talking: true, quiet: 1 }); assert.equal(o.amt, 0); assert.equal(o.head, 0); }
  const h = armTarget.rest(1); assert.equal(talkHand(h, [0, 0, 0]), h);
});

test('rest curl: uneven, mirrored per figure, follows the arm swing and closes when running; zero weight = the grip exactly', () => {
  const r = newRest(5), cur = gripAngles('relaxed');
  stepRest(r, DT); const L = [...restFingers(r, 0, cur)], R = [...restFingers(r, 1, cur)];
  assert.ok(L.every((v, i) => v >= cur[i]) && Math.min(...R.slice(0, 8)) > 0.3 && R[8] > 0.25, 'more bent than the relaxed grip, thumb too');
  assert.ok(L.some((v, i) => Math.abs(v - R[i]) > 0.02), 'the two hands differ');
  const sums = [0, 1, 2, 3].map((f) => R[f * 2] + R[f * 2 + 1]); assert.ok(sums[0] > sums[1] && sums[1] > sums[2] && sums[2] > sums[3], 'little finger most bent, index least');
  const sw = []; for (let i = 0; i < 120; i++) { stepRest(r, DT, { swing: [Math.sin(i * 0.12), -Math.sin(i * 0.12)] }); sw.push(restFingers(r, 1, cur)[2]); }
  assert.ok(Math.max(...sw) - Math.min(...sw) > 0.05, 'the fingers move with the arm swing');
  stepRest(r, 1, { run: 1 }); assert.ok(restFingers(r, 1, cur)[0] > R[0] + 0.2, 'running closes the hand');
  const g = gripAngles('cylinder'); for (let i = 0; i < 60; i++) stepRest(r, DT, { free: [true, false], open: [0, 1] });
  assert.deepEqual([...restFingers(r, 1, g)], [...g], 'a held grip is exactly its shape');
});

test('Avatar: talking lifts a free hand and nods; it all stops; a held cup / Nerf keeps its exact grip', () => {
  const av = make('talk-2038', 1), state = {};
  run(av, 1, state);
  const q = new THREE.Quaternion(), hand = new THREE.Vector3(), rest = av.hand('R', new THREE.Vector3()).clone();
  const restFing = fing(av, 1), grip = gripAngles('relaxed');
  assert.ok(restFing.slice(0, 8).every((v, i) => v > grip[i] + 0.02), 'idle free hand curls beyond the relaxed grip');
  av.talk('Hej! Vad roligt att se dig, har du sett den nya lekstugan? Den är jättefin.', 6);
  let lift = 0, nod = 0, tilt = 0;
  run(av, 4, state, (a) => {
    lift = Math.max(lift, a.hand('R', hand).distanceTo(rest));
    const e = new THREE.Euler().setFromQuaternion(a.bones.head.getWorldQuaternion(q), 'YXZ'); nod = Math.max(nod, Math.abs(e.x)); tilt = Math.max(tilt, Math.abs(e.z));
  });
  assert.ok(lift > 0.08, `the hand lifts (${lift.toFixed(3)} m)`);
  assert.ok(nod > 0.04 && tilt > 0.02, `the head nods ${nod.toFixed(3)} and tilts ${tilt.toFixed(3)}`);
  av.stopTalking(); run(av, 3, state);
  assert.equal(av.talkState.out.amt, 0); assert.equal(av.headTilt, 0);
  assert.ok(av.hand('R', hand).distanceTo(rest) < 0.004, 'the hand back at rest');
  assert.deepEqual(fing(av, 1).map((v) => +v.toFixed(5)), restFing.map((v) => +v.toFixed(5)), 'fingers back at rest');
  for (const [name, h] of [['cylinder', 'cup'], ['pistol', 'nerf']]) { // in lockstep with a silent twin: the holding hand does exactly what it would
    const held = { hands: { R: armTarget.forward(-1, 0.04) } }, a = make('talk-2038', 2), b = make('talk-2038', 2), hb = new THREE.Vector3();
    const both = (secs, each) => { for (let i = 0; i < Math.round(secs / DT); i++) { now += DT; a.update(DT, held); b.update(DT, held); each?.(); } };
    a.setGrip('R', name); b.setGrip('R', name); both(1);
    a.talk('Vill du ha lite kaffe? Det är nybryggt och jättegott, ta en kopp.', 6);
    let moved = 0;
    both(4, () => {
      assert.deepEqual(fing(a, 1).map((v) => +v.toFixed(5)), [...gripAngles(name)].map((v) => +v.toFixed(5)), `${h}: grip untouched`);
      moved = Math.max(moved, a.hand('R', hand).distanceTo(b.hand('R', hb)));
    });
    assert.ok(moved < 1e-6, `${h}: the holding hand does not gesture (${moved})`);
  }
});

test('Avatar: the free fingers follow the walk and close when running', () => {
  const av = make('walk-2038', 3), idle = (run(av, 1, {}), fing(av, 0));
  const walk = []; run(av, 3, { speed: 1.4 }, (a) => walk.push(fing(a, 0)[2]));
  assert.ok(Math.max(...walk.slice(60)) - Math.min(...walk.slice(60)) > 0.03, 'fingers move with the walking arm swing');
  const runs = []; run(av, 3, { speed: 4.2 }, (a) => runs.push(fing(a, 0)[0]));
  assert.ok(runs.slice(-60).reduce((s, v) => s + v, 0) / 60 > idle[0] + 0.15, 'running closes the hand');
});

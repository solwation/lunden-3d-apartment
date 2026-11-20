// #2163: lying-down / getting-up sequence and sleep helpers, headless. node --test tools/avatarsleeptest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sequenceAt, mixPose, lieKeyframes, copyPose, transitionPose } from '../src/avatarmotion.js';
import { newSleep, stepSleep, rollLift } from '../src/avatarsleep.js';
import { newBreath, stepBreath } from '../src/avatarbreath.js';
import { AVATAR_SLEEP as S, AVATAR_BREATH as B, REST } from '../src/config.js';

const pose = (hipY, lean, feetY, feetZ) => ({ hip: [hipY, 0.05], lean, head: 0, turn: 0, flat: 0, toes: 0, hipX: 0, hipRoll: 0, torsoRoll: 0, torsoYaw: 0, knee: [0, 0.5, 1], pitch: [0, 0], footYaw: [0, 0],
  feet: [[0.11, feetY, feetZ], [-0.11, feetY, feetZ]], hands: [1, -1].map(s => ({ at: [s * 0.2, hipY, 0.1], pole: [s, 0, 0] })), can: null });
const seat = pose(0.525, 0.1, 0.05, 0.56), lie = pose(0.9, 1.17, 0.87, 0.83);
const total = d => S[d].reduce((a, b) => a + b, 0);

test('sequence phases and timing run in order, both directions', () => {
  for (const d of ['down', 'up']) {
    let last = { a: 0, e: 0 }, ends = 0;
    for (let t = 0; t < total(d) + 0.5; t += 0.01) {
      const q = sequenceAt(d, t);
      assert.ok(q.a >= last.a, 'stations never go backwards');
      assert.ok(q.e >= 0 && q.e <= 1 + 1e-9);
      if (q.a === last.a) assert.ok(q.e >= last.e - 1e-9, 'eased progress monotone within a leg');
      if (q.a !== last.a) ends++;
      last = q;
    }
    assert.equal(ends, 2, d + ': three legs');
    assert.ok(sequenceAt(d, total(d) - 0.01).done === false && sequenceAt(d, total(d) + 0.01).done);
    assert.deepEqual([sequenceAt(d, 0).a, sequenceAt(d, 0).b], [0, 1]);
  }
  assert.ok(total('down') > 1.5 && total('down') < 4 && total('up') > 1.5 && total('up') < 4, 'a short sequence, not a snap');
});

test('keyframes: sit has the hips at the lying hips and the feet on the mattress; legs up has straight legs and a half-propped torso', () => {
  const k = lieKeyframes(seat, lie);
  assert.equal(k.sit.hip[0], lie.hip[0]);
  assert.equal(k.sit.feet[0][1], lie.feet[0][1]); assert.equal(k.sit.feet[0][2], S.sitFeet);
  assert.deepEqual(k.legs.feet[0], lie.feet[0]);
  assert.ok(k.legs.lean > k.sit.lean && k.legs.lean < k.lie.lean, 'torso between upright and flat');
  assert.deepEqual(k.lie.feet[1], lie.feet[1]);
  const mid = mixPose({}, k.sit, k.legs, 0.5);
  assert.ok(Math.abs(mid.feet[0][2] - (k.sit.feet[0][2] + k.legs.feet[0][2]) / 2) < 1e-9);
});

const fakeAv = target => ({ pendingPose: copyPose({}, target) });
test('transitionPose plays the sequence over several frames and ends on the target, lying down and getting up', () => {
  const av = fakeAv(seat), frame = [0, 0, 0, 0, 1, 1], keys = n => copyPose({}, n === 2 ? lie : seat);
  transitionPose(av, 1 / 60, 1, {}, frame, false, keys);
  for (let i = 0; i < 30; i++) { av.pendingPose = copyPose({}, seat); transitionPose(av, 1 / 60, 1, {}, frame, false, keys); }
  const seen = [];
  for (let t = 0; t < total('down') + 0.3; t += 1 / 60) { av.pendingPose = copyPose({}, lie); transitionPose(av, 1 / 60, 2, {}, frame, false, keys); seen.push(av.pendingPose.lean); }
  assert.ok(seen[0] < 0.5, 'starts near upright: ' + seen[0]);
  assert.ok(seen.some(l => l > 0.4 && l < 1.1), 'passes through the propped stage');
  assert.ok(Math.abs(seen.at(-1) - lie.lean) < 1e-6, 'ends lying');
  assert.ok(seen.slice(1).every((l, i) => Math.abs(l - seen[i]) < 0.1), 'no single-frame jumps');
  const up = [];
  for (let t = 0; t < total('up') + 0.3; t += 1 / 60) { av.pendingPose = copyPose({}, seat); transitionPose(av, 1 / 60, 1, {}, frame, false, keys); up.push(av.pendingPose.lean); }
  assert.ok(Math.abs(up[0] - lie.lean) < 0.1, 'starts lying: ' + up[0]);
  assert.ok(Math.abs(up.at(-1) - seat.lean) < 1e-6, 'ends seated');
  assert.ok(up.slice(1).every((l, i) => Math.abs(l - up[i]) < 0.1), 'no jumps getting up');
  // a far teleport skips the sequence
  av.pendingPose = copyPose({}, lie); transitionPose(av, 1 / 60, 2, {}, [S.reset + 5, 0, 0, 0, 1, 1], false, keys);
  assert.ok(Math.abs(av.pendingPose.lean - lie.lean) < 1e-6);
});

const seeded = () => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
test('eyes shut after the threshold lying, open again on leaving', () => {
  const rnd = seeded(), s = newSleep(rnd);
  let t = 0;
  while (t < S.eyes.after[0] - 0.5) { stepSleep(s, 0.05, true, rnd); t += 0.05; }
  assert.equal(s.eyes, 0, 'awake at first');
  while (t < S.eyes.after[1] + S.eyes.close + 0.5) { stepSleep(s, 0.05, true, rnd); t += 0.05; }
  assert.equal(s.eyes, 1, 'shut after the threshold');
  for (let i = 0; i < Math.ceil(S.eyes.open / 0.05) + 2; i++) stepSleep(s, 0.05, false, rnd);
  assert.equal(s.eyes, 0, 'open again');
  assert.equal(s.depth, 0);
});

test('breathing slows when asleep and only then', () => {
  const awake = newBreath(0), asleep = newBreath(0); asleep.sleep = 1;
  let a = 0, b = 0;
  for (let t = 0; t < 120; t += 0.05) { a += stepBreath(awake, 0.05, 0); b += stepBreath(asleep, 0.05, 0); }
  assert.ok(b < a * (S.breath + 0.05) && b > a * (S.breath - 0.08), `exhales ${a} awake vs ${b} asleep`);
});

test('the side turn happens now and then and stays bounded; leaving the bed rolls back', () => {
  const rnd = seeded(), s = newSleep(rnd);
  let max = 0, turns = 0, prev = 0;
  for (let t = 0; t < 1800; t += 0.1) {
    stepSleep(s, 0.1, true, rnd); max = Math.max(max, Math.abs(s.roll));
    if (Math.abs(s.rollTo - prev) > 0.5) turns++; prev = s.rollTo;
    assert.ok(Math.abs(s.roll) <= S.turn.roll + 1e-9);
  }
  assert.ok(turns >= 5 && turns <= 60, 'turns in 30 min: ' + turns);
  assert.ok(max > S.turn.roll * 0.9, 'actually reaches the side');
  for (let i = 0; i < 40; i++) stepSleep(s, 0.1, false, rnd);
  assert.equal(s.roll, 0);
  // no turn before it is asleep
  const t0 = newSleep(rnd); for (let t = 0; t < S.eyes.after[0] - 1; t += 0.1) stepSleep(t0, 0.1, true, rnd);
  assert.equal(t0.roll, 0);
});

test('during the side turn the head and torso stay within a few cm of the back-lying height (roll, not sit-up)', () => {
  const rnd = seeded(), s = newSleep(rnd), head = REST.avatarLieTorso * Math.sin(REST.avatarLieTilt), shoulder = 0.2;
  let worst = 0;
  for (let t = 0; t < 600; t += 0.05) {
    stepSleep(s, 0.05, true, rnd);
    for (const h of [head, head * 0.5]) worst = Math.max(worst, Math.abs(rollLift(h, s.roll)));
    // a shoulder's own sideways offset adds sin(roll) * shoulder above the axis on the upper side: still below the arm's thickness
    assert.ok(shoulder * Math.sin(Math.abs(s.roll)) < 0.12);
  }
  assert.ok(worst < 0.05, 'head height change ' + worst);
});

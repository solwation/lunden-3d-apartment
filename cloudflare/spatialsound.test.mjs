// The helpers for sounds from other players (#1302): distance fade, voice cap, footstep cadence / conditions.
//   node --test cloudflare/spatialsound.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceGain, VoiceCap, strideFor, makesSteps } from '../src/spatialsound.js';
import { SOUNDS } from '../src/config.js';

test('distanceGain: 1 at the source, falling to 0 at the range, 0 beyond or for junk', () => {
  assert.equal(distanceGain(0, 20), 1);
  assert.ok(distanceGain(5, 20) > distanceGain(10, 20) && distanceGain(10, 20) > distanceGain(19, 20));
  assert.equal(distanceGain(20, 20), 0); assert.equal(distanceGain(99, 20), 0);
  assert.equal(distanceGain(NaN, 20), 0); assert.equal(distanceGain(-1, 20), 0); assert.equal(distanceGain(1, undefined), 0);
});

test('VoiceCap: at most max voices at once, slots free again when they end', () => {
  const v = new VoiceCap(SOUNDS.maxVoices);
  assert.ok(SOUNDS.maxVoices <= 8);
  for (let i = 0; i < SOUNDS.maxVoices; i++) assert.ok(v.take(0, 1), `voice ${i}`);
  assert.equal(v.take(0.5, 1), false, 'full');
  assert.equal(v.busy(0.5), SOUNDS.maxVoices);
  assert.ok(v.take(1.01, 1), 'free after the others ended');
  assert.equal(v.busy(1.01), 1);
});

test('footsteps: cadence by speed, only walking on the ground', () => {
  assert.equal(strideFor(1.5, SOUNDS), SOUNDS.stride.walk);
  assert.equal(strideFor(5, SOUNDS), SOUNDS.stride.run);
  const base = { speed: 1.5, vy: 0, crouch: 0, pose: 0, riding: false, jp: 0 };
  assert.ok(makesSteps(base, SOUNDS));
  for (const bad of [{ speed: 0.1 }, { speed: 30 }, { vy: 4 }, { crouch: 1 }, { pose: 1 }, { riding: true }, { jp: 2 }]) assert.equal(makesSteps({ ...base, ...bad }, SOUNDS), false, JSON.stringify(bad));
  assert.ok(makesSteps({ ...base, jp: 1 }, SOUNDS), 'a worn but idle jetpack still walks');
});

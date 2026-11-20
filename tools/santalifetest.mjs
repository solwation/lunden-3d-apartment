import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SANTA } from '../src/santaconfig.js';
import { breathing, headYawToward, headPitchToward, approach, sleepPose, laughShake, regionWeights } from '../src/santalife.js';
import { Santa } from '../src/santa.js';
import { LANDSKRONA } from '../src/config.js';

const L = SANTA.life;
const range = (f, n = 400, span = 30) => { const v = Array.from({ length: n }, (_, i) => f(i / n * span)); return [Math.min(...v), Math.max(...v)]; };

test('breathing: rate and amplitude, deeper and slower asleep, laugh adds', () => {
  const [a0, a1] = range(t => breathing(t, false)), [s0, s1] = range(t => breathing(t, true));
  assert.ok(a1 - a0 > 0.012 && a1 - a0 < 0.03, `awake swing ${a1 - a0}`);
  assert.ok(s1 - s0 > a1 - a0, 'sleeping breaths are deeper');
  assert.ok(L.breath.asleep.hz < L.breath.awake.hz);
  assert.ok(breathing(1, false, 1) > breathing(1, false, 0) + 0.02, 'laughter pushes the belly out');
  // period check: one value repeats after 1/hz
  assert.ok(Math.abs(breathing(2, true) - breathing(2 + 1 / L.breath.asleep.hz, true)) < 1e-9);
});

test('head yaw faces a target and clamps to a natural range', () => {
  assert.equal(headYawToward({ x: 0, z: 2 }), 0);
  assert.ok(Math.abs(headYawToward({ x: 1, z: 1 }) - Math.PI / 4) < 1e-9);
  assert.ok(headYawToward({ x: -1, z: 1 }) < 0);
  assert.equal(headYawToward({ x: 3, z: -1 }), L.head.maxYaw, 'target behind: clamped, never a full turn');
  assert.equal(headYawToward({ x: -3, z: -1 }), -L.head.maxYaw);
  for (const bad of [null, { x: NaN, z: 1 }, { x: 0, z: 0 }]) assert.equal(headYawToward(bad), 0);
  assert.equal(headPitchToward(10, 1), -L.head.maxPitch);
  assert.ok(headPitchToward(-0.2, 2) > 0, 'looking down tips the head forward');
  const v = approach(0, 1, 0.1, L.head.rate); assert.ok(v > 0.2 && v < 0.5);
  assert.ok(Math.abs(approach(0, 1, 1 / 30, 4) - approach(approach(0, 1, 1 / 60, 4), 1, 1 / 60, 4)) < 1e-9, 'frame-rate independent');
});

test('sleep pose: leaned back, head sags, snaps up in a nod, periodic', () => {
  const p = sleepPose(1);
  assert.ok(p.lean > 0.2 && p.lean < 0.45, 'leans back into the sofa');
  assert.ok(p.roll < 0, 'toward the +x corner');
  const [lo, hi] = range(t => sleepPose(t).headPitch, 2000, L.sleep.nodEvery);
  assert.ok(lo > 0.2 && hi - lo > 0.25, `head drops (${lo}..${hi})`);
  const sag = Array.from({ length: 2000 }, (_, i) => sleepPose(i / 2000 * L.sleep.nodEvery).sag);
  const peak = sag.indexOf(Math.max(...sag)), after = sag[Math.min(1999, peak + 80)];
  assert.ok(Math.max(...sag) > 0.95 && after < 0.5, 'quick recovery after the sag peak: a nod');
  assert.ok(Math.abs(sleepPose(3).sag - sleepPose(3 + L.sleep.nodEvery).sag) < 1e-9);
  for (const t of [0, 5.5, 10.9, 11, 1e5]) assert.ok(Object.values(sleepPose(t)).every(Number.isFinite));
});

test('laugh shake: bounded, oscillating, zero outside the laugh', () => {
  assert.equal(laughShake(-0.1), 0); assert.equal(laughShake(L.laugh.seconds + 0.01), 0); assert.equal(laughShake(NaN), 0);
  const [lo, hi] = range(t => laughShake(t, L.laugh.seconds), 800, L.laugh.seconds);
  assert.ok(hi > 0.8 && lo < -0.8 && hi <= 1 && lo >= -1);
});

test('region weights: head above the neck, belly front-lower, never both', () => {
  assert.deepEqual(regionWeights(0, 0.85, 0.1).map(Math.round), [1, 0]);
  assert.deepEqual(regionWeights(0, 0.3, 0.25), [0, 1]);
  assert.deepEqual(regionWeights(0, 0.3, -0.2), [0, 0], 'back of the coat is still');
  assert.deepEqual(regionWeights(0, 0.02, 0.2), [0, 0], 'hem is still');
  for (let y = 0; y < 1.2; y += 0.02) { const [h, b] = regionWeights(0.1, y, 0.1); assert.ok(h + b <= 1 + 1e-9); }
});

function guest(hour) {
  const scene = new THREE.Scene(), pickable = new THREE.Group(); scene.add(pickable);
  pickable.userData.rest = { spots: [-.35, .2, .75].map(x => ({ x, y: LANDSKRONA.seatHeight, z: -.08 })) };
  return new Santa({ scene, sofa: { pickable, spots: [{}, {}, {}] }, day: { month: 12, date: 24, hour } });
}

test('actual Santa: watches the TV, turns to the visitor, leans back asleep, shader uniforms stay finite', () => {
  const s = guest(15); s.update(0);
  const u = s.fig.body.material.userData.santa, yaw = () => Math.atan2(-u.uHeadRot.value.elements[6], u.uHeadRot.value.elements[0]);
  s.object.parent.updateWorldMatrix(true, true);
  const tv = new THREE.Vector3(2, 1, 2); s.tv = () => tv; s.viewer = () => new THREE.Vector3(-2, 1, 2);
  for (let i = 0; i < 120; i++) s.update(1 / 30);
  assert.ok(s.pose.yaw > 0.5, `looks toward the TV: ${s.pose.yaw}`);
  s.greet(); for (let i = 0; i < 45; i++) s.update(1 / 30);
  assert.ok(s.pose.yaw < -0.5, `then toward the visitor: ${s.pose.yaw}`);
  for (let i = 0; i < 300; i++) s.update(1 / 30);
  assert.ok(s.pose.yaw > 0.5, 'back to the TV after the greeting');
  s.day.hour = 16; for (let i = 0; i < 90; i++) s.update(1 / 30);
  assert.ok(s.sleeping && s.fig.torso.rotation.x < -0.2 && s.object.rotation.z === 0, 'sleeps upright-seated, torso leaned back');
  assert.ok(s.pose.pitch > 0.15, 'head has dropped');
  assert.ok(Number.isFinite(yaw()) && Number.isFinite(u.uBelly.value) && Number.isFinite(u.uShake.value));
  assert.ok(s.fig.body.geometry.getAttribute('region').count === s.fig.body.geometry.getAttribute('position').count);
});

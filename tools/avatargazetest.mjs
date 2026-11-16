// #2011: blinking and the living gaze, headless. node --test tools/avatargazetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { newBlink, stepBlink, solveGaze, chooseGazeTarget } from '../src/avatargaze.js';
import { Avatar } from '../src/avatar.js';
import { AVATAR_BLINK as B, AVATAR_GAZE as G, avatarLook } from '../src/config.js';

const seeded = (n) => () => (n = (n * 1664525 + 1013904223) % 4294967296) / 4294967296;

test('#2011 blinks come 2-6 s apart, sometimes twice, and reach fully shut', () => {
  const rnd = seeded(7), s = newBlink(rnd), starts = [];
  let prev = 0, max = 0, t = 0;
  for (let i = 0; i < 60 * 600; i++, t += 1 / 60) {
    const a = stepBlink(s, 1 / 60, rnd);
    assert(a >= 0 && a <= 1);
    if (a > 0 && prev === 0) starts.push(t);
    max = Math.max(max, a); prev = a;
  }
  assert.equal(max, 1);
  const gaps = starts.slice(1).map((v, i) => v - starts[i]), doubles = gaps.filter((g) => g < 1).length, singles = gaps.filter((g) => g >= 1);
  assert(doubles > 0 && doubles < gaps.length * 0.4, `double blinks ${doubles} of ${gaps.length}`);
  assert(singles.length > 40 && Math.min(...singles) > B.interval[0] - 0.05 && Math.max(...singles) < B.interval[1] + B.close + B.hold + B.open + 0.1, `gaps ${Math.min(...singles)} .. ${Math.max(...singles)}`);
  const mean = singles.reduce((a, b) => a + b) / singles.length;
  assert(mean > 3 && mean < 5.5, `mean interval ${mean}`);
});

test('#2011 the gaze solution never leaves its limits', () => {
  const rnd = seeded(3), eyeYaw = [], headYaw = [];
  for (let i = 0; i < 5000; i++) {
    const yaw = (rnd() * 2 - 1) * Math.PI, pitch = (rnd() * 2 - 1) * 1.2, turn = (rnd() * 2 - 1) * 1.1, hp = (rnd() * 2 - 1) * 0.6;
    const r = solveGaze(yaw, pitch, turn, hp);
    assert(Math.abs(r.yaw) <= G.maxYaw + 1e-9 && Math.abs(r.pitch) <= G.maxPitch + 1e-9 && Math.abs(r.ex) <= 1 && Math.abs(r.ey) <= 1);
    headYaw.push(Math.abs(r.yaw)); eyeYaw.push(Math.abs(r.ex));
  }
  assert.equal(Math.max(...headYaw), G.maxYaw); // reached, not exceeded
  assert.deepEqual(solveGaze(3, 0, 0, 0), { yaw: 0, pitch: 0, ex: 0, ey: 0 }, 'a target behind is not looked at');
  const near = solveGaze(0.3, 0, 0, 0);
  assert(near.yaw > 0 && near.ex > 0 && Math.abs(near.yaw + near.ex * G.eyeYaw - 0.3) < 1e-9, 'head and eyes together cover a small angle');
});

test('#2011 the talking one is looked at before the nearest; out of range: nobody', () => {
  const c = [{ x: 2, y: 1.6, z: 0 }, { x: 4, y: 1.6, z: 0, talking: true }, { x: 20, y: 1.6, z: 0, talking: true }];
  assert.equal(chooseGazeTarget({ x: 0, z: 0 }, c), 1);
  c[1].talking = false; assert.equal(chooseGazeTarget({ x: 0, z: 0 }, c), 0);
  c[0].skip = true; assert.equal(chooseGazeTarget({ x: 0, z: 0 }, c), 1);
  assert.equal(chooseGazeTarget({ x: 100, z: 0 }, c), -1);
});

test('#2011 an avatar blinks, looks and turns its head within the limits; hidden eyes do nothing', () => {
  const a = new Avatar(avatarLook('2011-gaze')), u = a.material.userData.u;
  a.object.updateMatrixWorld(true);
  const worldFront = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(a.object.matrixWorld);
  a.lookAt(worldFront(0.8, 1.7, 2)); // ahead and to the left, in the figure's own frame
  let blinks = 0, wasShut = false, maxYaw = 0, maxPitch = 0, maxX = 0, maxY = 0;
  for (let i = 0; i < 60 * 30; i++) {
    a.update(1 / 60, {});
    const e = a.eyes;
    maxYaw = Math.max(maxYaw, Math.abs(e.yaw)); maxPitch = Math.max(maxPitch, Math.abs(e.pitch));
    maxX = Math.max(maxX, Math.abs(u.uGaze.value.x)); maxY = Math.max(maxY, Math.abs(u.uGaze.value.y));
    const shut = u.uBlink.value > 0.95; if (shut && !wasShut) blinks++; wasShut = shut;
  }
  assert(blinks >= 5 && blinks <= 16, `blinks in 30 s: ${blinks}`);
  assert(maxYaw > 0.05 && maxYaw <= G.maxYaw && maxPitch <= G.maxPitch, `head yaw ${maxYaw}, pitch ${maxPitch}`);
  assert(maxX <= G.eye[0] + G.saccade.amp[0] + 1e-9 && maxY <= G.eye[1] + G.saccade.amp[1] + 1e-9 && maxX > 0.001, `iris ${maxX}, ${maxY}`);
  // (the suit's own texture needs a canvas, so the flag the eyes check is set directly)
  for (const hide of [() => { a.suit = true; }, () => { a.suit = false; u.uGlasses.value = 3; }]) {
    hide();
    for (let i = 0; i < 600; i++) a.update(1 / 60, {});
    assert.equal(u.uBlink.value, 0); assert.equal(u.uGaze.value.length(), 0); assert.equal(a.eyes.yaw, 0);
  }
});

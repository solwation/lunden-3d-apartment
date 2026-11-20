// #2167: onlookers' hit flinch and knockout collapse, headless. node --test tools/avatarknocktest.mjs (needs `three` resolvable).
// lifeEvent (drop = hit, rise + teleport = knockout, nothing else), nearestShooter, the collapse timeline and its direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lifeEvent, nearestShooter, knockPose, KNOCK_TOTAL } from '../src/avatarknock.js';
import { hitDir } from '../src/avatarhit.js';
import { AVATAR_KNOCK as K } from '../src/config.js';

test('#2167 lives drop = hit; rise together with a teleport = knockout; no reaction on anything else', () => {
  assert.equal(lifeEvent(3, 2, false), 'hit');
  assert.equal(lifeEvent(1, 0, false), 'hit');
  assert.equal(lifeEvent(1, 3, true), 'ko');
  assert.equal(lifeEvent(2, 3, false), null, 'a heal (no teleport) is no reaction');
  assert.equal(lifeEvent(3, 3, true), null, 'a teleport with unchanged lives (the children\'s room) is no reaction');
  assert.equal(lifeEvent(null, 3, true), null, 'first state');
  assert.equal(lifeEvent(3, null, true), null, 'an older client without lives');
  assert.equal(lifeEvent(3, 3, false), null);
});

test('#2167 the nearest armed player within range is the shooter, never the target itself', () => {
  const at = { x: 0, z: 0 }, a = { x: 10, z: 0 }, b = { x: 3, z: 4 }, far = { x: K.range + 5, z: 0 }, self = { x: 0.5, z: 0 };
  assert.equal(nearestShooter(at, [a, b]), b);
  assert.equal(nearestShooter(at, [far]), null);
  assert.equal(nearestShooter(at, [self, a], self), a);
  assert.equal(nearestShooter(at, []), null);
});

test('#2167 the collapse: sinks first, then topples, held to the total, then over (the teleport shows)', () => {
  const dir = [0, -1], at = (s) => knockPose(s, dir) && { ...knockPose(s, dir), axis: [...knockPose(s, dir).axis] };
  assert.equal(knockPose(-0.1, dir), null);
  const start = at(0), sunk = at(K.sink), mid = at(K.sink + K.fall / 2), down = at(K.sink + K.fall), lying = at(KNOCK_TOTAL - 0.01);
  assert.equal(start.crouch, 0); assert.equal(start.tilt, 0);
  assert(Math.abs(sunk.crouch - 1) < 1e-9 && sunk.tilt === 0 && sunk.head < -0.3, 'squatted before it goes over');
  assert(mid.tilt > 0.2 && mid.tilt < down.tilt, 'toppling');
  assert(down.tilt > 1.2 && lying.tilt === down.tilt && lying.crouch === 1, 'lies still until the end');
  assert.equal(knockPose(KNOCK_TOTAL, dir), null); assert.equal(knockPose(KNOCK_TOTAL + 1, dir), null);
  assert(KNOCK_TOTAL >= 1 && KNOCK_TOTAL <= 1.5, 'about 1 - 1.5 s');
  let last = -1; for (let s = 0; s < KNOCK_TOTAL; s += 0.02) { const p = knockPose(s, dir); assert(p.tilt >= last - 1e-12); last = p.tilt; } // never rises again
});

test('#2167 it falls away from the shooter: the body\'s up vector tips along the shot\'s direction (figure frame)', () => {
  const up = new THREE.Vector3(), q = new THREE.Quaternion(), ax = new THREE.Vector3();
  for (const [name, shooter] of [['front', { x: 0, z: 5 }], ['behind', { x: 0, z: -5 }], ['left', { x: 5, z: 0 }], ['right', { x: -5, z: 0 }]]) {
    const dir = hitDir(shooter, { x: 0, z: 0 }, 0), p = knockPose(KNOCK_TOTAL - 0.01, dir);
    q.setFromAxisAngle(ax.set(p.axis[0], 0, p.axis[1]), p.tilt); up.set(0, 1, 0).applyQuaternion(q);
    assert(up.x * dir[0] + up.z * dir[1] > 0.95, `${name}: tips along ${dir}, got ${up.toArray()}`);
    assert(up.y < 0.15 && p.lift > 0.05, `${name}: lying`);
  }
});

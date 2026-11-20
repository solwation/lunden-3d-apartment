// #2229: the e-scooters' pure rules (src/scootermotion.js): speed caps tuned / untuned, acceleration, the tuning progress, the jump
// bookkeeping and the slow-motion threshold, the chase camera and the pavement spots. node --test tools/scooter2229test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { scooterSpeed, scooterTakeoff, kmh, tuneStep, newJump, trackJump, jumpCm, newSlowMo, slowMoStep, chaseCamera, scooterSpots } from '../src/scootermotion.js';
import { bicycleSpeed } from '../src/bikemotion.js';
import { SCOOTER as S, BICYCLE, SITE } from '../src/config.js';
import { samples, onWalk, onVehicle } from '../src/roads.js';
import { COUNTERS, BOARD_LISTS } from '../src/boardcatalog.js';
import { MEDALS } from '../src/medalcatalog.js';

const ride = (tuned, seconds, { dt = 1 / 60, pitch = 0, input = 1, v = 0 } = {}) => { for (let t = 0; t < seconds - 1e-9; t += dt) v = scooterSpeed(v, input, pitch, false, dt, tuned); return v; };
const timeTo = (tuned, target, dt = 1 / 60) => { let v = 0, t = 0; while (v < target && t < 60) { v = scooterSpeed(v, 1, 0, false, dt, tuned); t += dt; } return t; };

test('an untuned scooter stops at 20 km/h, also downhill', () => {
  for (const dt of [1 / 120, 1 / 60, 0.05, 0.1]) {
    assert.equal(kmh(ride(false, 20, { dt })), 20);
    assert(ride(false, 20, { dt, pitch: -0.3 }) <= 20 / 3.6 + 1e-9, 'downhill stays capped');
    assert(ride(false, 20, { dt, pitch: 0.15 }) < 20 / 3.6, 'uphill is slower');
  }
});

test('a tuned scooter reaches 90 km/h and never more, with faster acceleration', () => {
  assert.equal(kmh(ride(true, 30)), 90);
  assert(ride(true, 30, { pitch: -0.4 }) <= 90 / 3.6 + 1e-9);
  const slow = timeTo(false, 15 / 3.6), fast = timeTo(true, 15 / 3.6);
  assert(fast < slow * 0.5, `tuned ${fast.toFixed(2)} s vs ${slow.toFixed(2)} s to 15 km/h`);
  assert(timeTo(true, 80 / 3.6) < 6, '0-80 km/h within a few seconds');
  // the bicycle's own profile is untouched by the profile parameter
  let b = 0; for (let t = 0; t < 4; t += 1 / 60) b = bicycleSpeed(b, 1, 0, false, 1 / 60);
  let c = 0; for (let t = 0; t < 4; t += 1 / 60) c = bicycleSpeed(c, 1, 0, false, 1 / 60, BICYCLE);
  assert.equal(b, c);
});

test('braking, coasting and reverse follow the bicycle rules with the scooter limits', () => {
  const v = ride(true, 10);
  assert(scooterSpeed(v, -1, 0, false, 0.1, true) < v - 0.5, 'S brakes');
  assert(scooterSpeed(v, 0, 0, false, 0.1, true) < v, 'released: coasts down');
  assert(ride(false, 3, { input: -1 }) >= -S.untuned.reverse - 1e-9);
  assert.equal(scooterSpeed(3, NaN, NaN, false, NaN, false), 3);
});

test('kerb and crest take-off: lower launch speed than the bicycle, lift capped by the profile', () => {
  const h = 0.005;
  assert(S.untuned.motion.launchSpeed < BICYCLE.motion.launchSpeed);
  assert(scooterTakeoff(20 / 3.6, 2, 0, h, 0.01, false) > 0, 'a 20 km/h scooter hops a kerb');
  assert.equal(scooterTakeoff(S.untuned.motion.launchSpeed - 0.1, 2, 0, h, 0.01, false), 0, 'too slow');
  assert.equal(scooterTakeoff(25, 20, 0, h, 0.01, true), S.tuned.motion.maxLift);
  assert.equal(scooterTakeoff(25, 20, 0, h, 0.01, false), S.untuned.motion.maxLift);
  assert.equal(scooterTakeoff(25, 0, 0, h, 0.01, true), 0, 'no lift without a rising support');
});

test('tuning progress: only while held AND aimed, pauses on release, done at SCOOTER.tune.time', () => {
  assert(S.tune.time >= 8 && S.tune.time <= 12, 'shorter than the fuse box');
  let p = 0;
  p = tuneStep(p, 3, true, true).progress; assert.equal(p, 3);
  p = tuneStep(p, 3, false, true).progress; assert.equal(p, 3, 'released: paused');
  p = tuneStep(p, 3, true, false).progress; assert.equal(p, 3, 'looking away: paused');
  const r = tuneStep(p, 100, true, true);
  assert.equal(r.progress, S.tune.time); assert.equal(r.fraction, 1); assert.equal(r.done, true);
  assert.equal(tuneStep(NaN, -1, true, true).progress, 0);
});

test('jumps: counted on landing from SCOOTER.jump.min clear, the highest clearance', () => {
  const j = newJump();
  assert.equal(trackJump(j, false, 0), null);
  for (const c of [0.05, 0.3, 0.42, 0.2]) assert.equal(trackJump(j, true, c), null);
  assert.deepEqual(trackJump(j, false, 0), { height: 0.42 });
  assert.equal(trackJump(j, false, 0), null, 'once');
  trackJump(j, true, S.jump.min / 2);
  assert.equal(trackJump(j, false, 0), null, 'a ripple is no jump');
  assert.equal(jumpCm(0.426), 43); assert.equal(jumpCm(1e9), S.jump.maxCm); assert.equal(jumpCm(NaN), 0);
});

test('slow motion: from SCOOTER.jump.slowmo m clear, latched until the landing, eased; 1 when off', () => {
  const s = newSlowMo();
  assert.equal(slowMoStep(s, 1 / 60, true, true, S.jump.slowmo - 0.05), 1, 'below the threshold: real time');
  let scale = 1;
  for (let i = 0; i < 120; i++) scale = slowMoStep(s, 1 / 60, true, true, S.jump.slowmo + 0.2);
  assert(s.on); assert(Math.abs(scale - S.jump.scale) < 0.01);
  scale = slowMoStep(s, 1 / 60, true, true, 0.3); assert(s.on, 'latched while still in the air');
  for (let i = 0; i < 240; i++) scale = slowMoStep(s, 1 / 60, true, false, 0);
  assert(!s.on); assert.equal(scale, 1); assert.equal(s.k, 0);
  for (let i = 0; i < 30; i++) slowMoStep(s, 1 / 60, true, true, 5);
  slowMoStep(s, 1 / 60, false, true, 5); assert(!s.on, 'not riding: off');
});

test('chase camera: behind and above, looking down at the rider, heading kept', () => {
  for (const yaw of [0, 1, -2.5]) {
    const c = chaseCamera(10, 2, -5, yaw);
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    assert(((c.x - 10) * fx + (c.z + 5) * fz) < -S.chase.back + 1e-9, 'behind');
    assert.equal(c.y, 2 + S.chase.up);
    assert(c.pitch < 0);
    assert.equal(c.yaw, yaw - Math.PI / 2, 'the camera yaw the bicycle steering reads');
  }
});

test('pavement spots: deterministic, on the pavement, off the carriageway, spaced, fewer on phones', () => {
  const ok = (x, z) => onWalk(x, z, -0.35) && !onVehicle(x, z, 0.6);
  const a = scooterSpots(SITE.roads, samples, ok), b = scooterSpots(SITE.roads, samples, ok);
  assert.deepEqual(a, b);
  assert.equal(a.length, S.count);
  assert.equal(scooterSpots(SITE.roads, samples, ok, S.lowMemoryCount).length, S.lowMemoryCount);
  for (const p of a) {
    assert(onWalk(p.x, p.z, -0.35), `on the pavement ${p.x},${p.z}`);
    assert(!onVehicle(p.x, p.z, 0.6), `off the road ${p.x},${p.z}`);
    // the whole scooter (wheel to wheel) on the pavement too
    for (const t of [BICYCLE.wheelRear, BICYCLE.wheelFront]) assert(onWalk(p.x + Math.cos(p.yaw) * t, p.z - Math.sin(p.yaw) * t, 0), 'both wheels on the pavement');
    assert(Math.hypot(p.x - S.area.x, p.z - S.area.z) <= S.area.r);
    for (const q of a) if (q !== p) assert(Math.hypot(p.x - q.x, p.z - q.z) >= S.spacing);
    assert(Number.isFinite(p.yaw));
  }
});

test('statistics are accepted by the Worker catalogue and give medals and a top list', () => {
  for (const k of ['scooterMetres', 'scooterJumps', 'scooterJumpCm', 'scooterTopKmh', 'scooterTunes']) {
    assert(COUNTERS[k] && COUNTERS[k].perMin > 0 && COUNTERS[k].start > 0, k);
  }
  assert(COUNTERS.scooterMetres.perMin >= 90 / 3.6 * 60, 'a tuned scooter\'s metres per minute fit');
  assert(COUNTERS.scooterJumpCm.perMin >= S.jump.maxCm && COUNTERS.scooterJumpCm.start >= S.jump.maxCm, 'one record jump fits');
  assert(COUNTERS.scooterTopKmh.start >= 90);
  assert(BOARD_LISTS.some((l) => l.counter === 'scooterJumpCm' && l.kind === 'most'));
  for (const c of ['scooterMetres', 'scooterJumps', 'scooterTunes']) assert(MEDALS.some((m) => m.counter === c), c);
});

// #2148: riding motion helper (src/bikeride.js): cadence, freewheel, lean, pitch, standing, steering, vertex parts.
// node --test tools/avatarbiketest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newBikeRide, stepBikeRide, cadenceRate, gearRatio, bikeGrip, bikeSeat, bikeVertexParts, bikeVertexAt } from '../src/bikeride.js';
import { BIKE_RIDE as R } from '../src/config.js';

const run = (secs, speed, yaw = 0, slope = 0, s = newBikeRide(), dt = 1 / 60) => { for (let t = 0; t < secs - 1e-9; t += dt) stepBikeRide(s, dt, typeof speed === 'function' ? speed(t) : speed, yaw, slope); return s; };
const rpm = (rate) => rate * 60 / (2 * Math.PI);

test('cadence comes from speed and a gear, not ~240 rpm at 5 m/s', () => {
  const c5 = rpm(cadenceRate(5)), c11 = rpm(cadenceRate(11));
  assert(c5 > 40 && c5 < 80, `5 m/s: ${c5}`); assert(c11 > c5 && c11 < 110, `11 m/s: ${c11}`);
  assert(gearRatio(0) === R.gear.low && gearRatio(99) === R.gear.high);
  const s = run(3, 5); assert(Math.abs(rpm(s.crankRate) - c5) < 3);
});

test('wheels roll with the speed (negative about z going forward) and keep turning in a freewheel', () => {
  const s = run(1, 5); assert(Math.abs(s.wheel) > 0); const w0 = s.wheel;
  stepBikeRide(s, 0.05, 5, 0, 0); assert(s.wheel !== w0);
  const t = newBikeRide(); stepBikeRide(t, 0.02, 5, 0, 0); assert(t.wheel < 0 && Math.abs(t.wheel + 5 / R.wheelRadius * 0.02) < 1e-9);
});

test('freewheel: braking and downhill stop the crank while the wheels turn; pedalling resumes', () => {
  const s = run(2, 6); assert(!s.freewheel && s.crankRate > 3);
  const b = run(1.5, (t) => Math.max(1, 6 - 3 * t), 0, 0, s); assert(b.freewheel, 'decelerating'); assert(b.crankRate === 0, `crank stopped: ${b.crankRate}`);
  const wb = b.wheel; run(0.2, 3, 0, 0, b); assert(b.wheel !== wb);
  const d = run(3, 8, 0, -0.15); assert(d.freewheel && d.crankRate === 0, 'downhill coast'); assert(d.wheel !== 0);
  const again = run(2, 6, 0, 0, d); assert(!again.freewheel && again.crankRate > 3);
});

test('lean follows v * yaw rate, bounded, sign follows the turn and eases smoothly', () => {
  const left = run(2, 6, 0.9), right = run(2, 6, -0.9), straight = run(2, 6, 0);
  assert(left.roll < -0.15 && right.roll > 0.15 && Math.abs(straight.roll) < 1e-6);
  assert(Math.abs(left.roll + right.roll) < 1e-6);
  const fast = run(2, 11, 3); assert(Math.abs(fast.roll) <= R.leanMax + 1e-9);
  const s = newBikeRide(); let prev = 0, jump = 0; for (let i = 0; i < 120; i++) { stepBikeRide(s, 1 / 60, 6, i < 30 ? 0 : 1.2, 0); jump = Math.max(jump, Math.abs(s.roll - prev)); prev = s.roll; }
  assert(jump < 0.05, `one-frame roll step ${jump}`);
  assert(Math.abs(run(1, 0, 1).roll) < 1e-9, 'no lean when standing still');
});

test('pitch follows the slope (bounded); standing only on a steep climb under power', () => {
  assert(Math.abs(run(2, 4, 0, 0.3).pitch - 0.3) < 0.02); assert(Math.abs(run(2, 4, 0, -0.3).pitch + 0.3) < 0.02);
  assert(Math.abs(run(2, 4, 0, 9).pitch) <= R.pitchMax + 1e-9);
  assert(run(3, 4, 0, 0.05).stand < 0.01); const climb = run(3, 4, 0, 0.25); assert(climb.stand > 0.95, `${climb.stand}`);
  assert(run(3, 8, 0, -0.25).stand < 0.01);
  const seat = bikeSeat(1), sit = bikeSeat(0); assert(seat.hip[0] > sit.hip[0] && seat.lean < sit.lean);
});

test('steering turns the handlebar in the hands, bounded, mirrored; a straight bar is symmetric', () => {
  const left = run(2, 4, 0.8), right = run(2, 4, -0.8);
  assert(left.steer > 0.1 && right.steer < -0.1 && left.steer <= R.steerMax && Math.abs(left.steer + right.steer) < 1e-9);
  const l0 = bikeGrip(1, 0), r0 = bikeGrip(-1, 0); assert(Math.abs(l0[0] + r0[0]) < 1e-12 && l0[2] === r0[2]);
  const l1 = bikeGrip(1, 0.4), r1 = bikeGrip(-1, 0.4); assert(Math.abs(l1[2] - l0[2]) > 0.05 && Math.abs(r1[2] - r0[2]) > 0.05 && l1[2] !== r1[2]);
  assert(Math.hypot(l1[0] - 0, l1[2] - R.steerPivotX) > 0, 'finite');
});

test('bounded and finite for hostile input; dt 0 changes nothing; no jumps from huge dt', () => {
  const s = newBikeRide(); for (const [dt, v, y, sl] of [[NaN, NaN, NaN, NaN], [5, 1e9, 1e9, 1e9], [0, 5, 1, 1], [-1, -50, -50, -50], [0.016, 5, 0, 0]]) stepBikeRide(s, dt, v, y, sl);
  for (const k of ['wheel', 'crank', 'crankRate', 'roll', 'pitch', 'steer', 'stand']) assert(Number.isFinite(s[k]), k);
  assert(Math.abs(s.roll) <= R.leanMax && Math.abs(s.steer) <= R.steerMax && s.stand >= 0 && s.stand <= 1);
  const before = JSON.stringify(s); stepBikeRide(s, 0, 5, 1, 0); assert.equal(JSON.stringify(s), before);
});

test('vertex parts: wheels at their hubs, crank and level pedals, steered front end', () => {
  const pos = new Float32Array([-0.5 + 0.33, 0.34, 0, 0.42, 0.34 + 0.33, 0, -0.05, 0.445, 0.09, -0.1, 0.19, 0.14, 0.9, 0.2, 0.2]);
  const m = bikeVertexParts(pos, 'metal', 5); assert.deepEqual([...m.parts], [1, 2, 3, 4, 0]); assert.deepEqual([...m.steered], [0, 1, 0, 0, 0]);
  const f = bikeVertexParts(new Float32Array([0.33, 0.9, 0.25, -0.12, 0.7, 0]), 'frame', 2); assert.deepEqual([...f.steered], [1, 0]);
  // a rim vertex stays on its circle; a half turn of the crank swaps the two pedals' heights; a pedal keeps its shape
  const rim = bikeVertexAt([-0.17, 0.34, 0], 1, 0, 1.3, 0, 0); assert(Math.abs(Math.hypot(rim[0] + 0.5, rim[1] - 0.34) - 0.33) < 1e-9);
  const p0 = bikeVertexAt([-0.1, 0.19, 0.14], 4, 0, 0, 0, 0), p1 = bikeVertexAt([-0.1, 0.19, 0.14], 4, 0, 0, Math.PI, 0);
  assert(Math.abs(p0[1] - 0.19) < 1e-9 && Math.abs(p1[1] - 0.53) < 1e-9);
  const a = bikeVertexAt([-0.1, 0.19, 0.14], 4, 0, 0, 1, 0), b = bikeVertexAt([0, 0.21, 0.14], 4, 0, 0, 1, 0); assert(Math.abs((b[0] - a[0]) - 0.1) < 1e-9 && Math.abs(b[1] - a[1] - 0.02) < 1e-9);
  const hub = bikeVertexAt([0.42, 0.34, 0], 2, 1, 0.7, 0, 0.3); assert(Math.abs(hub[2]) > 0.01, 'the front hub swings with the steering');
  const rear = bikeVertexAt([-0.5, 0.5, 0.05], 1, 0, 0.4, 0.2, 0.3); assert(rear[2] === 0.05, 'rear wheel is not steered');
});

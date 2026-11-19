// #2159: the body leans into a start and back against a sudden stop (src/avatarlean.js stepAccel, the third term of stepLean):
// spring response, bounds, decay and immunity to the playback's jitter; then the real Avatar.update (needs three resolvable).
// node --test tools/avataraccelleantest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newAccel, stepAccel, newLean, stepLean } from '../src/avatarlean.js';
import { AVATAR_ACCEL_LEAN as AC } from '../src/config.js';

const dt = 1 / 60;
const sm = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
/** A start to `v` m/s at 0.5 s (over 0.2 s, as the #2139 playback curve draws a sender's instant change), a stop at 2.7 s. */
const profile = (v) => (t) => v * (sm((t - 0.5) / 0.2) - sm((t - 2.7) / 0.2));
function run(v, secs = 5, on = () => true, step = () => dt) {
  const s = newAccel(), h = [], f = profile(v);
  for (let t = 0; t < secs;) { const d = step(t); t += d; h.push({ t, x: stepAccel(s, d, f(t), on(t)) }); }
  return h;
}
const peak = (h, a, b, sign) => h.filter((p) => p.t >= a && p.t < b).reduce((m, p) => (sign * p.x > sign * m ? p.x : m), 0);

test('standing and steady motion: no lean', () => {
  for (const v of [0, 1.4, 4.8]) { const s = newAccel(); let x = 0; for (let i = 0; i < 300; i++) x = stepAccel(s, dt, v, true); assert.equal(x, 0, `v ${v}`); }
});

test('a start leans forward, a sudden stop leans back, a sprint more than a walk; all within the bounds', () => {
  const walk = run(1.4), sprint = run(4.8);
  const wf = peak(walk, 0.5, 1.6, 1), sf = peak(sprint, 0.5, 1.6, 1), wb = peak(walk, 2.7, 3.8, -1), sb = peak(sprint, 2.7, 3.8, -1);
  assert.ok(wf > 0.04 && wf < 0.12, `walk start ${wf}`);
  assert.ok(sf > 0.2 && sf <= AC.forward + 1e-12, `sprint start ${sf}`);
  assert.ok(sf > 2 * wf, 'stronger at a sprint start');
  assert.ok(wb < -0.04 && sb < -0.18 && sb >= -AC.back - 1e-12, `stops ${wb} ${sb}`);
  for (const h of [walk, sprint]) for (const p of h) assert.ok(p.x <= AC.forward + 1e-12 && p.x >= -AC.back - 1e-12, `bound ${p.x}`);
});

test('the spring: the upper body swings lightly past upright after a stop, then settles', () => {
  const h = run(3.2, 6), over = peak(h, 3.0, 4.0, 1);
  assert.ok(over > 0.01 && over < 0.1, `over-swing ${over}`); // light: well under the back lean
  assert.ok(h.filter((p) => p.t > 5).every((p) => Math.abs(p.x) < 0.005), 'settled two seconds on');
  // the lean lags the speed change (a body, not a switch): its forward peak comes after the ramp has ended
  const top = h.find((p) => p.x === peak(h, 0.5, 1.6, 1));
  assert.ok(top.t > 0.7, `peak at ${top.t}`);
});

test('noise immunity: frame-time jitter, speed noise, a 5 Hz ripple and a one-frame glitch give no visible lean', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const worst = (fn, n = 3000) => { const s = newAccel(); let m = 0; for (let i = 0; i < n; i++) { const [d, v] = fn(i); const x = stepAccel(s, d, v, true); if (i > 60) m = Math.max(m, Math.abs(x)); } return m; };
  assert.ok(worst(() => [0.01 + 0.03 * rnd(), 4.5 + 0.3 * (2 * rnd() - 1)]) < 0.01, 'speed noise ±0.3 m/s, 10–40 ms frames');
  assert.ok(worst((i) => [dt, 4.5 * (1 + 0.1 * Math.sin(2 * Math.PI * 5 * i * dt))]) < 0.01, '±10 % ripple at the 5 Hz send rate');
  assert.ok(worst((i) => [dt, i === 400 ? 0 : 4.5]) < 0.005, 'a single dropped frame (a teleport frame reads 0)');
  assert.ok(worst((i) => [dt, i === 400 ? NaN : 1.4]) < 0.005, 'a non-finite input');
});

test('off (air, water, seat, bike…) and long gaps: springs back to zero, no spike when it comes back', () => {
  const off = (t) => !(t > 2.5 && t < 4.5); // the stop at 2.7 s happens while off (e.g. landing from a jump that ends the run)
  const h = run(4.8, 6, off);
  assert.ok(h.filter((p) => p.t > 3.5 && p.t < 4.5).every((p) => Math.abs(p.x) < 0.02), 'decays while off');
  assert.ok(h.filter((p) => p.t > 4.5).every((p) => Math.abs(p.x) < 0.02), 'no spike on return');
  // a long frame gap restarts the tracking at the current speed
  const s = newAccel(); for (let i = 0; i < 60; i++) stepAccel(s, dt, 0, true);
  stepAccel(s, 0.5, 4.8, true); let m = 0; for (let i = 0; i < 120; i++) m = Math.max(m, Math.abs(stepAccel(s, dt, 4.8, true)));
  assert.ok(m < 1e-9, `gap ${m}`);
  // any frame time stays stable and bounded
  const big = run(4.8, 6, () => true, () => 0.2);
  for (const p of big) assert.ok(Number.isFinite(p.x) && p.x <= AC.forward + 1e-12 && p.x >= -AC.back - 1e-12, `dt 0.2: ${p.x}`);
});

test('stepLean: the third term rides along (fwd defaults to speed), brace only while braking, the turn terms untouched', () => {
  const s = newLean(), f = profile(4.8); let yaw = 0, maxBrace = 0, startBrace = 0;
  for (let t = 0; t < 4; t += dt) {
    const o = stepLean(s, dt, { yaw, speed: f(t), bounce: 0, sway: 0 });
    for (const k of ['headYaw', 'torsoYaw', 'torsoRoll', 'hipX', 'hipRoll', 'headRoll']) assert.ok(Math.abs(o[k]) < 1e-12, k);
    if (t > 2.7 && t < 3.6) maxBrace = Math.max(maxBrace, o.brace);
    if (t > 0.5 && t < 1.1) startBrace = Math.max(startBrace, o.brace);
  }
  assert.ok(maxBrace > 0.7 && maxBrace <= 1, `brace ${maxBrace}`);
  assert.equal(startBrace, 0);
  // an explicit signed forward speed: speeding up backwards leans back
  const b = newLean(); let x = 0; for (let t = 0; t < 1.2; t += dt) x = Math.min(x, stepLean(b, dt, { yaw: 0, speed: 3, fwd: -profile(3)(t + 0.4) }).accel);
  assert.ok(x < -0.1, `backwards ${x}`);
});

// The real rig: Avatar.update through a sprint start and stop tips the torso forward / back against a figure without the lean, and the free
// hands go forward while braking.
test('Avatar: torso pitch into the start and back at the stop, hands forward while braking', async (t) => {
  let THREE, Avatar;
  try { THREE = await import('three'); ({ Avatar } = await import('../src/avatar.js')); } catch { t.skip('three not resolvable'); return; }
  const go = (noLean) => {
    const av = new Avatar('accel-2159'); av.noIdle = true; av.noLean = noLean;
    const frame = [0, 0, 0], f = profile(4.8), hist = [];
    for (let n = 0; n < 300; n++) {
      const tt = n * dt, v = f(tt);
      frame[1] -= v * dt; av.object.position.set(0, 0, frame[1]); // (the figure faces −z in its object's frame at yaw 0)
      av.update(dt, { speed: v, groundSpeed: v, motionFrame: frame, fwd: v });
      av.object.updateMatrixWorld(true);
      const hips = av.bones.hips.getWorldPosition(new THREE.Vector3()), up = av.bones.torso.getWorldPosition(new THREE.Vector3());
      const head = av.bones.head.getWorldPosition(new THREE.Vector3()), hand = av.bones.handL.getWorldPosition(new THREE.Vector3());
      hist.push({ t: tt, tilt: Math.atan2(up.z - head.z, head.y - up.y), hand: hips.z - hand.z }); // + forward
    }
    return hist;
  };
  const on = go(false), off = go(true), at = (h, a) => h[Math.round(a / dt)];
  const fwd = Math.max(...on.slice(40, 90).map((p, i) => p.tilt - off[40 + i].tilt)), back = Math.min(...on.slice(165, 215).map((p, i) => p.tilt - off[165 + i].tilt));
  assert.ok(fwd > 0.15, `forward at the start ${fwd}`);
  assert.ok(back < -0.15, `back at the stop ${back}`);
  const i = on.slice(165, 215).reduce((b, p, k) => (p.tilt - off[165 + k].tilt < on[b].tilt - off[b].tilt ? 165 + k : b), 165);
  assert.ok(on[i].hand - off[i].hand > 0.05, `hands forward while braking ${on[i].hand - off[i].hand}`);
  assert.ok(Math.abs(at(on, 4.9).tilt - at(off, 4.9).tilt) < 0.01, 'settled');
});

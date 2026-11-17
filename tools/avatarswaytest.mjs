// #2014: the secondary-motion springs, headless. node --test tools/avatarswaytest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newSway, stepSway, stepSpring } from '../src/avatarsway.js';
import { AVATAR_SWAY as S } from '../src/config.js';

/** A bone's world matrix elements: position (x, y, z) and yaw (heading about +y, 0 = facing +z). */
const mat = (x, y, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]; };
/** Walk 1.4 m/s for 2 s, stop within 0.15 s, stand 1 s, turn 120° in 0.4 s, stand 1 s; 60 fps. Returns the per-frame groups' offsets. */
function sequence(dt = 1 / 60, hook = () => {}) {
  const sw = newSway(), trace = []; let z = 0, yaw = 0, v = 1.4;
  for (let t = 0; t < 4.6; t += dt) {
    if (t < 2) v = 1.4; else if (t < 2.15) v = 1.4 * (1 - (t - 2) / 0.15); else v = 0;
    if (t >= 3.15 && t < 3.55) yaw += (Math.PI * 2 / 3) / 0.4 * dt;
    z += v * dt;
    const bob = t < 2.15 ? 0.01 * Math.sin(t * 11) : 0, head = mat(0, 1.6 + bob, z, yaw), torso = mat(0, 1.0, z, yaw);
    hook(sw, dt, head, torso);
    stepSway(sw, dt, head, torso);
    trace.push({ t, hair: [...sw.hair.p], bun: [...sw.bun.p], hem: [...sw.hem.p] });
  }
  return trace;
}
const within = (p, G, eps = 1e-9) => p.every((v, i) => v >= G.min[i] - eps && v <= G.max[i] + eps);

test('#2014 springs stay finite and inside their walls for any frame time', () => {
  for (const dt of [1 / 240, 1 / 60, 1 / 30, 0.05, 0.2]) for (const g of ['hair', 'bun', 'hem']) {
    const s = { p: [0, 0, 0], v: [0, 0, 0] };
    for (let i = 0; i < 2000; i++) { stepSpring(s, S[g], dt, [Math.sin(i) * 60, Math.cos(i * 1.7) * 60, Math.sin(i * 2.3) * 60], Math.sin(i * 0.7) * 200); assert(s.p.every(Number.isFinite) && within(s.p, S[g]), `${g} ${dt}`); }
  }
});

test('#2014 a constant push settles at -gain*a/omega^2 and a released spring comes to rest', () => {
  const G = { ...S.hair, min: [-9, -9, -9], max: [9, 9, 9] }, s = { p: [0, 0, 0], v: [0, 0, 0] };
  for (let i = 0; i < 600; i++) stepSpring(s, G, 1 / 60, [0, 0, 3], 0);
  assert(Math.abs(s.p[2] - (-G.gain * 3 / (G.omega * G.omega))) < 1e-4, `${s.p}`);
  for (let i = 0; i < 600; i++) stepSpring(s, G, 1 / 60, [0, 0, 0], 0);
  assert(Math.hypot(...s.p) < 1e-6 && Math.hypot(...s.v) < 1e-5);
});

test('#2014 walk, stop, turn: the hair trails, overshoots once or twice, settles, and never leaves its walls', () => {
  const tr = sequence(), at = (t) => tr.find((f) => f.t >= t);
  for (const f of tr) assert(within(f.hair, S.hair) && within(f.bun, S.bun) && within(f.hem, S.hem), `walls at ${f.t}`);
  const stop = tr.filter((f) => f.t >= 2 && f.t < 2.7), zs = stop.map((f) => f.hair[2]);
  assert(Math.max(...zs) > 0.004, `the hair swings forward when the walk stops: ${Math.max(...zs)}`);
  assert(Math.min(...zs) < -0.0005 || zs.some((z, i) => i && Math.sign(z) !== Math.sign(zs[i - 1])), 'it overshoots (changes sign) after the stop');
  const turn = tr.filter((f) => f.t >= 3.1 && f.t < 4), xs = turn.map((f) => Math.abs(f.hair[0]));
  assert(Math.max(...xs) > 0.004, `a turn swings the hair sideways: ${Math.max(...xs)}`);
  const rest = at(4.55); assert(Math.hypot(...rest.hair) < 0.0015 && Math.hypot(...rest.hem) < 0.0015, `settled: ${rest.hair}`);
  assert(Math.hypot(...at(1.0).hair) < 0.04, 'a steady walk keeps the hair close');
});

test('#2014 a teleport or a first frame drives nothing, a still avatar stays at zero', () => {
  const sw = newSway();
  stepSway(sw, 1 / 60, mat(0, 1.6, 0, 0), mat(0, 1, 0, 0));
  stepSway(sw, 1 / 60, mat(50, 1.6, 0, 2), mat(50, 1, 0, 2));
  stepSway(sw, 1 / 60, mat(50, 1.6, 0, 2), mat(50, 1, 0, 2));
  assert(Math.hypot(...sw.hair.p, ...sw.hem.p) < 1e-9, `${sw.hair.p}`);
});

test('#2014 cost: one avatar\'s sway step', () => {
  const sw = newSway(), a = mat(0, 1.6, 0, 0), b = mat(0, 1, 0, 0), n = 20000, t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) { a[12] = Math.sin(i * 0.05); stepSway(sw, 1 / 60, a, b); }
  const us = Number(process.hrtime.bigint() - t0) / 1000 / n;
  console.log(`sway step: ${us.toFixed(2)} us per avatar per frame (node)`);
  assert(us < 100);
});

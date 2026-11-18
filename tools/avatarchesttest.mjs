// #2108: visible breathing on #2037's rhythm (src/avatarchest.js + avatarbreath.js's `pant` / `drive`): rate and depth over time after
// exertion (deterministic, decaying, zero when gated off), the wave's shape, the vertex snippet and the real rig.
// node --test tools/avatarchesttest.mjs   (the snippet / rig parts need three resolvable, e.g. a temporary node_modules/three)
import test from 'node:test';
import assert from 'node:assert/strict';
import { newBreath, stepBreath, breathRate } from '../src/avatarbreath.js';
import { breathWave, chestBreath, chestGLSL, chestUniforms, chestKey } from '../src/avatarchest.js';
import { AVATAR_CHEST as C, AVATAR_BREATH as B } from '../src/config.js';

const dt = 1 / 30;
/** Steps `s` for `secs` s at `effort`; returns the per-step samples { t, phase, drive, rate, chest, shoulder } (t from `t0`). */
function run(s, secs, effort, t0 = 0, out = []) {
  for (let i = 0; i * dt < secs - 1e-9; i++) {
    stepBreath(s, dt, effort);
    const c = chestBreath(s);
    out.push({ t: t0 + (i + 1) * dt, phase: s.phase, drive: s.drive, rate: breathRate(Math.max(effort, s.pant), s.heat), chest: c.chest, shoulder: c.shoulder, wave: c.wave });
  }
  return out;
}
/** Peak chest offset and breaths (wave peaks) in [a, b) s of the samples. */
const window_ = (h, a, b) => {
  const w = h.filter((x) => x.t >= a && x.t < b);
  let n = 0; for (let i = 1; i < w.length; i++) if (w[i].phase < w[i - 1].phase) n++;
  return { peak: Math.max(...w.map((x) => x.chest)), shoulder: Math.max(...w.map((x) => x.shoulder)), breaths: n, drive: w.at(-1).drive };
};

test('#2108 the wave: 0 exhaled, 1 at the end of the inhale (= #2037 puff), resting pause, continuous across the wrap', () => {
  assert.equal(breathWave(0), 0);
  assert.ok(Math.abs(breathWave(B.exhale) - 1) < 1e-12);
  assert.ok(breathWave(B.exhale / 2) > 0.45 && breathWave(B.exhale / 2) < 0.55);
  assert.equal(breathWave(1 - C.pause * (1 - B.exhale) / 2), 0, 'the pause rests');
  assert.ok(Math.abs(breathWave(0.9999) - breathWave(0)) < 1e-6 && Math.abs(breathWave(1.25) - breathWave(0.25)) < 1e-12);
  for (let p = 0; p < 1; p += 0.01) { const w = breathWave(p); assert.ok(w >= 0 && w <= 1, `${p} ${w}`); }
});

test('#2108 at rest: slow, shallow (a few mm) breaths; deterministic for the same start', () => {
  const a = run(newBreath(0.3), 60, 0), b = run(newBreath(0.3), 60, 0);
  assert.deepEqual(a, b, 'deterministic');
  const r = window_(a, 0, 60);
  assert.ok(r.breaths >= 14 && r.breaths <= 16, `${r.breaths}/min`);
  assert.ok(Math.abs(r.peak - C.chest[0]) < 2e-4 && r.peak < 0.004, `chest ${r.peak}`);
  assert.equal(r.drive, 0);
});

test('#2108 after a 10 s run: deeper and faster at once, calming over a few seconds back to rest', () => {
  const s = newBreath(0), h = run(s, 10, 1);
  const runEnd = h.at(-1).drive;
  run(s, 30, 0, 10, h);
  const just = window_(h, 10, 14), mid = window_(h, 18, 22), late = window_(h, 34, 40), rest = C.chest[0];
  assert.ok(runEnd > 0.95, `drive while running ${runEnd}`);
  assert.ok(just.peak > rest * 2.5 && just.shoulder > C.shoulder[0] * 3, `just after: chest ${just.peak} shoulder ${just.shoulder}`);
  assert.ok(just.breaths >= 2, `just after: ${just.breaths} breaths in 4 s`);
  assert.ok(mid.peak < just.peak && late.peak < mid.peak, `decays ${just.peak} > ${mid.peak} > ${late.peak}`);
  assert.ok(late.peak < rest * 1.5, `nearly rested after 25–30 s: ${late.peak}`);
  // monotone calming of the drive once stopped (no new effort)
  const after = h.filter((x) => x.t > 10);
  for (let i = 1; i < after.length; i++) assert.ok(after[i].drive <= after[i - 1].drive + 1e-12);
  // a short dash (the old #2037 heat alone barely changed the rate): now clearly faster for a while
  const d = newBreath(0); run(d, 4, 1);
  assert.ok(breathRate(d.pant, d.heat) > breathRate(0, d.heat) * 1.8, `${breathRate(d.pant, d.heat)} vs ${breathRate(0, d.heat)}`);
});

test('#2108 a long sprint keeps a slightly deeper breath for a minute (#2037 heat), then rests', () => {
  const s = newBreath(0); run(s, 40, 1);
  const h = run(s, 30, 0, 40); assert.ok(window_(h, 64, 70).peak > C.chest[0] * 1.2);
  run(s, 120, 0); assert.ok(s.drive < 1e-3, `${s.drive}`);
});

test('#2108 gated off (diving) or never stepped (preview, fixed-pose measurements): zero', () => {
  const s = newBreath(0.2); run(s, 5, 1);
  for (const off of [chestBreath(s, 0), chestBreath(null)]) for (const k of ['wave', 'chest', 'belly', 'shoulder', 'lean', 'hip']) assert.equal(off[k], 0, k);
  const m = chestBreath(s); // bounded
  assert.ok(m.chest <= C.chest[1] && m.shoulder <= C.shoulder[1] && m.lean <= C.lean[1] && Math.abs(m.hip) <= C.hip[1]);
});

test('#2108 snippet: one vec3 uniform, a key suffix, and it compiles into the avatar material chain', async (t) => {
  const glsl = chestGLSL();
  assert.match(glsl, /uBreathe/); assert.ok(!/texture|sampler/.test(glsl));
  assert.deepEqual(chestUniforms().uBreathe.value, [0, 0, 0]); assert.equal(chestKey(), '-chest2108');
  let THREE, Avatar;
  try { THREE = await import('three'); ({ Avatar } = await import('../src/avatar.js')); } catch { t.skip('three not resolvable'); return; }
  const av = new Avatar('chest-2108'), m = av.material;
  assert.ok(m.customProgramCacheKey().includes('-hand2106-seam2107-chest2108'), 'the key chain keeps #2106 / #2107 and adds ours');
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  m.onBeforeCompile(sh, null);
  assert.ok(sh.vertexShader.includes('uniform vec3 uBreathe;') && sh.vertexShader.includes('#2108: breathing'));
  assert.ok(sh.uniforms.uBreathe, 'uniform handed to the program');
});

test('#2108 the real rig: Avatar.update moves the uniform with the breath and straightens the torso, the head keeps its pitch', async (t) => {
  let THREE, Avatar;
  try { THREE = await import('three'); ({ Avatar } = await import('../src/avatar.js')); } catch { t.skip('three not resolvable'); return; }
  const av = new Avatar('chest-2108'); av.noIdle = true; av.noLean = true;
  av.breath = newBreath(0); av.breath.drive = av.breath.pant = 1; // just stopped running
  const fwd = (b) => new THREE.Vector3(0, 0, 1).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()));
  const sample = (phase) => { av.breath.phase = phase; av.update(1 / 60, {}); av.object.updateMatrixWorld(true); return { u: [...av.material.userData.u.uBreathe.value], torso: fwd(av.bones.torso).y, head: fwd(av.bones.head).y }; };
  const lo = sample(0), hi = sample(B.exhale);
  assert.ok(lo.u.every((v) => Math.abs(v) < 1e-9), `exhaled ${lo.u}`);
  assert.ok(Math.abs(hi.u[0] - C.chest[1]) < 1e-9 && Math.abs(hi.u[2] - C.shoulder[1]) < 1e-9, `inhaled ${hi.u}`);
  assert.ok(hi.torso > lo.torso + 0.01, `torso straightens back ${lo.torso} → ${hi.torso}`);
  assert.ok(Math.abs(hi.head - lo.head) < 0.004, `gaze kept ${lo.head} → ${hi.head}`);
  av.diveAmt = 1; const dive = sample(B.exhale); // under water with the mask (diveAmt follows `dive` while swimming; here forced)
  assert.ok(dive.u[0] < hi.u[0], 'diving gates it down');
});

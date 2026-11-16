// #2003: numeric foot trajectory of the avatar's gait (Avatar.update): footfall cadence, stance slip and penetration at three speeds,
// forward / backward / sideways. Ordinary functional check: node --test tools/avatargaittest.mjs ; `node tools/avatargaittest.mjs --print` prints the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Avatar } from '../src/avatar.js';
import * as CFG from '../src/config.js';
const GAIT = CFG.AVATAR_GAIT;

const DT = 1 / 60, V = new THREE.Vector3();

const SOLE = [[0, -0.05, -0.084], [0, -0.05, 0.194]]; // the shoe's heel and toe on its sole, in the foot bone's frame (src/avatar.js)
const hip = new THREE.Vector3();

/** Walks an avatar for `secs` at ground speed `speed` m/s along unit direction `dir` ([x, z], figure frame), `lead` s of run-up first.
 * Returns the cadence (footfalls/s, both feet), the slip of the sole points on the ground (m/s against the ground; heel and toe each
 * while they stay down), the lowest sole point (penetration), the share of frames where the avatar's own contact flags
 * (`gaitInfo.contact`) disagree with a sole point being on the ground, and the footfall counter's rate. */
export function measure(speed, dir = [0, 1], secs = 8, lead = 2) {
  const av = new Avatar('gait-2003'), state = { speed, gaitDir: dir };
  let sepMin = Infinity, sepMax = -Infinity, t = 0, minY = Infinity, falls = 0, claimed = 0, mism = 0, maxY = 0, hipMin = Infinity, hipMax = -Infinity, steps0 = null;
  const prev = new Map(), slips = [], down = [false, false];
  for (let i = 0; i < Math.round((secs + lead) / DT); i++) {
    av.update(DT, state); t += DT;
    av.object.updateMatrixWorld(true);
    if (t > lead && steps0 === null) steps0 = av.footfalls;
    if (t > lead) { av.bones.footL.getWorldPosition(V); const lx = V.x; av.bones.footR.getWorldPosition(V); sepMin = Math.min(sepMin, -(lx - V.x)); sepMax = Math.max(sepMax, -(lx - V.x)); } // (the figure faces world -z: its left is world -x)
    av.bones.hips.getWorldPosition(hip);
    if (t > lead) { hipMin = Math.min(hipMin, hip.y); hipMax = Math.max(hipMax, hip.y); }
    for (const [fi, s] of ['L', 'R'].entries()) {
      let low = Infinity;
      SOLE.forEach((pt, k) => {
        V.set(...pt); av.bones['foot' + s].localToWorld(V);
        const key = fi * 2 + k, w = [V.x - dir[0] * speed * t, V.z - dir[1] * speed * t], on = V.y < 0.012; // (the ground's frame; the figure faces world -z)
        low = Math.min(low, V.y);
        if (t > lead) {
          minY = Math.min(minY, V.y); maxY = Math.max(maxY, V.y);
          const p = prev.get(key);
          if (on && p) slips.push(Math.hypot(w[0] - p[0], w[1] - p[1]) / DT);
        }
        prev.set(key, on ? w : null);
      });
      const grounded = low < 0.012;
      if (t > lead) {
        if (grounded && !down[fi]) falls++;
        claimed++; if (av.gaitInfo.contact[fi] !== grounded && low > 0.03 === av.gaitInfo.contact[fi]) mism++; // (a flag with no foot near the ground, or a foot down without one)
      }
      down[fi] = grounded;
    }
  }
  slips.sort((a, b) => a - b);
  const out = { speed, cadence: falls / secs, counter: (av.footfalls - steps0) / secs, slip: slips.length ? slips.reduce((a, b) => a + b, 0) / slips.length : 0,
    slipP95: slips[Math.floor(slips.length * 0.95)] ?? 0, soleMin: minY, ankleMax: maxY, hipRange: hipMax - hipMin, sepMin, sepMax, mism: mism / claimed };
  av.dispose();
  return out;
}

if (process.argv.includes('--print')) {
  for (const [n, d] of [['forward', [0, 1]], ['backward', [0, -1]], ['sideways', [1, 0]]]) for (const v of [1.6, 3.2, 4.8]) console.log(n.padEnd(9), JSON.stringify(measure(v, d)));
}

const rows = (dir) => [1.6, 3.2, 4.8].map((v) => measure(v, dir));

test('forward gait: plausible cadence, bounded stance slip, no penetration, contact flags agree with the soles', () => {
  for (const [v, lo, hi] of [[1.6, 1.8, 2.6], [3.2, 2.5, 3.3], [4.8, 3.0, 3.8]]) {
    const m = measure(v);
    assert.ok(m.cadence >= lo && m.cadence <= hi, `${v} m/s: ${m.cadence} footfalls/s in ${lo}…${hi}`);
    assert.ok(Math.abs(m.counter - m.cadence) < 0.3, `${v} m/s: the footfall counter (${m.counter}/s) follows the foot contacts (${m.cadence}/s)`);
    assert.ok(m.slip < 0.1 && m.slipP95 < 0.4, `${v} m/s: stance slip mean ${m.slip}, p95 ${m.slipP95} m/s`);
    assert.ok(m.soleMin > -0.01, `${v} m/s: lowest sole point ${m.soleMin}`);
    assert.ok(m.mism < 0.08, `${v} m/s: contact flags disagree ${m.mism}`);
    assert.ok(m.hipRange < 0.2, `${v} m/s: hips move ${m.hipRange} m`);
  }
});

test('walking and running differ and the stride grows with speed', () => {
  const [a, b, c] = rows([0, 1]);
  assert.ok(a.cadence < b.cadence && b.cadence < c.cadence);
  assert.ok(a.hipRange < c.hipRange && a.ankleMax < b.ankleMax, 'a run lifts the feet and moves the hips more');
});

test('backward and sideways steps plant their feet too', () => {
  for (const dir of [[0, -1], [1, 0], [-1, 0], [0.6, 0.8]]) for (const m of rows(dir)) {
    const lim = 0.15 + 0.7 * Math.abs(dir[0]) * m.speed; // (a wide strafe slides its feet part of the way: AVATAR_GAIT.sideMax)
    assert.ok(m.slip < lim && m.slipP95 < lim + 0.45, `${dir} ${m.speed} m/s: slip ${m.slip} / ${m.slipP95}`);
    assert.ok(m.soleMin > -0.01 && m.cadence < 6.5, `${dir} ${m.speed} m/s: sole ${m.soleMin}, cadence ${m.cadence}`);
  }
});

test('side-steps keep the feet at least sideWidth apart and are no busier than the forward gait', () => {
  const fwd = rows([0, 1]), side = rows([1, 0]), left = rows([-1, 0]);
  side.forEach((m, i) => {
    assert.ok(m.sepMin >= GAIT.sideWidth - 0.005 && m.sepMax <= GAIT.sideMax + 0.05, `${m.speed} m/s: ankles ${m.sepMin} m apart sideways (min ${GAIT.sideWidth})`);
    assert.ok(left[i].sepMin >= GAIT.sideWidth - 0.005, `${m.speed} m/s left: ${left[i].sepMin}`);
    assert.ok(m.cadence <= fwd[i].cadence * 1.35 + 0.1, `${m.speed} m/s: sideways ${m.cadence} vs forward ${fwd[i].cadence} footfalls/s`);
  });
  for (const m of rows([0.6, 0.8])) assert.ok(m.sepMin > 0.1, `diagonal ${m.speed} m/s: ${m.sepMin}`);
});

test('gaitInfo gives the contact phase: alternating feet, stance progress 0 … 1, a footfall at each touch-down', () => {
  const av = new Avatar('gait-info'); const seen = [];
  for (let i = 0; i < 240; i++) { av.update(DT, { speed: 1.6 }); if (i > 90 && av.gaitInfo.footfall) seen.push(av.gaitInfo.lastFoot); }
  assert.ok(seen.length >= 6);
  assert.ok(seen.every((f, i) => i === 0 || f !== seen[i - 1]), `the feet alternate: ${seen}`);
  const g = av.gaitInfo; assert.ok(g.active && g.duty > 0.5 && g.stepHz > 2 && g.strideLen > 1 && g.strideLen < 2, JSON.stringify(g));
  assert.ok(g.contact.some(Boolean) && g.stance.every((u) => u === -1 || (u >= 0 && u <= 1)));
  av.dispose();
});

test('standing, crouching and the other poses keep their old pose (no gait)', () => {
  const a = new Avatar('gait-still'), b = new Avatar('gait-still');
  for (const st of [{}, { crouch: 1 }, { air: 1, airV: [0, 0, 1] }, { swim: true, speed: 0.3 }]) {
    a.update(0.1, st); b.update(0.1, { ...st, gaitDir: [1, 0] }); // (the direction alone changes nothing without a walk)
    for (const n of Object.keys(a.bones)) assert.deepEqual(a.bones[n].quaternion.toArray(), b.bones[n].quaternion.toArray(), n);
  }
  a.update(0.5, {}); a.object.updateMatrixWorld(true);
  const foot = a.bones.footL.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(foot.y - 0.0475) < 0.01 && !a.gaitInfo.contact[0], `standing ankle at ${foot.y}`);
  a.dispose(); b.dispose();
});

test('walking while crouched keeps the feet planted and the crouch hips', () => {
  const av = new Avatar('gait-crouch'); let min = 9, max = -9;
  for (let i = 0; i < 300; i++) { av.update(DT, { speed: 1, crouch: 1 }); av.object.updateMatrixWorld(true); if (i > 120) { const y = av.bones.hips.getWorldPosition(V).y; min = Math.min(min, y); max = Math.max(max, y); } }
  assert.ok(max < 0.6 && max - min < 0.03, `crouched hips ${min}…${max}`);
  av.dispose();
});

test('explicit hand targets still win over the arm swing', () => {
  const av = new Avatar('gait-hand'); const at = [-0.2, 1.08, 0.34];
  for (let i = 0; i < 120; i++) av.update(DT, { speed: 3.2, hands: { R: { at, pole: [-0.6, -0.6, -0.5] } } });
  av.object.updateMatrixWorld(true);
  const w = av.hand('R', new THREE.Vector3()), want = av.object.localToWorld(new THREE.Vector3(...at));
  assert.ok(w.distanceTo(want) < 0.08, `the held hand is ${w.distanceTo(want)} m from its target`);
  av.dispose();
});

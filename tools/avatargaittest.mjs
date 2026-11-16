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
  let t = 0, minY = Infinity, falls = 0, claimed = 0, mism = 0, maxY = 0, hipMin = Infinity, hipMax = -Infinity, steps0 = null;
  const prev = new Map(), slips = [], down = [false, false];
  for (let i = 0; i < Math.round((secs + lead) / DT); i++) {
    av.update(DT, state); t += DT;
    av.object.updateMatrixWorld(true);
    if (t > lead && steps0 === null) steps0 = av.footfalls;
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
    slipP95: slips[Math.floor(slips.length * 0.95)] ?? 0, soleMin: minY, ankleMax: maxY, hipRange: hipMax - hipMin, mism: mism / claimed };
  av.dispose();
  return out;
}

if (process.argv.includes('--print')) {
  for (const [n, d] of [['forward', [0, 1]], ['backward', [0, -1]], ['sideways', [1, 0]]]) for (const v of [1.6, 3.2, 4.8]) console.log(n.padEnd(9), JSON.stringify(measure(v, d)));
}

test('forward gait: plausible cadence, bounded stance slip, no ground penetration', { skip: !GAIT }, () => {
  for (const [v, lo, hi] of [[1.6, 1.5, 2.4], [3.2, 2.2, 3.4], [4.8, 2.6, 4.0]]) {
    const m = measure(v);
    assert.ok(m.cadence >= lo && m.cadence <= hi, `${v} m/s: ${m.cadence} footfalls/s in ${lo}…${hi}`);
    assert.ok(m.slip < 0.12 * v + 0.05, `${v} m/s: stance slip ${m.slip} m/s`);
    assert.ok(m.soleMin > -0.02, `${v} m/s: lowest sole point ${m.soleMin}`);
    assert.equal(m.mism, 0, `${v} m/s: the avatar's own contact flags agree with the feet`);
  }
});

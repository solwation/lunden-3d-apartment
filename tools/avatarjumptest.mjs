// #2140: the jump pose's pure helpers (src/avatarjump.js) and their use in Avatar.update.
// node --test tools/avatarjumptest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_JUMP as J } from '../src/config.js';
import { newJump, stepJump, jumpPhase, airborne, landDepth, aheadSample } from '../src/avatarjump.js';

const G = 9.81, DT = 1 / 60;
/** Simulates a jump of take-off speed `v0` from a ledge `ledge` m over the ground (0: flat); returns the sampled `stepJump` outputs. */
function simulate(v0, { ledge = 0, ahead = false, off = false, unknown = false, tail = 1.2 } = {}) {
  const s = newJump(), log = [];
  let y = ledge, vy = v0, t = 0, left = false;
  for (let i = 0; i < Math.round((0.4 + 3 + tail) / DT); i++, t += DT) {
    if (t >= 0.3) { vy -= G * DT; y = Math.max(0, y + vy * DT); if (y === 0 && vy < 0) vy = 0; }
    const inAir = t >= 0.3 && (y > 0 || vy > 0);
    const aheadIn = ahead && t < 0.3 && t >= 0.3 - 0.12 ? { vy: v0, height: 0.3 } : null;
    const o = stepJump(s, DT, { vy: t < 0.3 ? 0 : vy, height: unknown ? NaN : y, ahead: aheadIn, off });
    log.push({ t, y, vy, ...o });
    if (inAir) left = true;
  }
  return { log, left, s };
}

test('phases from vy and height', () => {
  assert.equal(jumpPhase(0, 0), 'ground');
  assert.equal(jumpPhase(3.7, 0.2), 'rise');
  assert.equal(jumpPhase(-0.5, 0.5), 'fall');
  assert.equal(jumpPhase(-4, 2), 'fall');
  assert.equal(jumpPhase(0.5, 0.0), 'ground'); // a stair step / slope is no jump
  assert.equal(jumpPhase(0, 0, { vy: 3.7, height: 0.3 }), 'crouch'); // the next snapshot leaves the ground
  assert.equal(jumpPhase(0, 0, { vy: 0.5, height: 0.02 }), 'ground');
  assert.ok(airborne(3, NaN) && airborne(-3, NaN) && !airborne(0.5, NaN));
});

test('ordinary jump: crouch, tuck on the way up, stretch on the way down, landing compression', () => {
  const { log } = simulate(3.7, { ahead: true });
  const at = (f) => log.find(f), max = (k, f = () => true) => Math.max(...log.filter(f).map((r) => r[k]));
  assert.ok(max('dip', (r) => r.t < 0.3) > J.crouch.dip * 0.6, 'crouch before take-off');
  assert.equal(at((r) => r.t > 0.3 && r.phase === 'rise').phase, 'rise');
  const up = log.filter((r) => r.phase === 'rise');
  assert.ok(Math.max(...up.map((r) => r.tuck)) > 0.8, 'tucked on the way up');
  const down = log.filter((r) => r.phase === 'fall' && r.vy < -2.5);
  assert.ok(down.length && Math.max(...down.map((r) => r.extend)) > 0.7 && Math.min(...down.map((r) => r.tuck)) < 0.3, 'stretched on the way down');
  assert.ok(Math.max(...log.map((r) => r.arms)) > 0.7, 'arms out');
  assert.ok(Math.max(...log.map((r) => r.flail)) === 0, 'no flailing after a small jump');
  const land = log.filter((r) => r.phase === 'land');
  assert.ok(land.length > 10 && Math.max(...land.map((r) => r.dip)) > J.land.min * 0.7, 'hips compress on landing');
  assert.ok(log.at(-1).dip < 0.01 && log.at(-1).air < 0.01 && log.at(-1).phase === 'ground', 'back to standing');
});

test('landing depth grows with the fall height; a long fall flails', () => {
  assert.ok(landDepth(0.7) < landDepth(2) && landDepth(2) < landDepth(5));
  assert.equal(landDepth(10), J.land.max);
  const small = simulate(3.7), drop = simulate(0, { ledge: 4.5 });
  const peak = (L) => Math.max(...L.log.filter((r) => r.phase === 'land').map((r) => r.dip));
  assert.ok(peak(drop) > peak(small) * 1.5, `${peak(drop)} vs ${peak(small)}`);
  assert.ok(Math.max(...drop.log.map((r) => r.flail)) > 0.4, 'flailing arms on a long fall');
});

test('no pose when off (jetpack / swim / climb / sit)', () => {
  const { log } = simulate(3.7, { off: true });
  assert.ok(log.every((r) => r.air < 1e-6 && r.tuck === 0 && r.arms === 0 && r.dip === 0 && r.flail === 0));
  const fall = simulate(0, { ledge: 4.5, off: true });
  assert.ok(fall.log.every((r) => r.dip === 0 && r.phase === 'ground'), 'no landing squat either');
});

test('works from vy alone when the ground height is unknown', () => {
  const { log } = simulate(3.7, { unknown: true });
  assert.ok(Math.max(...log.map((r) => r.tuck)) > 0.5);
});

test('aheadSample finds the figure a moment on in the snapshots', () => {
  const snaps = [0, 200, 400].map((t, i) => ({ t, p: { x: i, y: i * 0.5, z: 0 } }));
  const a = aheadSample(snaps, 100, 0.12);
  assert.ok(Math.abs(a.y - 0.55) < 1e-9 && Math.abs(a.vy - 2.5) < 1e-9);
  assert.equal(aheadSample(snaps, 390, 0.12), null);
});

test('Avatar.update: feet leave the gait and tuck in the air, hips drop on landing', async () => {
  const { Avatar } = await import('../src/avatar.js');
  const THREE = await import('three');
  const av = new Avatar('jump-2140'), foot = new THREE.Vector3(), hip = new THREE.Vector3();
  const y = (j) => { for (let i = 0; i < 40; i++) av.update(DT, { speed: 0, jump: j }); av.object.updateMatrixWorld(true); av.bones.footL.getWorldPosition(foot); av.bones.hips.getWorldPosition(hip); return [foot.y, hip.y]; };
  const [f0, h0] = y({ vy: 0, height: 0, ahead: null, off: false });
  const [f1] = y({ vy: 3, height: 0.4, ahead: null, off: false });
  assert.ok(f1 > f0 + 0.15, `tucked foot ${f1} over ${f0}`);
  av.update(DT, { speed: 0, jump: { vy: 0, height: 0, ahead: null, off: false } }); // touches down from 2.5 m
  av.jumpState.peak = 2.5; av.jumpState.phase = 'fall';
  av.update(DT, { speed: 0, jump: { vy: 0, height: 0, ahead: null, off: false } });
  av.update(DT * 5, { speed: 0, jump: { vy: 0, height: 0, ahead: null, off: false } });
  av.object.updateMatrixWorld(true); av.bones.hips.getWorldPosition(hip);
  assert.ok(hip.y < h0 - 0.08, `hips ${hip.y} under ${h0}`);
  const [, h2] = y({ vy: 0, height: 0, ahead: null, off: false });
  assert.ok(Math.abs(h2 - h0) < 0.02, 'standing again');
});

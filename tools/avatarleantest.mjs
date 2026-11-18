// #2109: head lead / torso lag / inward lean from the yaw rate, and the head steadied against the running bounce (src/avatarlean.js).
// node --test tools/avatarleantest.mjs   (the second part needs three resolvable, e.g. a temporary node_modules/three)
import test from 'node:test';
import assert from 'node:assert/strict';
import { newLean, stepLean, physicalLean } from '../src/avatarlean.js';
import { AVATAR_LEAN as L } from '../src/config.js';

const dt = 1 / 60;
/** Runs `secs` s of a constant yaw `rate` at `speed`, from state `s` (yaw carried in s.t). Returns the history of outputs. */
function run(s, secs, rate, speed, extra = {}) {
  const hist = [];
  for (let t = 0; t < secs; t += dt) {
    s.y = (s.y ?? 0) + rate * dt;
    const o = stepLean(s, dt, { yaw: s.y, speed, ...extra(t) ?? {} });
    hist.push({ ...o });
  }
  return hist;
}
const ex = (o) => () => o;

test('walking straight: every turn term is zero', () => {
  const s = newLean(), h = run(s, 3, 0, 1.4, ex({}));
  for (const k of ['headYaw', 'torsoYaw', 'torsoRoll', 'hipX', 'hipRoll', 'headRoll', 'headPitch']) assert.ok(Math.abs(h.at(-1)[k]) < 1e-12, k);
});

test('a left turn: the head leads, the torso follows later and less, the body leans inwards (left)', () => {
  const s = newLean(); run(s, 1, 0, 1.4, ex({}));
  const h = run(s, 1.2, 1.2, 1.4, ex({}));
  const o = h.at(-1);
  assert.ok(o.headYaw > 0.15 && o.headYaw <= L.head.max, `head ${o.headYaw}`);
  assert.ok(o.torsoYaw > 0.05 && o.torsoYaw < o.headYaw, `torso ${o.torsoYaw}`);
  // lag: after 0.15 s the head has reached a larger share of its final angle than the torso
  const early = h[Math.round(0.15 / dt)];
  assert.ok(early.headYaw / o.headYaw > early.torsoYaw / o.torsoYaw + 0.15, 'torso lags the head');
  assert.ok(o.torsoRoll < 0 && o.hipX > 0 && o.hipRoll < 0, 'leans towards the figure\'s left');
  assert.ok(o.headRoll > 0 && o.headRoll < -o.torsoRoll, 'the head rights itself partly');
  // a right turn mirrors it
  const r = newLean(); run(r, 1, 0, 1.4, ex({})); const m = run(r, 1.2, -1.2, 1.4, ex({})).at(-1);
  for (const k of ['headYaw', 'torsoYaw', 'torsoRoll', 'hipX', 'hipRoll', 'headRoll']) assert.ok(Math.abs(m[k] + o[k]) < 1e-9, k);
});

test('lean grows with speed: slight walking, more running, never beyond the bounds', () => {
  const lean = (v, rate) => { const s = newLean(); run(s, 0.5, 0, v, ex({})); return run(s, 1.5, rate, v, ex({})).at(-1).lean; };
  const walk = lean(1.4, 1), sprint = lean(4.8, 1.5), wild = lean(8, 3);
  assert.ok(walk > 0.01 && walk < 0.08, `walk ${walk}`);
  assert.ok(sprint > walk * 2, `run ${sprint}`);
  assert.ok(Math.abs(wild) <= L.lean.max + 1e-12, `bounded ${wild}`);
  assert.ok(Math.abs(L.lean.share * physicalLean(1.4, 1) - walk) < 0.005, 'walk is a share of the physical lean');
  const s = newLean(); run(s, 0.5, 0, 8, ex({}));
  for (const o of run(s, 2, 3, 8, ex({ bounce: 0.2, sway: 0.1 }))) {
    assert.ok(Math.abs(o.headYaw) <= L.head.max && Math.abs(o.torsoYaw) <= L.torso.max && Math.abs(o.headPitch) <= L.stab.max, 'bounded');
  }
});

test('decays after the turn, standing still and when not on the ground', () => {
  const s = newLean(); run(s, 0.5, 0, 3, ex({})); run(s, 1, 1.5, 3, ex({}));
  const after = run(s, 1.5, 0, 3, ex({})).at(-1);
  for (const k of ['headYaw', 'torsoYaw', 'lean']) assert.ok(Math.abs(after[k]) < 3e-3, `${k} ${after[k]}`);
  const t = newLean(); run(t, 0.5, 0, 0, ex({})); const still = run(t, 1, 1.5, 0, ex({})).at(-1);
  assert.ok(Math.abs(still.headYaw) < 1e-9 && Math.abs(still.lean) < 1e-9, 'turning on the spot: no lead (#2004 owns it)');
  const u = newLean(); run(u, 0.5, 0, 3, ex({})); run(u, 1, 1.5, 3, ex({}));
  const off = run(u, 1.5, 1.5, 3, ex({ on: false })).at(-1);
  assert.ok(Math.abs(off.headYaw) < 1e-3 && Math.abs(off.lean) < 1e-3, 'air / swim / dance: decays');
});

test('a teleport or a long gap is no turn', () => {
  const s = newLean(); run(s, 0.5, 0, 3, ex({}));
  s.y += 2.5; const o = stepLean(s, dt, { yaw: s.y, speed: 3 });
  assert.equal(o.rate, 0); assert.equal(o.headYaw, 0);
  s.y += 0.5; const g = stepLean(s, 0.5, { yaw: s.y, speed: 3 });
  assert.equal(g.rate, 0);
  assert.ok(Number.isFinite(stepLean(newLean(), 0, { yaw: NaN }).headYaw));
});

test('the head is steadied against the running bounce, and the shoulders against the sway', () => {
  const s = newLean(), hz = 2.9, amp = 0.035;
  const h = run(s, 3, 0, 3.5, (t) => ({ bounce: amp * (1 + Math.cos(2 * Math.PI * hz * t)), sway: 0.008 * Math.sin(Math.PI * hz * t) }));
  const tail = h.slice(-60);
  // the head pitches up (back) while the hips are low (bounce high) and down while they are high: correlated with the bounce
  let cov = 0; tail.forEach((o, i) => { const t = (h.length - 60 + i + 1) * dt; cov += o.headPitch * Math.cos(2 * Math.PI * hz * t); });
  assert.ok(cov > 0, 'pitch follows the bounce');
  const peak = Math.max(...tail.map((o) => Math.abs(o.headPitch)));
  assert.ok(peak > 0.01 && peak < L.stab.max + 1e-12, `peak ${peak}`);
  assert.ok(tail.some((o) => o.torsoRoll > 0.002) && tail.some((o) => o.torsoRoll < -0.002), 'counter-roll against the sway');
  for (const k of ['headYaw', 'torsoYaw', 'hipX']) assert.ok(Math.abs(tail.at(-1)[k]) < 1e-9, `${k}: no turn terms while running straight`);
});

// The real rig: Avatar.update over a curve keeps the feet planted (#2003/#2004), turns the head bone ahead of the torso and leans inwards.
test('Avatar: the head bone leads, the torso follows, feet keep contact', async (t) => {
  let THREE, Avatar;
  try { THREE = await import('three'); ({ Avatar } = await import('../src/avatar.js')); } catch { t.skip('three not resolvable'); return; }
  const yawOf = (o) => { const q = o.getWorldQuaternion(new THREE.Quaternion()); const z = new THREE.Vector3(0, 0, 1).applyQuaternion(q); return Math.atan2(z.x, z.z); };
  const go = (rate, speed, noLean) => {
    const av = new Avatar('lean-2109'); av.noIdle = true; av.noLean = noLean;
    const frame = [0, 0, 0]; let worst = 0, out;
    for (let n = 0; n < 240; n++) {
      const r = n > 90 ? rate : 0;
      frame[2] += r * dt; frame[0] += Math.sin(frame[2]) * speed * dt; frame[1] += Math.cos(frame[2]) * speed * dt;
      av.object.position.set(frame[0], 0, frame[1]); av.object.rotation.y = frame[2];
      av.update(dt, { speed, groundSpeed: speed, motionFrame: frame });
      av.object.updateMatrixWorld(true);
      const body = frame[2];
      const w = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      out = { head: w(yawOf(av.bones.head) - body), torso: w(yawOf(av.bones.torso) - body), lean: av.bones.torso.getWorldPosition(new THREE.Vector3()).sub(av.bones.hips.getWorldPosition(new THREE.Vector3())), contact: av.gaitInfo.contact.slice() };
      for (const k of ['head', 'torso']) worst = Math.max(worst, Math.abs(out[k]));
    }
    return { ...out, worst };
  };
  const on = go(1.2, 3.2, false), off = go(1.2, 3.2, true), straight = go(0, 3.2, false);
  assert.ok(on.head > 0.15 && on.torso > 0.04 && on.head > on.torso + 0.08, `head ${on.head} torso ${on.torso}`);
  assert.ok(Math.abs(off.head) < 1e-6 && Math.abs(off.torso) < 1e-6, 'noLean: unchanged rig');
  assert.ok(Math.abs(straight.head) < 0.06 && Math.abs(straight.torso) < 0.03, 'straight: no lead');
  assert.ok(on.contact.some(Boolean) || on.contact.every((c) => !c), 'gait info intact');
});

// #2035: the living rest of a standing avatar (src/avataridle.js through the real Avatar.update): over 60 s of standing still at least three
// different variations (weight shift, glance, a gesture), the feet planted, two players out of step, crouch / seat / held hands / gaze
// unaffected. node --test tools/avataridletest.mjs ; `node tools/avataridletest.mjs --print` prints a per-second table.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Avatar } from '../src/avatar.js';
import { newIdle, stepIdle, GESTURES } from '../src/avataridle.js';

const DT = 1 / 60, V = new THREE.Vector3();
const SOLE = [[0, -0.05, -0.084], [0, -0.05, 0.194]]; // heel and toe on the sole, in the foot bone's frame (as avatargaittest.mjs)

/** Stands an avatar seeded `seed` still for `secs` s (state `st`, or a function of t), sampling every frame. */
export function stand(seed, secs = 60, st = {}, setup = null) {
  const av = new Avatar('idle-2035'), frame = [1.5, -2, 0.4];
  av.idleSeed = seed; setup?.(av);
  av.object.position.set(frame[0], 0, frame[1]); av.object.rotation.y = frame[2];
  const rows = [];
  let anchor = null, drift = 0, soleMin = Infinity, soleMax = -Infinity;
  for (let i = 0, n = Math.round(secs / DT); i < n; i++) {
    const t = (i + 1) * DT, s = typeof st === 'function' ? st(t) : st;
    av.update(DT, { motionFrame: frame, ...s });
    av.object.updateMatrixWorld(true);
    const feet = ['footL', 'footR'].map((b) => av.bones[b].getWorldPosition(new THREE.Vector3()));
    if (t > 0.5) { // (the first moment settles the planted targets)
      anchor ??= feet.map((f) => f.clone());
      drift = Math.max(drift, feet[0].distanceTo(anchor[0]), feet[1].distanceTo(anchor[1]));
      for (const b of ['footL', 'footR']) for (const p of SOLE) { V.set(...p); av.bones[b].localToWorld(V); soleMin = Math.min(soleMin, V.y); soleMax = Math.max(soleMax, V.y); }
    }
    const o = av.idle.out, q = av.bones.hips.quaternion;
    rows.push({ t, w: o.w, hipX: o.hipX, roll: 2 * Math.asin(Math.max(-1, Math.min(1, q.z))), turn: o.turn, amt: o.amt, kind: o.kind,
      knee: [av.bones.kneeL.quaternion.angleTo(new THREE.Quaternion()), av.bones.kneeR.quaternion.angleTo(new THREE.Quaternion())],
      handR: av.hand('R', new THREE.Vector3()).toArray() });
  }
  const out = { seen: [...av.idle.seen], drift, soleMin, soleMax, rows, av };
  return out;
}

if (process.argv.includes('--print')) {
  const r = stand('player-a');
  console.log('seen', r.seen, 'drift', r.drift, 'sole', r.soleMin, r.soleMax);
  for (const row of r.rows.filter((_, i) => i % 60 === 59)) console.log(row.t.toFixed(0).padStart(3), row.w.toFixed(2).padStart(6), row.roll.toFixed(3).padStart(7), row.turn.toFixed(2).padStart(6), row.amt.toFixed(2), row.kind.padEnd(8), row.knee.map((k) => k.toFixed(2)).join(' '));
  r.av.dispose();
}

test('60 s of standing still: at least three variations, feet planted, soles on the floor', () => {
  for (const seed of ['player-a', 'player-b', 'p7']) {
    const r = stand(seed);
    const gestures = r.seen.filter((k) => GESTURES.includes(k));
    assert.ok(r.seen.includes('weight') && r.seen.includes('look') && gestures.length >= 1 && r.seen.length >= 3, `${seed}: variations ${r.seen}`);
    assert.ok(r.drift < 0.003, `${seed}: the ankles move ${r.drift} m while standing`);
    assert.ok(r.soleMin > -0.01 && r.soleMin < 0.02, `${seed}: lowest sole point ${r.soleMin}`);
    // the weight really goes onto one leg: the hips tilt, the free knee bends more than the loaded one
    const roll = Math.max(...r.rows.map((x) => Math.abs(x.roll)));
    assert.ok(roll > 0.04 && roll < 0.1, `${seed}: hip roll ${roll}`);
    const loaded = r.rows.filter((x) => Math.abs(x.w) > 0.55 && !x.kind);
    assert.ok(loaded.length > 60, `${seed}: frames with the weight on one leg ${loaded.length}`);
    for (const x of loaded) { const free = x.w > 0 ? 1 : 0; assert.ok(x.knee[free] > x.knee[1 - free] + 0.05, `${seed} t=${x.t}: free knee ${x.knee[free]} vs loaded ${x.knee[1 - free]}`); }
    r.av.dispose();
  }
});

test('two players do not move in step; one player repeats its own rhythm', () => {
  const a = stand('player-a', 40), b = stand('player-b', 40), a2 = stand('player-a', 40);
  const diff = a.rows.reduce((m, x, i) => m + Math.abs(x.w - b.rows[i].w), 0) / a.rows.length;
  assert.ok(diff > 0.3, `mean weight difference ${diff}`);
  const start = (r) => r.rows.find((x) => x.amt > 0.01)?.t ?? Infinity;
  assert.ok(Math.abs(start(a) - start(b)) > 0.5 || a.rows.find((x) => x.kind).kind !== b.rows.find((x) => x.kind).kind, 'the first gestures differ');
  assert.deepEqual(a.rows.map((x) => x.w), a2.rows.map((x) => x.w));
  for (const r of [a, b, a2]) r.av.dispose();
});

test('crouching, sitting, held hands and the gaze keep their own poses', () => {
  const crouch = stand('player-a', 30, { crouch: 1 });
  assert.deepEqual(crouch.seen, [], 'nothing while crouched'); assert.ok(crouch.rows.every((x) => !x.roll && !x.amt));
  const seat = stand('player-a', 30, { groundEnabled: false });
  assert.deepEqual(seat.seen, [], 'nothing while seated (ghosts.js: groundEnabled false)');
  const at = [-0.2, 1.08, 0.34], held = stand('player-a', 60, { hands: { R: { at, pole: [-0.6, -0.6, -0.5] } } });
  assert.ok(!held.seen.some((k) => GESTURES.includes(k)), `no arm gesture while holding: ${held.seen}`);
  const hx = held.rows.slice(60).map((x) => x.handR);
  for (const p of hx) assert.ok(Math.hypot(p[0] - hx[0][0], p[1] - hx[0][1], p[2] - hx[0][2]) < 0.06, 'the held hand stays (only the hips sway under it)');
  const gaze = stand('player-a', 60, {}, (av) => av.lookAt(new THREE.Vector3(3, 1.6, -4)));
  assert.ok(!gaze.seen.includes('look') && gaze.rows.every((x) => x.turn === 0), 'no glance away while looking at someone');
  const panning = stand('player-a', 60, (t) => ({ turn: 0.6 * Math.sin(t * 0.8) }));
  assert.ok(!panning.seen.includes('look'), 'no glance while the player turns the view');
  const mirror = stand('player-a', 60, {}, (av) => { av.idleLook = false; });
  assert.ok(!mirror.seen.includes('look') && mirror.seen.length >= 2, `our mirror image: ${mirror.seen}`);
  for (const r of [crouch, seat, held, gaze, panning, mirror]) r.av.dispose();
});

test('a busy hand mid-gesture lets the gesture go smoothly; walking off ends it', () => {
  const s = newIdle('player-c'); let t = 0;
  while (!s.out.kind && t < 60) { stepIdle(s, DT, { on: true }); t += DT; }
  assert.ok(s.out.kind, 'a gesture starts');
  for (let i = 0; i < 90; i++) stepIdle(s, DT, { on: true });
  const a0 = s.out.amt; let prev = a0, maxStep = 0;
  for (let i = 0; i < 60; i++) { stepIdle(s, DT, { on: true, arms: false }); maxStep = Math.max(maxStep, Math.abs(s.out.amt - prev)); prev = s.out.amt; }
  assert.ok(s.out.amt < 0.01 && maxStep < 0.2, `arms let go: ${a0} -> ${s.out.amt}, step ${maxStep}`);
  for (let i = 0; i < 120; i++) stepIdle(s, DT, { on: false });
  assert.ok(Math.abs(s.out.hipX) < 1e-3 && !s.out.kind && s.still === 0, 'walking off resets the rest');
});

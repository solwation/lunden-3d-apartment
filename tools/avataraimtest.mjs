// #2149: weapon aim pose from the gaze pitch (src/avataraim.js). node --test tools/avataraimtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT, AVATAR_AIM as A } from '../src/config.js';
import { aimKind, aimPose, newAim } from '../src/avataraim.js';

test('every weapon has an explicit aim kind, and no stale entries', () => {
  for (const w of COMBAT.weapons) assert.ok(A.byWeapon[w], `${w} has a kind`);
  for (const w of Object.keys(A.byWeapon)) assert.ok(COMBAT.weapons.includes(w), `${w} is a weapon`);
  assert.equal(aimKind(''), 'swing'); assert.equal(aimKind('jetpack'), 'swing');
});

test('rifle and Nerf: two hands, the support hand further out along the barrel', () => {
  for (const w of ['rifle', 'nerf']) {
    const p = aimPose(w, 0);
    assert.ok(p.twoHands && p.R && p.L, w);
    assert.ok(p.R.at[0] < 0 && p.L.at[0] > p.R.at[0], `${w}: right hand on the right`);
    assert.ok(p.L.at[2] > p.R.at[2] + 0.15, `${w}: fore-end ahead of the grip`);
  }
});

test('bow: the bow hand reaches out, the draw hand is drawn back near the body', () => {
  const p = aimPose('bow', 0);
  assert.ok(p.twoHands && p.R.at[2] > p.L.at[2] + 0.2);
});

test('looking up raises both hands and tilts the prop; looking down lowers them; leaning follows', () => {
  for (const w of ['rifle', 'bow', 'wand']) {
    const lvl = structuredClone(aimPose(w, 0)), up = structuredClone(aimPose(w, 0.8)), dn = structuredClone(aimPose(w, -0.8));
    assert.ok(up.R.at[1] > lvl.R.at[1] + 0.1 && dn.R.at[1] < lvl.R.at[1] - 0.1, `${w}: right hand follows the pitch`);
    if (lvl.L) assert.ok(up.L.at[1] > lvl.L.at[1] + 0.05 && dn.L.at[1] < lvl.L.at[1] - 0.05, `${w}: left hand follows`);
    assert.ok(up.tilt > 0.7 && dn.tilt < -0.7 && lvl.tilt === 0);
    assert.ok(up.lean < 0 && dn.lean > 0, `${w}: back when looking up`);
  }
});

test('bounded: absurd pitch is clamped; NaN is level; the hands stay within arm reach', () => {
  const big = structuredClone(aimPose('rifle', 99)), lim = structuredClone(aimPose('rifle', A.pitchLimit));
  assert.deepEqual(big.R.at, lim.R.at); assert.equal(big.tilt, A.pitchLimit);
  assert.equal(aimPose('rifle', NaN).tilt, 0);
  for (const w of ['rifle', 'nerf', 'bow', 'wand', 'web']) for (const p of [-2, -1, 0, 1, 2]) {
    const q = aimPose(w, p);
    for (const h of [q.R, q.L]) if (h) {
      assert.ok(h.at.every(Number.isFinite) && h.pole.every(Number.isFinite));
      assert.ok(h.at[1] > 0.5 && h.at[1] < 2.0 && Math.abs(h.at[0]) < 0.3 && h.at[2] < 0.8, `${w} ${p}`);
    }
    assert.ok(Math.abs(q.lean) < 0.25);
  }
});

test('the saber (and the ball) keep their own swing: no aim, no lean, no tilt', () => {
  for (const w of ['saber', 'ball', '']) {
    const p = aimPose(w, 0.9);
    assert.ok(!p.R && !p.L && p.lean === 0 && p.tilt === 0 && !p.twoHands, w);
  }
});

test('the result object is reused and cleared between calls', () => {
  const o = newAim(); aimPose('rifle', 0.2, o); assert.ok(o.L);
  aimPose('wand', 0.2, o); assert.ok(o.R && !o.L && !o.twoHands);
  aimPose('saber', 0.2, o); assert.ok(!o.R);
});

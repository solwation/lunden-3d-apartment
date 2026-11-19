// #2144: held category -> carry pose (src/avatarcarry.js). node --test tools/avatarcarrytest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { HELD_CATEGORIES, heldCategory } from '../src/heldcategory.js';
import { AVATAR_CARRY as C } from '../src/config.js';
import { carryKind, carryPose, easeLean, newCarry } from '../src/avatarcarry.js';

test('every held category has an explicit carry kind, and no stale entries', () => {
  for (const c of HELD_CATEGORIES) assert.ok(C.byCategory[c], `${c} has a kind`);
  for (const c of Object.keys(C.byCategory)) assert.ok(HELD_CATEGORIES.includes(c), `${c} is a held category`);
  for (const k of Object.values(C.byCategory)) assert.ok(C.kinds[k], k);
  assert.equal(carryKind(''), 'one'); assert.equal(carryKind('nope'), 'one');
});

test('heavy things and boxes: two hands round it and a back-lean', () => {
  for (const c of ['box', 'gift', 'plant']) {
    const p = carryPose(c, 0);
    assert.ok(p.twoHands && p.R && p.L, c);
    assert.ok(p.R.at[0] < 0 && p.L.at[0] > 0 && Math.abs(p.R.at[0] + p.L.at[0]) < 1e-9, `${c}: symmetric, right hand at x < 0`);
    assert.ok(p.lean < -0.1, `${c}: leans back`);
  }
});

test('a bag hangs from a relaxed arm at the side', () => {
  const p = carryPose('bag', 0);
  assert.ok(!p.twoHands && p.R && !p.L && p.R.at[1] < 0.85 && Math.abs(p.R.at[0]) > 0.2 && p.R.at[2] < 0.1);
});

test('a plush toy is hugged: both hands in front of the chest, a little back-lean', () => {
  const p = carryPose('plush', 0);
  assert.ok(p.twoHands && p.R.at[1] > 1.0 && p.R.at[1] < 1.3 && p.lean < 0 && p.lean > -0.12);
});

test('binoculars go up to the eyes with both hands, near the middle', () => {
  const p = carryPose('binoculars', 0);
  assert.ok(p.twoHands && p.R.at[1] > 1.4 && p.L.at[1] > 1.4 && Math.abs(p.R.at[0]) < 0.1 && Math.abs(p.L.at[0]) < 0.15);
  assert.ok(carryPose('binoculars', 0.8).R.at[1] > p.R.at[1], 'follows the look up');
});

test('flashlight, rod, spray can and harpoon follow the gaze pitch (and clamp)', () => {
  for (const c of ['flashlight', 'rod', 'spray', 'harpoon']) {
    const lvl = carryPose(c, 0).R.at.slice(), up = carryPose(c, 0.7).R.at.slice(), down = carryPose(c, -0.7).R.at.slice();
    assert.ok(up[1] > lvl[1] + 0.2 && down[1] < lvl[1] - 0.2, `${c}: height follows pitch`);
    assert.ok(up[2] < lvl[2], `${c}: reach shortens looking up`);
    const hi = carryPose(c, 9).R.at.slice(), cap = carryPose(c, C.pitchLimit).R.at.slice();
    assert.deepEqual(hi, cap); assert.ok(Number.isFinite(carryPose(c, NaN).R.at[1]));
  }
});

test('an ordinary handheld thing leaves the arm to the default and does not lean', () => {
  for (const c of ['cup', 'food', 'pan', '']) { const p = carryPose(c, 0.3); assert.equal(p.R, null); assert.equal(p.lean, 0); }
});

test('carryPose reuses its out object; easeLean converges', () => {
  const o = newCarry(); assert.equal(carryPose('box', 0, o), o);
  const r = o.R; carryPose('bag', 0, o); assert.equal(o.R, r);
  let l = 0; for (let i = 0; i < 100; i++) l = easeLean(l, -0.16, 0.05);
  assert.ok(Math.abs(l + 0.16) < 1e-3);
});

test('Pingping (handPose hug) is the plush category; Miele travels as the carried cat', () => {
  assert.equal(heldCategory({ handPose: 'hug', constructor: { name: 'Pingping' } }), 'plush');
  assert.equal(heldCategory({ isMiele: true, handPose: 'hug' }), '');
});

test('the aimed proxy tilts with the gaze, except the rod (own elevation)', () => {
  assert.ok(Math.abs(carryPose('flashlight', 0.5).tilt - 0.5) < 1e-9);
  assert.equal(carryPose('rod', 0.5).tilt, 0); assert.equal(carryPose('box', 0.5).tilt, 0);
});

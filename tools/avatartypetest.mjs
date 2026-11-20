// #2174: the typing pose of a remote figure (pure helpers). Run: node --test tools/avatartypetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { typeStep, typePose, typeAllowed } from '../src/avatartype.js';
import { TYPING } from '../src/config.js';

test('blend: eases in over TYPING.up and out over TYPING.down, clamped', () => {
  let w = 0; const dt = 0.05;
  for (let t = 0; t < TYPING.up - 1e-9; t += dt) w = typeStep(w, true, dt);
  assert.ok(Math.abs(w - 1) < 0.06, 'full after up seconds: ' + w);
  assert.equal(typeStep(1, true, 1), 1);
  for (let t = 0; t < TYPING.down - 1e-9; t += dt) w = typeStep(w, false, dt);
  assert.ok(w < 0.06, 'gone after down seconds: ' + w);
  assert.equal(typeStep(0.1, false, 5), 0);
  assert.equal(typeStep(0.5, true, NaN), 0.5); assert.equal(typeStep(0.5, true, -1), 0.5);
});
test('pose: none at 0, head down (negative) and lean forward at 1, monotone', () => {
  assert.equal(typePose(0), null);
  const a = typePose(0.5, -1, { w: 0, hand: { at: [0, 0, 0], pole: [0, 0, 0] }, head: 0, lean: 0 }).head;
  const p = typePose(1);
  assert.ok(p.head <= -0.4 && p.head < a && a < 0, JSON.stringify(p));
  assert.ok(p.lean < 0);
});
test('hand: in front of the chest on the right; mirrored for the left', () => {
  const p = typePose(1, -1); const r = { at: [...p.hand.at], pole: [...p.hand.pole] };
  assert.ok(r.at[2] > 0.2 && r.at[1] > 1.0 && r.at[1] < 1.45 && r.at[0] < 0, 'ahead, chest height, right: ' + r.at);
  const l = typePose(1, 1);
  assert.equal(l.hand.at[0], -r.at[0]); assert.equal(l.hand.at[2], r.at[2]); assert.equal(l.hand.pole[0], -r.pole[0]);
});
test('suppressed while cycling, driving, swimming, armed, airborne, posed; seated is fine', () => {
  assert.equal(typeAllowed({}), true); assert.equal(typeAllowed({ seated: true }), true);
  for (const k of ['bike', 'drive', 'swim', 'armed', 'air', 'gym', 'lying', 'knock', 'kiss', 'hug', 'busy']) assert.equal(typeAllowed({ [k]: true }), false, k);
});

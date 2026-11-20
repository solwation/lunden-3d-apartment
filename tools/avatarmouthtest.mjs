// #2160: the drink / bite / toast move: the wrist reaches the mouth, the head tips back, it returns to rest; unknown kinds are ignored;
// the room's sound whitelist carries the new kinds. Run: node --test tools/avatarmouthtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mouthWeight, mouthPose, blendHand } from '../src/avatarmouth.js';
import { MOUTH, SOUNDS } from '../src/config.js';
import { cleanSound, PLAYERS } from '../cloudflare/players.js';

test('weight: 0 before and after, 1 held at the top, monotone up then down', () => {
  for (const k of Object.keys(MOUTH)) {
    const M = MOUTH[k];
    assert.equal(mouthWeight(k, 0), 0); assert.equal(mouthWeight(k, -1), 0); assert.equal(mouthWeight(k, M.dur), 0); assert.equal(mouthWeight(k, M.dur + 5), 0);
    assert.equal(mouthWeight(k, M.dur / 2), 1);
    let prev = 0;
    for (let a = 0.01; a <= M.dur * M.up; a += 0.01) { const w = mouthWeight(k, a); assert.ok(w >= prev - 1e-9); prev = w; }
    prev = 1;
    for (let a = M.dur * (1 - M.down); a < M.dur; a += 0.01) { const w = mouthWeight(k, a); assert.ok(w <= prev + 1e-9); prev = w; }
  }
});
test('pose: at the top the hand is at the mouth and the head tipped back; mirrored for the left; null at rest', () => {
  const P = mouthPose('sip', MOUTH.sip.dur / 2, -1);
  assert.deepEqual(P.hand.at, MOUTH.sip.hand); assert.equal(P.head, MOUTH.sip.head); assert.ok(P.head > 0.3);
  assert.ok(Math.abs(P.hand.at[0]) < 0.1 && P.hand.at[1] > 1.4 && P.hand.at[1] < 1.6, 'wrist by the mouth');
  assert.equal(mouthPose('sip', 1, 1).hand.at[0], -MOUTH.sip.hand[0]);
  assert.equal(mouthPose('sip', 0), null); assert.equal(mouthPose('sip', 9), null);
  const T = mouthPose('toast', MOUTH.toast.dur / 2);
  assert.ok(T.hand.at[1] > 1.3 && T.hand.at[2] > 0.4, 'toast: glass up and forward');
});
test('sip and bite: the wrist at the top is within 3 cm of the mouth point height (about 1.5 m on the 1.8 m figure, *guess*); toast at chin height', () => {
  const MOUTH_Y = 1.5;
  for (const k of ['sip', 'bite']) assert.ok(Math.abs(mouthPose(k, MOUTH[k].dur / 2).hand.at[1] - MOUTH_Y) <= 0.03, k);
  assert.ok(Math.abs(mouthPose('toast', MOUTH.toast.dur / 2).hand.at[1] - MOUTH_Y) <= 0.06);
});
test('unknown or bad input is ignored', () => {
  for (const k of ['bell', 'x', undefined, null, '__proto__', 'constructor']) { assert.equal(mouthWeight(k, 0.5), 0); assert.equal(mouthPose(k, 0.5), null); }
  assert.equal(mouthWeight('sip', NaN), 0);
});
test('blend: w 0 keeps the rest hand, w 1 reaches the target', () => {
  const from = { at: [-0.2, 0.9, 0], pole: [-0.3, -0.3, -1] }, to = { at: [0, 1.5, 0.2], pole: [-1, 0, 0] };
  assert.deepEqual(blendHand(from, to, 0).at, from.at); assert.deepEqual(blendHand(from, to, 1).pole, to.pole);
  assert.ok(Math.abs(blendHand(from, to, 0.5).at[1] - 1.2) < 1e-9);
});
test('room whitelist accepts sip and bite, rejects others, and equals the client list', () => {
  assert.deepEqual(PLAYERS.sounds, SOUNDS.kinds);
  for (const k of ['sip', 'bite', 'bell']) assert.deepEqual(cleanSound(JSON.stringify({ t: 'snd', k })), { k });
  for (const k of ['sneeze', '', 5, null]) assert.equal(cleanSound(JSON.stringify({ t: 'snd', k })), null);
});

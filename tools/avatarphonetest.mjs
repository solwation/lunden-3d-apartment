// #2217: the smartphone in a typing / away remote figure's hand and its screen's light (pure helpers). Run: node --test tools/avatarphonetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneFrame, phoneMatrix, phoneParts, phoneExtraTriangles, phoneShown, phoneGlow, screenFlicker, PHONE_PART } from '../src/avatarphone.js';
import { AVATAR_SMARTPHONE as SP } from '../src/config.js';
import * as THREE from 'three';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const box = () => { const b = new THREE.Box3(); for (const p of phoneParts()) { p.g.computeBoundingBox(); b.union(p.g.boundingBox.clone().applyMatrix4(phoneMatrix(-1))); } return b; };

test('placement: an orthonormal frame, the screen facing out of the palm, the top towards the fingertips; mirrored for the left hand', () => {
  for (const sx of [-1, 1]) {
    const f = phoneFrame(sx);
    for (const a of [f.x, f.y, f.z]) assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9);
    assert.ok(Math.abs(dot(f.x, f.y)) < 1e-9 && Math.abs(dot(f.y, f.z)) < 1e-9 && Math.abs(dot(f.x, f.z)) < 1e-9);
    assert.ok(dot(f.z, [-sx, 0, 0]) > 0.8, 'screen out of the palm (the palm faces −sx along x)');
    assert.ok(f.y[1] < -0.8, 'top towards the fingertips (−y)');
    assert.ok(f.at[0] * -sx > 0.015, 'centre off the palm side, not inside the hand');
  }
  const l = phoneFrame(1), r = phoneFrame(-1);
  assert.equal(l.at[0], -r.at[0]); assert.equal(l.at[1], r.at[1]);
});

test('placement: the phone lies on the right palm (back clear of the palm skin), spans the hand and reaches past the fingertips', () => {
  const b = box();
  assert.ok(b.min.x > 0.017, 'the back clears the palm (palm skin at about x 0.021 minus the flat hand) ' + b.min.x);
  assert.ok(b.max.x < 0.045, 'not floating off the hand ' + b.max.x);
  assert.ok(b.max.y > -0.02 && b.max.y < 0.03, 'its bottom near the wrist ' + b.max.y);
  assert.ok(b.min.y < -0.12, 'its top past the fingertips ' + b.min.y);
  assert.ok(b.min.z < -0.025 && b.max.z > 0.03, 'as wide as the hand');
});

test('geometry: body, screen and camera island in proportion, small triangle budget, three distinct parts', () => {
  const parts = phoneParts(), kinds = new Set(parts.map((p) => p.part));
  assert.deepEqual([...kinds].sort(), ['body', 'island', 'screen']);
  for (const k of kinds) assert.ok(PHONE_PART[k] >= 40 && PHONE_PART[k] < 100, 'outside the head parts (1 … 39) and the fingers (100+)');
  const s = parts.find((p) => p.part === 'screen').g; s.computeBoundingBox();
  const sw = s.boundingBox.max.x - s.boundingBox.min.x, sh = s.boundingBox.max.y - s.boundingBox.min.y;
  assert.ok(sw / SP.size[0] > 0.93 && sh / SP.size[1] > 0.96, 'thin bezels: the screen covers nearly the whole front');
  assert.ok(s.boundingBox.min.z > SP.size[2] / 2 - 1e-9, 'the screen on the front face');
  const isl = parts.filter((p) => p.part === 'island'); for (const p of isl) p.g.computeBoundingBox();
  assert.ok(isl.every((p) => p.g.boundingBox.max.z <= -SP.size[2] / 2 + 1e-9), 'the camera island on the back');
  const n = phoneExtraTriangles();
  assert.ok(n > 100 && n < 400, 'triangles ' + n);
});

test('shown from SP.show of the pose weight', () => {
  assert.equal(phoneShown(0), false); assert.equal(phoneShown(SP.show - 0.01), false); assert.equal(phoneShown(SP.show), true); assert.equal(phoneShown(1), true);
});

test('glow: off without the pose, strongest close and head-on, falls with angle and distance, nothing behind a surface or out of range', () => {
  assert.equal(phoneGlow(0, 1, 1, 0.3), 0, 'no pose: off');
  assert.equal(phoneGlow(-1, 1, 1, 0.3), 0);
  const full = phoneGlow(1, 1, 1, 0.3);
  assert.ok(full > 0);
  assert.ok(phoneGlow(0.5, 1, 1, 0.3) < full, 'eases with the weight');
  assert.ok(phoneGlow(1, 0.5, 1, 0.3) < full && phoneGlow(1, 1, 0.5, 0.3) < full, 'angle');
  assert.ok(phoneGlow(1, 1, 1, 0.6) < full && phoneGlow(1, 1, 1, 0.15) > full, 'distance');
  assert.equal(phoneGlow(1, -0.2, 1, 0.3), 0, 'the surface faces away');
  assert.ok(phoneGlow(1, 1, 0, 0.1) > 0 && phoneGlow(1, 1, 0, 0.1) < phoneGlow(1, 1, 1, 0.1), 'a little spill beside the screen (the fingers)');
  assert.equal(phoneGlow(1, 1, 1, SP.light.range), 0, 'out of range');
  assert.equal(phoneGlow(1, 1, 1, NaN), 0);
  // the typing pose as measured in tools/ghostphone.html (phone at y 1.36, z 0.35): the eyes ~0.37 m away, ~0.31 m above the screen, almost on
  // its normal (facing ~0.95), bare skin. The face takes the glow; the shirt below the collarbone (cloth, 0.12 … 0.25 m behind / beside the phone,
  // from 0.1 m below to 0.08 m above it, facing 0.3 … 0.7, squarely lit N·L 1) and the holding hand (skin, at the phone's height) only a faint spill.
  const face = phoneGlow(1, 0.8, 0.95, 0.37, 0.31, 1), chin = phoneGlow(1, 0.6, 0.9, 0.3, 0.15, 1);
  let shirt = 0;
  for (const d of [0.12, 0.18, 0.25]) for (const rise of [-0.1, 0, 0.08]) for (const fc of [0.3, 0.5, 0.7]) shirt = Math.max(shirt, phoneGlow(1, 1, fc, d, rise, 0));
  const hand = phoneGlow(1, 1, 0.1, 0.06, 0, 1);
  assert.ok(face > 0.1 * SP.light.gain, 'the face is lit ' + face);
  assert.ok(face > 10 * shirt, `face ${face} ≫ the brightest shirt point ${shirt}`);
  assert.ok(chin > 3 * shirt, `chin ${chin} > shirt`);
  assert.ok(hand > 0 && hand < face / 3, `a faint spill on the hand ${hand}`);
  assert.ok(phoneGlow(1, 1, 1, 0.3, 0.3, 0) < phoneGlow(1, 1, 1, 0.3, 0.3, 1) / 3, 'clothes and hair take much less than skin');
});

test('flicker: bounded, never off, changes over time', () => {
  const v = Array.from({ length: 400 }, (_, i) => screenFlicker(i * 0.05));
  assert.ok(Math.min(...v) >= 1 - SP.flicker.depth - 1e-9 && Math.max(...v) <= 1 + 1e-9);
  assert.ok(Math.max(...v) - Math.min(...v) > SP.flicker.depth * 0.3, 'it changes');
});

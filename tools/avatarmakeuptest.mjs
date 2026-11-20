// #2170: makeup coding (the look tag, its fallbacks), the lip colour, the eyeliner's place on the lid and the vertex colours it leaves.
//   node --test tools/avatarmakeuptest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { avatarLook, encodeAvatarLook, decodeAvatarLook, makeupOf, makeupCode, makeupFromCode, AVATAR_MAKEUP as M, AVATAR_FACE as FACE, AVATAR_LOOK_EXT_MAX } from '../src/config.js';
import { lipColour, linerWeight, linerShade, applyMakeupLook, makeupUniforms } from '../src/avatarmakeup.js';
import { edgeY } from '../src/avatarlids.js';
import { avatarModelGeometry } from '../src/avatar.js';

const ext = (code) => code.replace(/^\d+/, '');

test('#2170 makeup choices: invalid or missing values read as none', () => {
  assert.deepEqual(makeupOf(undefined), { lip: 0, eye: 0, blush: 0 });
  assert.deepEqual(makeupOf({ lipstick: 99, eyeMakeup: -1, blush: 1.5 }), { lip: 0, eye: 0, blush: 0 });
  assert.deepEqual(makeupOf({ lipstick: 4, eyeMakeup: 3, blush: 2 }), { lip: 4, eye: 3, blush: 2 });
});

test('#2170 code: every combination round-trips; out-of-range codes are refused', () => {
  const seen = new Set();
  for (let l = 0; l < M.lips.names.length; l++) for (let e = 0; e < M.eyes.names.length; e++) for (let b = 0; b < M.blush.names.length; b++) {
    const look = { lipstick: l, eyeMakeup: e, blush: b }, c = makeupCode(look);
    assert(!seen.has(c)); seen.add(c);
    assert.deepEqual(makeupFromCode(c), look);
  }
  assert.equal(seen.size, 60); assert.equal(Math.max(...seen), 59);
  assert.equal(makeupFromCode(60), null); assert.equal(makeupFromCode(-1), null); assert.equal(makeupFromCode(1.5), null);
});

test('#2170 tag p: no makeup = no change; makeup rides the legs tag\'s tens; the legs stay in the units; old values still read', () => {
  const plain = avatarLook('2170');
  assert.doesNotMatch(ext(encodeAvatarLook(plain)), /p/, 'an untouched look has no p tag');
  const lk = { ...plain, legs: 3, lipstick: 2, eyeMakeup: 3, blush: 1 }, code = encodeAvatarLook(lk), back = decodeAvatarLook(code);
  assert.match(ext(code), /p\d{1,3}/);
  assert.deepEqual([back.legs, back.lipstick, back.eyeMakeup, back.blush], [3, 2, 3, 1]);
  const only = decodeAvatarLook(encodeAvatarLook({ ...plain, lipstick: 1 }));
  assert.deepEqual([only.legs | 0, only.lipstick, makeupOf(only).eye], [0, 1, 0]);
  const legsOnly = decodeAvatarLook(encodeAvatarLook({ ...plain, legs: 4 }));
  assert.equal(legsOnly.legs, 4); assert.equal(makeupCode(legsOnly), 0);
  // an old client's reading of the same tag (units only, anything ≥ 5 skipped) sees the default legs, never garbage
  const v = Number(ext(code).match(/p(\d+)/)[1]);
  assert(v >= 10 && v % 10 === 3); assert(v >= 5, 'old clients skip it');
  // a tag a future client could send, or damage: ignored whole
  assert.equal(decodeAvatarLook(`${code.match(/^\d+/)[0]}p999`).lipstick, undefined);
  assert.equal(decodeAvatarLook(`${code.match(/^\d+/)[0]}p3`).legs, 3);
});

test('#2170 the longest look still fits the extension limit', () => {
  const lk = { ...avatarLook('2170'), legs: 4, lipstick: 4, eyeMakeup: 3, blush: 2, glasses: 3, earrings: 3, hat: 4, phones: 2, necklace: 4, ring: 10, metal: 3, bracelet: 3, watch: 3, brows: '#15151a' };
  const e = ext(encodeAvatarLook(lk)); assert(e.length <= AVATAR_LOOK_EXT_MAX, e);
});

test('#2170 lip colour: none keeps the skin-derived lips; lipsticks move toward their colour and stay distinct', () => {
  const lips = new THREE.Color(0xc07870);
  assert.equal(lipColour(lips, {}).getHex(), lips.getHex());
  const cols = [1, 2, 3, 4].map((k) => lipColour(lips, { lipstick: k }));
  assert(new Set(cols.map((c) => c.getHex())).size === 4);
  const red = cols[1], pink = lips;
  assert(red.r > red.g * 3, 'red reads red');
  assert(pink.r - pink.g < red.r - red.g, 'and redder than the plain lips');
});

test('#2170 eyeliner: upper line on the margin with a wing past the outer corner, thinner lower line, nothing without liner', () => {
  const R = FACE.eye.r, E = M.eyes.liner;
  for (const eye of [0, 1]) assert.equal(linerWeight(0, edgeY(0, true) + 0.0002, 1, eye), 0, 'no liner for none / mascara');
  const top = (x) => edgeY(x, true);
  assert(linerWeight(0, top(0), 1, 2) > 0.99, 'full on the upper margin');
  assert(linerWeight(0, top(0) + E.upper[1] + 0.0005, 1, 3) === 0, 'none farther up');
  assert(linerWeight(0, top(0) + E.upper[0] * 0.5, 1, 2) > 0.9);
  assert(linerWeight(-R * 0.98, 0.0002, 1, 2) < 0.1, 'fades out at the inner corner');
  assert(linerWeight(R * 1.3, 0.0004 + E.rise * 0.3 * R, 1, 2) > 0.2 && linerWeight(R * 1.3, 0.0004 + E.rise * 0.3 * R, 1, 2) < 1, 'a wing past the outer corner');
  assert.equal(linerWeight(R + E.wing * 1.01, 0.001, 1, 2), 0, 'the wing ends');
  const low = linerWeight(0, edgeY(0, false), 1, 2);
  assert(low > 0.5 && low <= E.lowerK + 1e-9, 'the lower line is thinner');
  for (let i = 0; i < 400; i++) { const w = linerWeight((Math.random() * 2 - 1) * R * 1.5, (Math.random() * 2 - 1) * 0.01, 1, 3); assert(w >= 0 && w <= 1 + 1e-9); }
  assert(Math.abs(linerShade(1) - E.colour) < 1e-12 && linerShade(0) === 1);
});

test('#2170 uniforms: mascara lengthens and darkens, blush gains strength; none = today', () => {
  const u = makeupUniforms();
  assert.deepEqual([u.uMake.value.x, u.uMake.value.y, u.uBlush.value.w], [1, 0, 0]);
  applyMakeupLook(u, { eyeMakeup: 1, blush: 2 });
  assert.deepEqual([u.uMake.value.x, u.uMake.value.y, u.uBlush.value.w], [M.eyes.lash, M.eyes.dark, M.blush.strength[2]]);
  applyMakeupLook(u, { eyeMakeup: 2 }); assert.equal(u.uMake.value.x, 1, 'liner alone leaves the lashes');
  applyMakeupLook(u, { eyeMakeup: 3 }); assert.equal(u.uMake.value.x, M.eyes.lash);
});

test('#2170 geometry: lipstick recolours the lips only; liner darkens lid-margin vertices only; no extra triangles', () => {
  const plain = avatarLook('2170'), a = avatarModelGeometry(plain), b = avatarModelGeometry({ ...plain, lipstick: 2 }), c = avatarModelGeometry({ ...plain, eyeMakeup: 2 });
  assert.equal(a.attributes.position.count, b.attributes.position.count); assert.equal(a.attributes.position.count, c.attributes.position.count);
  const reg = a.attributes.region, part = a.attributes.facePart;
  let lipDiff = 0, otherLip = 0, lidDark = 0, lidOther = 0;
  for (let i = 0; i < reg.count; i++) {
    const d = (x) => Math.abs(x.attributes.color.getX(i) - a.attributes.color.getX(i)) + Math.abs(x.attributes.color.getY(i) - a.attributes.color.getY(i));
    if (d(b) > 1e-6) { if (reg.getX(i) === 6) lipDiff++; else otherLip++; }
    if (d(c) > 1e-6) { if (reg.getX(i) === 0 && part.getX(i) === 3) lidDark++; else lidOther++; }
  }
  assert(lipDiff > 20 && otherLip === 0, `lips ${lipDiff}, elsewhere ${otherLip}`);
  assert(lidDark > 20 && lidOther === 0, `lid ${lidDark}, elsewhere ${lidOther}`);
});

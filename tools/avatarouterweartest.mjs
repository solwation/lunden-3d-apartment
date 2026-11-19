// #2147: the outer layer, headless. node --test tools/avatarouterweartest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { newOuter, stepOuter, outerWeather, wornLook, outerCut, outerColour } from '../src/avataroutwear.js';
import { AVATAR_OUTERWEAR as O, encodeAvatarLook, encodeAvatarWireLook, decodeAvatarLook, avatarLook, TOPS } from '../src/config.js';
import { seamLook } from '../src/avatarseam.js';
import { clothKinds } from '../src/avatarcloth.js';

const base = () => ({ ...decodeAvatarLook('240302101', 'x'), outer: 1, outerMode: 0 });
const run = (s, look, secs, outdoors, env, preview = false) => { for (let t = 0; t < secs; t += 0.5) stepOuter(s, 0.5, look, outdoors, env, preview); return s.worn; };

test('#2147 automatic: on outdoors in the cold or in rain / snow, off in mild dry weather', () => {
  const lk = base();
  assert.equal(run(newOuter(), lk, 1, true, { temp: 2, rain: 0, kind: null }), true, 'cold');
  assert.equal(run(newOuter(), lk, 1, true, { temp: 18, rain: 0.8, kind: 'rain' }), true, 'rain');
  assert.equal(run(newOuter(), lk, 1, true, { temp: 1, rain: 0.8, kind: 'snow' }), true, 'snow');
  assert.equal(run(newOuter(), lk, 1, true, { temp: 18, rain: 0, kind: null }), false, 'mild and dry');
  assert.equal(run(newOuter(), lk, 1, true, { temp: 18, rain: 0.01, kind: 'rain' }), false, 'a few drops do not count');
  assert.equal(run(newOuter(), lk, 1, false, { temp: -5, rain: 1, kind: 'snow' }), false, 'never put on indoors');
});

test('#2147 automatic: taken off a few seconds after stepping indoors, hysteresis on the temperature', () => {
  const lk = base(), s = newOuter(), cold = { temp: 2, rain: 0, kind: null };
  assert.equal(run(s, lk, 2, true, cold), true);
  assert.equal(run(s, lk, O.takeOffDelay - 1, false, cold), true, 'a doorway keeps it on');
  assert.equal(run(s, lk, 3, false, cold), false, 'indoors long enough: off');
  const t = newOuter();
  run(t, lk, 1, true, { temp: O.coldBelow - 1 }); assert.equal(t.worn, true);
  run(t, lk, 1, true, { temp: O.coldBelow + 1 }); assert.equal(t.worn, true, 'just above the line: stays on');
  run(t, lk, 1, true, { temp: O.warmAbove + 1 }); assert.equal(t.worn, false);
  run(t, lk, 1, true, { temp: O.coldBelow + 1 }); assert.equal(t.worn, false, 'and stays off until it is colder than the line');
  assert.equal(outerWeather({ temp: NaN }), false);
});

test('#2147 modes: always wears it, the preview shows it, no chosen layer never does', () => {
  assert.equal(run(newOuter(), { ...base(), outerMode: 1 }, 1, false, { temp: 25 }), true);
  assert.equal(run(newOuter(), base(), 1, false, { temp: 25 }, true), true, 'customizer preview');
  assert.equal(run(newOuter(), { ...base(), outer: 0 }, 1, true, { temp: -10, kind: 'snow', rain: 1 }), false);
});

test('#2147 wornLook: jacket 3, coat 4, long sleeves, own colour; unchanged when not worn', () => {
  const j = base(), c = { ...base(), outer: 2 };
  assert.equal(outerCut(j), 3); assert.equal(outerCut(c), 4); assert.equal(outerCut({}), 0);
  assert.equal(wornLook(j, false), j);
  assert.deepEqual([wornLook(j, true).cut, wornLook(j, true).sleeves, wornLook(c, true).cut], [3, 1, 4]);
  assert(O.colours.jacket.includes(outerColour(j)) && O.colours.coat.includes(outerColour(c)));
  assert.equal(outerColour(j), outerColour({ ...j }), 'stable per top');
  assert.equal(seamLook(wornLook(c, true)).top, 'tshirt');
  assert(seamLook(wornLook(c, true)).hemY < seamLook(wornLook(j, true)).hemY && seamLook(wornLook(j, true)).hemY < seamLook(j).hemY, 'coat hem lowest, then jacket, then tee');
  assert.equal(clothKinds(wornLook(j, true)).top, 'sweater');
});

test('#2147 look code: round-trips, older codes unchanged, old clients skip the new value', () => {
  const plain = decodeAvatarLook('240302101', 'x');
  assert.equal(encodeAvatarLook(plain), '240302101', 'no layer: no tag');
  for (const [cut, outer, mode] of [[0, 1, 0], [0, 2, 1], [2, 1, 0], [1, 2, 1], [2, 2, 1]]) {
    const code = encodeAvatarLook({ ...plain, cut, outer, outerMode: mode }), back = decodeAvatarLook(code, 'x');
    assert.deepEqual([back.cut | 0, back.outer | 0, back.outerMode | 0], [cut, outer, mode], code);
    assert(/m\d{1,2}$/.test(code));
  }
  assert.equal(encodeAvatarLook({ ...plain, outer: 1 }).slice(9), 'm3');
  assert.equal(encodeAvatarLook({ ...plain, cut: 2 }).slice(9), 'm2', 'the hoodie alone is as before');
  assert.equal(decodeAvatarLook('240302101m1', 'x').cut, 1);
  assert.equal(decodeAvatarLook('240302101m2', 'x').outer, undefined);
  // an older client's rule (v < 3 else skip): emulate
  const oldReads = (code) => { const v = Number(/m(\d+)/.exec(code)?.[1] ?? 0); return v < 3 ? v : 0; };
  assert.equal(oldReads(encodeAvatarLook({ ...plain, outer: 2 })), 0, 'old client: base top');
  assert.equal(oldReads(encodeAvatarLook({ ...plain, cut: 1 })), 1);
  // junk is ignored
  for (const bad of ['m9', 'm18', 'm27']) assert.equal(decodeAvatarLook(`240302101${bad}`, 'x').outer, undefined, bad);
  assert.equal(decodeAvatarLook('240302101m12', 'x').outerMode, 1);
  assert.equal(decodeAvatarLook('240302101m9', 'x').cut, undefined, 'outer 0 with the mode set is invalid');
  assert.equal(avatarLook(decodeAvatarLook('240302101m4', 'x')).outer, 1);
  assert.match(encodeAvatarWireLook({ ...plain, outer: 2, outerMode: 1 }), /m15/);
  assert(TOPS.length > 0);
});

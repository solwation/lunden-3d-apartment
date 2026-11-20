// #2166: stubble and the cropped beard: the stubble zone helper (inside the beard's area, clear of the lips and the nose) and the look
// tag's parsing with its fallbacks for older clients and missing values.
//   node --test tools/avatarstubbletest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarLook, encodeAvatarLook, decodeAvatarLook, beardCutOf, beardChoiceOf, setBeardChoice, AVATAR_BEARD as B, AVATAR_BEARD_CUT as CUT } from '../src/config.js';
import { stubbleZone, beardDensity, mouthOut } from '../src/avatarbeard.js';
import { avatarModelGeometry } from '../src/avatar.js';

test('#2166 stubble zone: on the chin, jaw and moustache area; not on the lips, the nose, the forehead or behind the jaw', () => {
  assert(stubbleZone(0, -45) > 0.9, 'chin');
  assert(stubbleZone(40, -40) > 0.9, 'jaw');
  assert(stubbleZone(20, -12) > 0.5, 'above the upper lip, the moustache area');
  assert.equal(stubbleZone(0, B.opening.e), 0, 'the lips');
  assert(stubbleZone(B.opening.half[0] * 0.8, B.opening.e) < 0.05, 'the mouth corner');
  assert.equal(stubbleZone(0, 5), 0, 'the nose');
  assert.equal(stubbleZone(0, 25), 0, 'the forehead');
  assert(stubbleZone(B.azimuth - 1, -40) < 0.1, 'behind the jaw');
  for (let a = -90; a <= 90; a += 5) for (let e = -76; e <= 30; e += 2) {
    const z = stubbleZone(a, e);
    assert(z >= 0 && z <= 1 + 1e-9, 'range');
    if (mouthOut(a, e) <= 0) assert.equal(z, 0, `inside the mouth oval at ${a}, ${e}`);
    if (e > -5 && Math.abs(a) < 20) assert.equal(z, 0, `above the moustache at ${a}, ${e}`);
  }
});

test('#2166 tag: the beard cut rides the x tag; missing = today; older clients get stubble as none and short as the full beard', () => {
  const plain = { ...avatarLook('2166'), facial: 3 };
  assert.equal(beardCutOf(plain), 0);
  assert(!/x/.test(encodeAvatarLook(plain).replace(/^\d+/, '')) || beardCutOf(decodeAvatarLook(encodeAvatarLook(plain))) === 0, 'no cut, no change');
  const stub = setBeardChoice({ ...avatarLook('2166') }, 4), short = setBeardChoice({ ...avatarLook('2166') }, 5);
  assert.deepEqual([stub.facial, stub.beardCut, beardChoiceOf(stub)], [0, 1, 4]);
  assert.deepEqual([short.facial, short.beardCut, beardChoiceOf(short)], [3, 2, 5]);
  const cs = encodeAvatarLook(stub), cl = encodeAvatarLook(short);
  assert.match(cs, /x10/); assert.match(cl, /x20/);
  assert.equal(cs.match(/^\d+/)[0].at(8), '0', 'digits: stubble reads as no facial hair');
  assert.equal(cl.match(/^\d+/)[0].at(8), '3', 'digits: short reads as the full beard');
  assert.equal(decodeAvatarLook(cs).beardCut, 1); assert.equal(decodeAvatarLook(cl).beardCut, 2);
  assert.equal(beardCutOf(decodeAvatarLook(cs)), 1); assert.equal(beardCutOf(decodeAvatarLook(cl)), 2);
  // the necklace keeps the units
  const both = encodeAvatarLook({ ...short, necklace: 2 });
  assert.match(both, /x22/); assert.equal(decodeAvatarLook(both).necklace, 2);
  // an older code (digits only) and an unknown cut value read as today's look
  const old = cl.match(/^\d+/)[0];
  assert.equal(beardCutOf(decodeAvatarLook(old)), 0);
  assert.equal(beardCutOf(decodeAvatarLook(old + 'x90')), 0, 'an unknown cut is ignored');
  assert.equal(decodeAvatarLook(old + 'x90').facial, 3);
  // a cut that does not fit the facial hair is ignored
  assert.equal(beardCutOf({ facial: 2, beardCut: 2 }), 0); assert.equal(beardCutOf({ facial: 1, beardCut: 1 }), 0);
  assert.equal(beardCutOf({ facial: 0, beardCut: 5 }), 0);
  // the choices 0 … 3 clear any cut
  assert.deepEqual([setBeardChoice({ facial: 0, beardCut: 1 }, 2).beardCut, setBeardChoice({ facial: 3, beardCut: 2 }, 1).facial], [0, 1]);
});

test('#2166 geometry: the short beard is a thinner shell without flyaways; stubble adds no geometry', () => {
  const tri = (lk) => avatarModelGeometry({ ...avatarLook('2166'), style: 0, gender: 0, ...lk }).attributes.position.count / 3;
  const none = tri({ facial: 0 }), stub = tri({ facial: 0, beardCut: 1 }), full = tri({ facial: 3 }), short = tri({ facial: 3, beardCut: 2 });
  assert.equal(stub, none, 'stubble: the same triangles as none');
  assert(short < full && short > none, `short ${short} between none ${none} and full ${full}`);
  assert(CUT.short.thick < 1 && CUT.short.len < 1);
  assert(beardDensity(0, -45, true) > 0.9);
});

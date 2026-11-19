// #2155: age on the avatars: the look code's age step (the hat's `q` tag, backward compatible), the derived strengths per step (fold depth,
// grey share), the deterministic per-avatar seed and the GLSL mirrors. Function-level checks (no frozen file diffs).
// node --test tools/avataragetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_AGE as A, AVATAR_HAT, encodeAvatarLook, decodeAvatarLook, encodeAvatarWireLook, splitAvatarCode, avatarLook, ageStepOf, AVATAR_LOOK_EXT_MAX } from '../src/config.js';
import { ageParams, ageSeed, greyAt, templeWeight, ageHeight, ageUniforms, applyAgeLook, ageColor, ageRoughness } from '../src/avatarage.js';
import { sculptShader } from '../src/avatarsculpt.js';

const base = avatarLook('age2155');
const look = (o) => ({ ...base, ...o });
const last = A.steps - 1;

test('young by default: no code, no uniforms, a missing or invalid step is 0', () => {
  assert.equal(ageStepOf(base), 0);
  for (const bad of [-1, 11, 99, 1.5, '3', NaN, null, undefined]) assert.equal(ageStepOf(look({ age: bad })), 0, String(bad));
  assert.match(encodeAvatarLook(base), /^[0-9]{9}$/, 'an untouched look keeps its plain code');
  assert.doesNotMatch(encodeAvatarLook(look({ age: 0 })), /q/);
  const u = ageUniforms(); applyAgeLook(u, base);
  assert.deepEqual(u.uAge.value.toArray(), [0, 0, 0, 0]); assert.deepEqual(u.uAge2.value.toArray(), [0, 0, 0, 0]);
  const p = ageParams(0); assert.deepEqual([p.fold, p.grey, p.temple, p.bag, p.matte, p.white], [0, 0, 0, 0, 0, 0]);
});

test('round trip through the look code and the wire; the hat keeps the units', () => {
  for (const [age, hat] of [[1, 0], [5, 0], [10, 0], [7, 3], [10, 4], [3, 1]]) {
    const lk = look({ age, hat }), code = encodeAvatarLook(lk), back = decodeAvatarLook(code, 'other');
    assert.equal(ageStepOf(back), age); assert.equal(back.hat ?? 0, hat); assert.equal(encodeAvatarLook(back), code);
    const q = Number(new RegExp(`${AVATAR_HAT.tag}([0-9]{1,3})`).exec(code)[1]); assert.equal(q, hat + 10 * age, 'one `q` tag, hat + 10 × age');
    const wire = splitAvatarCode(encodeAvatarWireLook(lk)); assert.equal(ageStepOf(decodeAvatarLook(wire.av + wire.ax, 'x')), age);
    assert.ok(wire.ax.length <= AVATAR_LOOK_EXT_MAX);
  }
  assert.equal(decodeAvatarLook(encodeAvatarLook(look({ hat: 2 })), 'p').hat, 2, 'a hat alone is the old code');
  assert.match(encodeAvatarLook(look({ hat: 2 })), /q2(?![0-9])/);
});

test('an old client (hat only, v < 5) and bad values: no crash, nothing wrong', () => {
  // the previous decoder's rule for `q`: `if (v < AVATAR_HAT.names.length) lk.hat = v`: an aged avatar's tag (≥ 10) is skipped there
  const code = encodeAvatarLook(look({ age: 6, hat: 2 }));
  assert.ok(Number(/q([0-9]+)/.exec(code)[1]) >= AVATAR_HAT.names.length, 'old clients skip it (losing only the hat)');
  for (const bad of ['q999', 'q110', 'q5', 'q61', 'q9']) {
    const lk = decodeAvatarLook(`000000000${bad}`, 'z');
    assert.ok(ageStepOf(lk) < A.steps && (lk.hat ?? 0) < AVATAR_HAT.names.length, bad);
  }
  assert.equal(ageStepOf(decodeAvatarLook('000000000q110', 'z')), 0, 'a step beyond the last is ignored');
});

test('fold depth and grey share grow monotonically with the step', () => {
  let prev = ageParams(0);
  for (let a = 1; a <= last; a++) {
    const p = ageParams(a);
    for (const k of ['fold', 'grey', 'temple', 'bag', 'matte', 'white']) assert.ok(p[k] >= prev[k] - 1e-12, `${k} at ${a}`);
    prev = p;
  }
  const o = ageParams(last);
  assert.equal(o.fold, 1); assert.ok(o.grey > 0.9 && o.grey <= 1); assert.equal(o.white, 1); assert.ok(o.matte > 0 && o.matte < 0.4);
  assert.ok(ageParams(2).grey < 0.1 && ageParams(5).grey > 0.2 && ageParams(5).grey < 0.5, 'middle age: some grey, mostly dark');
  assert.ok(ageParams(5).temple > ageParams(5).grey * 0.5 - 1e-9 || ageParams(1).temple > 0, 'the temples start first');
  assert.deepEqual(ageParams(99), ageParams(last)); assert.deepEqual(ageParams(-3), ageParams(0));
});

test('the folds deepen with the step and sit on the intended spots', () => {
  const depth = (x, y, a) => ageHeight(x, y, ageParams(a).fold);
  assert.equal(Math.abs(depth(0.02, 0.15, 0)), 0); assert.equal(Math.abs(depth(0.0, 0.1495, 1)), 0, 'none at step 1');
  for (const [x, y, name] of [[0.02, 0.1475, 'forehead line'], [0.06, 0.1055, 'crow\'s foot'], [0.032, 0.0795, 'tear trough']]) {
    const d = [3, 6, 10].map((a) => depth(x, y, a));
    assert.ok(d[0] < 0 && d[1] < d[0] && d[2] < d[1], `${name} deepens: ${d}`);
  }
  assert.ok(depth(0.032, 0.0885, 10) > 0, 'the bag bulges');
  assert.ok(depth(0.0, 0.2, 10) === 0 || Math.abs(depth(0.0, 0.2, 10)) < 1e-6, 'nothing high on the scalp');
  assert.ok(Math.abs(depth(-0.02, 0.1475, 10) - depth(0.02, 0.1475, 10)) < 1e-12, 'mirrored');
  // the nasolabial fold is deeper than #2044's own at the last step
  assert.ok(ageHeight(0.0285, 0.056, 1) !== 0);
  // every form stays a believable depth (≤ 1.5 mm) so the face is not carved
  for (let i = 0; i < 4000; i++) { const x = (((i * 37) % 101) / 100 - 0.5) * 0.16, y = ((i * 53) % 103) / 103 * 0.2; assert.ok(Math.abs(ageHeight(x, y, 1)) < 0.0015); }
});

test('grey strands: deterministic per avatar, the share matches the step, temples first, toward white', () => {
  assert.equal(ageSeed(look({ age: 3 })), ageSeed(look({ age: 9 })), 'the seed does not depend on the age');
  assert.equal(ageSeed(decodeAvatarLook(encodeAvatarLook(look({ age: 5, skin: base.skin })), 'someone else')), ageSeed(look({ age: 5 })), 'a peer derives the same seed');
  assert.notEqual(ageSeed(look({ hair: 0x123456 })), ageSeed(base));
  const share = (a, tw = 0) => { const p = ageParams(a); let n = 0, N = 20000; for (let i = 0; i < N; i++) if (greyAt(p, (i + 0.5) / N, tw)) n++; return n / N; };
  for (const a of [0, 2, 4, 6, 8, 10]) assert.ok(Math.abs(share(a) - ageParams(a).grey) < 0.01, `step ${a}`);
  assert.equal(share(0, 1), 0, 'young: no grey even at the temples');
  for (const a of [2, 4, 6]) assert.ok(share(a, 1) > share(a, 0), `temples greyer at step ${a}`);
  const sh = [2, 4, 6, 8, 10].map((a) => share(a)); for (let i = 1; i < sh.length; i++) assert.ok(sh[i] > sh[i - 1]);
  assert.ok(templeWeight(0.075, A.temple[3]) > 0.9 && templeWeight(0, 0.13) === 0 && templeWeight(0.07, 0.03) < 0.01);
  assert.ok(A.tone[0] < A.tone[1] && A.tone[1] < 1, 'mid grey towards white');
});

test('the GLSL: age forms inside the sculpt, colour block and roughness only when aged', () => {
  const fs = '#include <common>\n#include <color_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_end>';
  const out = sculptShader(fs, { head: { x: 0, y: 1.6, z: 0 }, part: { head: 1, cowlHide: 11 } });
  assert.match(out, /uniform vec4 uAge, uAge2;/); assert.match(out, /float scAge\(/); assert.match(out, /\+ scAge\(p, s\)/);
  const c = ageColor({ head: { x: 0, y: 1.6, z: 0 }, part: { head: 1 }, region: { lips: 6, hair: 3, beard: 8, brow: 9 } });
  assert.match(c, /uAge2\.w > 0\.0/); assert.match(c, /beardCov/); assert.match(c, /browCov/);
  assert.equal((c.match(/\{/g) || []).length, (c.match(/\}/g) || []).length, 'balanced braces');
  assert.match(ageRoughness(), /uAge\.z > 0\.0/);
});

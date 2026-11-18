// #2111: optional skin variation (freckles, birthmarks, uneven tone): placement deterministic from the look, clear of lids, lips and
// brows, off by default, and carried through the look code (the eye colour's `c` tag). Function-level checks (no frozen file diffs).
// node --test tools/avatarskinvartest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_SKIN_VARIATION as V, EYES, SKIN, TOPS, encodeAvatarLook, decodeAvatarLook, encodeAvatarWireLook, splitAvatarCode, avatarLook, skinVarOf, AVATAR_LOOK_EXT_MAX } from '../src/config.js';
import { skinVarSpots, skinVarClear, skinVarUniforms, applySkinVarLook, skinVarColor, skinVarKey } from '../src/avatarskinvar.js';

const base = avatarLook('skinvar');
const look = (o) => ({ ...base, ...o });

test('off by default: no spots, no uniforms, no code', () => {
  assert.deepEqual(skinVarOf(base), { freckles: 0, marks: 0, blotch: 0, skinSeed: 0 });
  const s = skinVarSpots(base);
  assert.equal(s.freckles.length + s.marks.length + s.flush.length, 0); assert.equal(s.under, 0);
  const u = skinVarUniforms();
  assert.equal(applySkinVarLook(u, base), 0); assert.deepEqual(u.uSkinVar.value.toArray(), [0, 0, 0, 0]);
  assert.match(encodeAvatarLook(base), /^[0-9]{9}$/, 'an untouched look keeps its plain code');
  assert.match(encodeAvatarLook(look({ skinSeed: 5 })), /^[0-9]{9}$/, 'a seed alone is not written');
  for (const bad of [{ freckles: 9 }, { freckles: -1 }, { marks: 2 }, { blotch: 'x' }, { freckles: 1.5 }]) assert.equal(skinVarSpots(look(bad)).freckles.length, 0);
});

test('placement is deterministic, grows with the amount and changes with the seed', () => {
  const hi = look({ freckles: 3, marks: 1, blotch: 1, skinSeed: 3 });
  assert.deepEqual(skinVarSpots(hi), skinVarSpots({ ...hi }), 'the same look → the same spots');
  assert.deepEqual(skinVarSpots(decodeAvatarLook(encodeAvatarLook(hi), 'other-player')), skinVarSpots(hi), 'a peer decoding the code sees the same');
  const n = [1, 2, 3].map((a) => skinVarSpots(look({ freckles: a, skinSeed: 3 })).freckles);
  assert.deepEqual(n.map((l) => l.length), V.counts.slice(1));
  assert.deepEqual(n[1].slice(0, n[0].length), n[0], 'more freckles keep the fewer ones');
  assert.deepEqual(n[2].slice(0, n[1].length), n[1]);
  assert.notDeepEqual(skinVarSpots(look({ freckles: 2, skinSeed: 4 })).freckles, n[1], 'another seed, another placement');
  const m = skinVarSpots(hi).marks; assert.ok(m.length >= V.mark[0] && m.length <= V.mark[1]);
  assert.equal(skinVarSpots(hi).flush.length, V.flush[0]); assert.equal(skinVarSpots(hi).under, V.under[4]);
});

test('spots avoid the lids, lips and brows and stay on the face front', () => {
  // the kept-clear areas cover the measured bind bounds of the lids (x 0.006…0.048, y 0.098…0.118) and lips (|x| ≤ 0.021, y 0.033…0.058)
  for (const [x, y] of [[0.031, 0.108], [0.045, 0.105], [0.015, 0.1], [0, 0.045], [0.02, 0.04], [0.01, 0.056], [0.03, 0.125]]) assert.ok(skinVarClear(x, y), `${x},${y}`);
  for (const [x, y] of [[0.045, 0.075], [0, 0.085], [0.06, 0.09]]) assert.ok(!skinVarClear(x, y), `${x},${y} (cheek / nose bridge)`);
  for (let seed = 0; seed < V.seeds; seed++) for (const skin of [SKIN[0], SKIN.at(-1)]) {
    const s = skinVarSpots(look({ skin, freckles: 3, marks: 1, skinSeed: seed }));
    for (const p of [...s.freckles, ...s.marks]) {
      assert.ok(!skinVarClear(p.x, p.y, p.r), `seed ${seed}: ${p.x.toFixed(3)},${p.y.toFixed(3)} clear of eyes / lips / brows`);
      assert.ok(Math.abs(p.x) <= 0.075 && p.y >= 0 && p.y <= 0.17);
    }
    for (const p of s.freckles) assert.ok(p.y >= V.zone[1] && p.y <= V.zone[2] && p.r >= V.r[0] && p.r <= V.r[1] && p.k > 0 && p.k < 1);
    for (let i = 0; i < s.freckles.length; i++) for (let j = 0; j < i; j++) {
      const a = s.freckles[i], b = s.freckles[j]; assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= V.gap * Math.max(a.r, b.r) - 1e-9, 'no clumps');
    }
  }
});

test('round trip through the look code and the wire; old clients keep everything but the eye colour', () => {
  for (const [f, m, b, seed, eyes] of [[1, 0, 0, 0, 0], [3, 1, 1, 6, 7], [0, 1, 0, 2, 5], [0, 0, 1, 4, 3], [2, 1, 0, 1, 0]]) {
    const lk = look({ freckles: f, marks: m, blotch: b, skinSeed: seed, eyes: EYES[eyes] }), code = encodeAvatarLook(lk);
    const back = decodeAvatarLook(code, 'p');
    assert.deepEqual(skinVarOf(back), skinVarOf(lk)); assert.equal(back.eyes, EYES[eyes]);
    assert.equal(encodeAvatarLook(back), code);
    const wire = splitAvatarCode(encodeAvatarWireLook(lk)); assert.deepEqual(skinVarOf(decodeAvatarLook(wire.av + wire.ax, 'q')), skinVarOf(lk));
    const c = Number(/c([0-9]{1,3})/.exec(code)[1]); assert.ok(c >= 8 && c <= 999, 'one `c` tag of up to three digits');
    assert.ok(!(c < EYES.length), 'an old client (c < 8 only) skips it');
  }
  // a code without the variation keeps it off; an eye colour alone keeps its old `c` value
  assert.match(encodeAvatarLook(look({ eyes: EYES[5] })), /c5$/);
  assert.deepEqual(skinVarOf(decodeAvatarLook(encodeAvatarLook(look({ eyes: EYES[5] })), 'p')), skinVarOf(base));
  assert.equal(decodeAvatarLook(encodeAvatarLook(base) + 'c999', 'p').eyes, EYES[0], 'an out-of-range value is skipped');
  // the largest look code still fits the Worker's extension limit
  const everything = look({ eyes: EYES[7], freckles: 3, marks: 1, blotch: 1, skinSeed: 6, glasses: 2, earrings: 4, hat: 4, phones: 2, necklace: 4, ring: 10, metal: 3, bracelet: 6, watch: 6, brows: base.hair, legs: 2, cut: 2, bodyBuild: 8, noseForm: 3, top: TOPS.at(-1) }); // (60 characters on the wire without a height: exactly the limit)
  for (const n of ['eyeSize', 'eyeShape', 'headWidth', 'headLength', 'jaw', 'noseSize', 'noseWidth', 'ears', 'browThick', 'browY', 'hairLength', 'neck']) everything[n] = 8;
  for (const lk of [everything, { ...everything, height: 140 }]) assert.ok(splitAvatarCode(encodeAvatarWireLook(lk)).ax.length <= AVATAR_LOOK_EXT_MAX, splitAvatarCode(encodeAvatarWireLook(lk)).ax);
});

test('uniforms and shader piece', () => {
  const u = skinVarUniforms(), lk = look({ freckles: 3, marks: 1, blotch: 1, skinSeed: 1 }), s = skinVarSpots(lk);
  const n = applySkinVarLook(u, lk);
  assert.equal(n, s.freckles.length + s.marks.length + s.flush.length); assert.ok(n <= V.max);
  const codes = u.uSkinSpot.value.slice(0, n).map((v) => v.w);
  assert.ok(codes.slice(0, s.freckles.length).every((k) => k > 0 && k < 1) && codes.slice(s.freckles.length, s.freckles.length + s.marks.length).every((k) => k > 1 && k < 2) && codes.slice(-s.flush.length).every((k) => k < 0));
  assert.ok(u.uSkinSpot.value.slice(n).every((v) => v.w === 0));
  applySkinVarLook(u, base); assert.equal(u.uSkinVar.value.x, 0, 'switching back off clears it');
  const glsl = skinVarColor({ head: { x: 0, y: 1.5, z: 0 }, part: { head: 1 }, lips: 6 });
  assert.match(glsl, /fwidth\(vSuitAt\.xy\)[^\n]*\n\s*if \(uSkinVar/, 'the derivative is taken before any branch');
  assert.match(skinVarKey(), /-skinvar2111/);
});

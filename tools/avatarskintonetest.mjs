// #2156: ten skin tones with undertones. Look code (digit = nearest old tone, `u` tag = the real tone), the fallback for older clients and
// undertone-dependent blush / backlight / rim. Function-level checks (no frozen file diffs).
// node --test tools/avatarskintonetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIN, SKIN_TONES, TOPS, AVATAR_UNDERTONES as U, AVATAR_SKIN as SK, AVATAR_SKIN_DETAIL as D, encodeAvatarLook, decodeAvatarLook, encodeAvatarWireLook, splitAvatarCode, avatarCodeValid, avatarLook, skinToneIndex, skinUndertone, skinUndertoneOf, AVATAR_LOOK_EXT_MAX } from '../src/config.js';
import { toneUniforms, applyToneLook, toneDecl } from '../src/avatartone.js';

const base = avatarLook('tone2156');
const look = (o) => ({ ...base, ...o });
const lum = (c) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);

test('ten tones, very light to deep dark, three kinds of undertone; the old five are first and unchanged', () => {
  assert.equal(SKIN_TONES.length, 10);
  assert.deepEqual(SKIN_TONES.slice(0, 5).map((t) => t.c), SKIN);
  assert.equal(new Set(SKIN_TONES.map((t) => t.c)).size, 10);
  const lums = SKIN_TONES.map((t) => lum(t.c));
  assert.ok(Math.max(...lums) > 215 && Math.min(...lums) < 60, 'from very light to deep dark');
  assert.ok(lum(SKIN_TONES[9].c) < lum(SKIN[4]) * 0.8, 'darker than the old darkest');
  const kinds = new Set(SKIN_TONES.map((t) => t.u));
  for (const k of ['warm', 'neutral', 'olive']) assert.ok(kinds.has(k), k);
  for (const t of SKIN_TONES) assert.ok(U[t.u], t.u);
});

test('the nearest old tone is a real old tone close to the new one', () => {
  for (const [i, t] of SKIN_TONES.entries()) {
    assert.ok(Number.isInteger(t.near) && t.near >= 0 && t.near < SKIN.length);
    if (i < 5) assert.equal(t.near, i);
    const best = SKIN.map((c, k) => [Math.abs(lum(c) - lum(t.c)), k]).sort((a, b) => a[0] - b[0])[0][1];
    assert.ok(Math.abs(best - t.near) <= 1, `tone ${i}: near ${t.near}, closest by lightness ${best}`);
  }
});

test('every tone round-trips through the look code and the wire; extended tones write the old digit plus the `u` tag', () => {
  for (const [i, t] of SKIN_TONES.entries()) {
    const code = encodeAvatarLook(look({ skin: t.c })), { av, ax } = splitAvatarCode(code);
    assert.ok(avatarCodeValid(av));
    assert.equal(Number(av[0]), t.near, `tone ${i} writes its nearest old tone in the digit`);
    if (i < 5) assert.doesNotMatch(ax, /u/, 'an old tone adds no tag');
    else assert.match(ax, /^u\d+$/);
    assert.equal(decodeAvatarLook(code, 'other').skin, t.c, `tone ${i}`);
    const wire = encodeAvatarWireLook(look({ skin: t.c, bodyBuild: 3 }));
    assert.equal(decodeAvatarLook(wire, 'peer').skin, t.c, `tone ${i} on the wire`);
    assert.ok(splitAvatarCode(wire).ax.length <= AVATAR_LOOK_EXT_MAX);
  }
});

test('missing tag = today\'s look: old codes and old tones are byte-identical to before', () => {
  assert.match(encodeAvatarLook(look({ skin: SKIN[3] })), /^[0-9]{9}$/);
  assert.equal(decodeAvatarLook('300000100', 'x').skin, SKIN[3]);
  assert.equal(skinToneIndex(look({ skin: 0x123456 })), 0, 'an unknown colour is the first tone');
  assert.equal(skinUndertone(look({ skin: 0x123456 })), 'warm');
});

test('older clients: the old `u` reading skips an extended-tone value and keeps the digit\'s top and nearest skin', () => {
  const oldDecode = (u) => (u < TOPS.length ? u : null); // what #1156's decoder does with the tag
  for (let i = 5; i < 10; i++) {
    const ax = splitAvatarCode(encodeAvatarLook(look({ skin: SKIN_TONES[i].c, top: TOPS[3] }))).ax;
    assert.equal(oldDecode(Number(/u(\d+)/.exec(ax)[1])), null, 'an old client ignores the tag');
  }
  // the digit alone (what such a client decodes) shows the nearest old tone
  const only = encodeAvatarLook(look({ skin: SKIN_TONES[9].c })).slice(0, 9);
  assert.equal(decodeAvatarLook(only, 'old').skin, SKIN[SKIN_TONES[9].near]);
});

test('a tone with a top beyond the digit (Olof\'s hoodie) keeps both', () => {
  const lk = look({ skin: SKIN_TONES[7].c, top: TOPS[10] });
  const d = decodeAvatarLook(encodeAvatarLook(lk), 'z');
  assert.equal(d.skin, SKIN_TONES[7].c); assert.equal(d.top, TOPS[10]);
  assert.equal(decodeAvatarLook(encodeAvatarLook(look({ top: TOPS[10] })), 'z').top, TOPS[10], '#1156 alone still works');
});

test('malformed tone values are ignored (a tone beyond the table)', () => {
  const d = decodeAvatarLook('100000100u99', 'x');
  assert.equal(d.skin, SKIN[1]);
});

test('seeded default looks keep the old palette', () => {
  for (let i = 0; i < 50; i++) assert.ok(SKIN.includes(avatarLook(`seed${i}`).skin));
});

test('the warm undertone is exactly the old fixed colours', () => {
  assert.deepEqual(U.warm.blush, SK.blush); assert.deepEqual(U.warm.sss, D.sss); assert.deepEqual(U.warm.rim, SK.rimTint);
});

test('blush, backlight and rim follow the undertone, visibly different between undertones', () => {
  const t = (k) => U[k], dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  for (const f of ['blush', 'sss', 'rim']) {
    for (const [a, b] of [['warm', 'neutral'], ['warm', 'olive'], ['neutral', 'olive']]) assert.ok(dist(t(a)[f].slice(0, 3), t(b)[f].slice(0, 3)) > 0.08, `${f} ${a}/${b}`);
  }
  assert.ok(U.olive.blush[0] < U.warm.blush[0] && U.olive.blush[2] < U.warm.blush[2] + 0.1, 'olive blush: less red, more yellow');
  assert.ok(U.neutral.blush[2] > U.warm.blush[2], 'neutral blush is pinker (more blue) than warm');
  const u = toneUniforms();
  assert.deepEqual(u.uSkBlush.value.toArray(), SK.blush, 'default = warm');
  for (const i of [5, 6, 7, 8, 9]) {
    applyToneLook(u, look({ skin: SKIN_TONES[i].c }));
    const want = skinUndertoneOf(look({ skin: SKIN_TONES[i].c }));
    assert.deepEqual(u.uSkBlush.value.toArray().map((v) => +v.toFixed(4)), want.blush.map((v) => +v.toFixed(4)));
    assert.deepEqual(u.uSkSss.value.toArray().map((v) => +v.toFixed(4)), want.sss.map((v) => +v.toFixed(4)));
    assert.deepEqual(u.uSkRim.value.toArray().map((v) => +v.toFixed(4)), want.rim.map((v) => +v.toFixed(4)));
  }
  applyToneLook(u, base); assert.deepEqual(u.uSkSss.value.toArray().map((v) => +v.toFixed(4)), D.sss.map((v) => +v.toFixed(4)));
  assert.ok(U.deep.sheen > 0 && !U.warm.sheen, 'only the deep undertone adds sheen');
  assert.match(toneDecl(), /uSkBlush.*uSkSss.*uSkRim/);
});

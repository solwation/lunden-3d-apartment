// #2168: pattern coding in the look code and the bind-pose patterns. node --test tools/avatarpatterntest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAvatarLook, decodeAvatarLook, AVATAR_PATTERN as P, patternOf } from '../src/config.js';
import { patternAt, altOf, patternDecl, patternShade, PATTERN, effectivePattern } from '../src/avatarpattern.js';
import { bindAt } from '../src/olof.js';

const base = { style: 0, sleeves: 1, gender: 0, facial: 0, build: 1, tall: 1 };
const roundtrip = (o) => { const code = encodeAvatarLook({ ...decodeAvatarLook('210000100c5e8o2w0l8j0n0b0r8t8y8', 'p'), ...base, ...o }); return { code, look: decodeAvatarLook(code.ax ? code.av + code.ax : code, 'p') }; };

test('pattern coding: every pattern round-trips through tag m beside the cut and outer layer; missing = plain', () => {
  for (const cut of [0, 1, 2]) for (const outer of [0, 1, 2]) for (let pattern = 0; pattern < P.names.length; pattern++) {
    const lk = { ...decodeAvatarLook('210000100c5e8o2w0l8j0n0b0r8t8y8', 'p'), ...base, cut, outer, outerMode: outer ? 1 : 0, pattern };
    const ext = encodeAvatarLook(lk).ext ?? encodeAvatarLook(lk);
    const back = decodeAvatarLook(typeof ext === 'string' ? ext : String(ext), 'p');
    assert.equal(patternOf(back), pattern, `${cut}/${outer}/${pattern}`); assert.equal(back.cut | 0, cut); assert.equal(back.outer | 0, outer);
  }
  assert.equal(patternOf({}), 0); assert.equal(patternOf({ pattern: 9 }), 0); assert.equal(patternOf({ pattern: 1.5 }), 0);
});

test('an invalid pattern value on the wire is skipped (the plain look); an old tag value (below pack) is unchanged', () => {
  const plain = decodeAvatarLook('210000100c5e8o2w0l8j0n0b0r8t8y8' + 'm4', 'p'); // hoodie + jacket, no pattern: as before
  assert.equal(plain.cut, 1); assert.equal(patternOf(plain), 0);
  const bad = decodeAvatarLook('210000100c5e8o2w0l8j0n0b0r8t8y8' + `m${P.pack * 9}`, 'p');
  assert.equal(patternOf(bad), 0);
  const ok = decodeAvatarLook('210000100c5e8o2w0l8j0n0b0r8t8y8' + `m${2 + P.pack * 2}`, 'p');
  assert.equal(ok.cut, 2); assert.equal(patternOf(ok), 2);
});

const S = bindAt('shoulderL');
const torsoPt = (y, ang, r = 0.15) => ({ x: Math.sin(ang) * r, y, z: Math.cos(ang) * r });
test('stripes are a function of bind height: periodic in y, constant round the body, same on both sleeves', () => {
  const T = P.stripe, y0 = 1.2, a = patternAt(1, torsoPt(y0, 0.3), 1), b = patternAt(1, torsoPt(y0, 2.1), 1);
  assert.ok(Math.abs(a.w - b.w) < 1e-9);
  assert.ok(Math.abs(patternAt(1, torsoPt(y0 + T.period, 0.3), 1).w - a.w) < 1e-9);
  const lo = [], hi = [];
  for (let i = 0; i < 40; i++) lo.push(patternAt(1, torsoPt(1 + i * T.period / 40, 0), 1).w);
  assert.ok(Math.max(...lo) > 0.95 && Math.min(...lo) < 0.05, 'full contrast at fp 0');
  const share = lo.filter((w) => w > 0.5).length / 40; assert.ok(Math.abs(share - T.duty) < 0.1, String(share));
  const sl = (sx) => patternAt(1, { x: sx * (S.x + 0.04), y: 1.3, z: 0 }, 0).w;
  assert.ok(Math.abs(sl(1) - sl(-1)) < 1e-9);
  for (let i = 0; i < 40; i++) hi.push(patternAt(1, torsoPt(1 + i * T.period / 40, 0), 1, 0.05).w);
  assert.ok(Math.max(...hi) - Math.min(...hi) < 0.1, 'dissolves into its mean over a large footprint');
});

test('checks: bands in both directions with whole columns round, darker where they cross', () => {
  const T = P.check, n = Math.floor(2 * Math.PI * P.radius.torso / T.period + 0.5);
  const at = (y, k) => patternAt(2, torsoPt(y, (k / n) * 2 * Math.PI), 1);
  const y0 = 16 * T.period, cross = at(y0, 0), rowOnly = at(y0, 0.5), colOnly = at(y0 + T.period * 0.5, 0), none = at(y0 + T.period * 0.5, 0.5);
  assert.ok(cross.k < 1 - 0.5 * T.cross && rowOnly.k === 1 && colOnly.k === 1 && none.w < 0.1);
  assert.ok(rowOnly.w > 0.9 * T.strength && colOnly.w > 0.9 * T.strength && cross.w > 0.9 * T.strength, 'a band and a crossing read as the second colour');
  // seamless round the body: the column pattern repeats after exactly one turn
  assert.ok(Math.abs(patternAt(2, torsoPt(1.0, 0.001), 1).w - patternAt(2, torsoPt(1.0, 0.001 + 2 * Math.PI), 1).w) < 1e-9);
});

test('pose stability: the pattern is a pure function of the bind position (no pose input) and deterministic', () => {
  for (const pat of [1, 2, 3, 4]) { const p = { x: 0.07, y: 1.21, z: 0.1 }; assert.deepEqual(patternAt(pat, p, 1, 0.003), patternAt(pat, { ...p }, 1, 0.003)); }
  assert.equal(patternAt.length <= 4, true);
  assert.ok(!patternDecl().includes('uClothBend') && !patternShade().includes('uClothBend') && !patternShade().includes('uClothArm'), 'no pose uniform feeds the pattern');
});

test('marl is a fine, zero-mean heather: periods under 1 cm in bind space, mean equals the base, averages out with distance', () => {
  for (const [h, v] of P.marl.freq) assert.ok(2 * Math.PI / h < 0.01 && 2 * Math.PI / v < 0.01, `${h} ${v}`);
  let sum = 0, lo = 0, hi = 0, N = 0, flip = 0, prev = 0;
  for (let i = 0; i < 40000; i++) { const p = { x: Math.sin(i * 0.37) * 0.14 + (i % 17) * 0.0001, y: 0.9 + (i % 997) * 0.00053, z: 0.12 + (i % 31) * 0.0003 }, k = patternAt(3, p, 1).k - 1; sum += k; N++; lo = Math.min(lo, k); hi = Math.max(hi, k); if (Math.sign(k) !== Math.sign(prev)) flip++; prev = k; }
  assert.ok(Math.abs(sum / N) < 0.03 * P.marl.contrast, `mean ${sum / N}`);
  assert.ok(hi > 0.8 * P.marl.contrast && lo < -0.8 * P.marl.contrast && hi <= P.marl.contrast + 1e-9 && flip > N * 0.1, 'flecks of both signs, bounded contrast');
  let far = 0; for (let i = 0; i < 2000; i++) far = Math.max(far, Math.abs(patternAt(3, { x: (i % 40) * 0.0037, y: 1 + i * 0.00071, z: 0.1 }, 1, 0.02).k - 1));
  assert.ok(far < 0.01, `far ${far}`); // a 2 cm pixel sees the plain base
  assert.equal(patternAt(3, torsoPt(1.2, 0), 1).w, 0);
});

test('two-tone colours the sleeves only; plain and the outer layer leave the colour alone', () => {
  assert.equal(patternAt(4, torsoPt(1.2, 0), 1).w, 0); assert.equal(patternAt(4, { x: S.x, y: 1.3, z: 0.04 }, 0).w, 1);
  assert.deepEqual(patternAt(0, torsoPt(1.2, 0), 1), { w: 0, k: 1 });
  assert.equal(effectivePattern({ pattern: 2, cut: 3 }), 0); assert.equal(effectivePattern({ pattern: 2, cut: 2 }), 2);
});

test('the second colour contrasts: darker on light tops, lighter on dark ones', () => {
  const lum = (c) => 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2];
  const light = [0.7, 0.68, 0.6], dark = [0.02, 0.03, 0.06];
  assert.ok(lum(altOf(light)) < 0.6 * lum(light) && lum(altOf(dark)) > 3 * lum(dark));
});

test('GLSL strings are present and empty when off', () => {
  assert.ok(patternDecl().includes('patternAt') && patternShade().includes('uClothPat.x'));
  PATTERN.on = false; assert.equal(patternDecl() + patternShade(), ''); PATTERN.on = true;
});

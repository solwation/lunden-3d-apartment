// #2050: the soft hairline (src/avatarhairline.js): the coverage profile across the line, the scalp shell hidden below the visible line
// in every hairstyle (a curtain's top stays on it), no flyaway rooted in the sparse band, no new triangles or attributes.
//   node --test tools/avatarhairlinetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_HAIRLINE as L, AVATAR_HAIR as HAIR } from '../src/config.js';
import { bindAt } from '../src/olof.js';
import { isFlyaway } from '../src/avatarflyaway.js';
import { hairlineAt, hairlineShell, hairlineCoverage, hairlineFill, hairAngles, hairlineCurtain } from '../src/avatarhairline.js';

test('#2050 coverage: nothing below the baby hairs, thinning monotonically to full at the band, baby hairs only at the front and nape', () => {
  for (const a of [0, 30, 60, 160]) {
    assert.equal(hairlineCoverage(-L.baby - 1e-4, a), 0, 'bare skin below the baby hairs');
    assert.equal(hairlineCoverage(L.band, a), 1, 'full hair above the band');
    let last = -1;
    for (let d = -L.baby; d <= L.band; d += L.band / 40) { const c = hairlineCoverage(d, a); assert(c >= last - 1e-9, `monotonic at ${d}`); last = c; }
    assert(hairlineCoverage(0, a) < 0.35 && hairlineCoverage(0.5 * L.band, a) > 0.5, 'a gradient over millimetres, not a step');
  }
  assert(hairlineFill(-0.5 * L.baby, 0) > 0 && hairlineFill(-0.5 * L.baby, 90) === 0, 'baby hairs at the forehead, none over the ear');
  assert(hairlineFill(-0.5 * L.baby, 170) > 0 && hairlineFill(-0.5 * L.baby, 170) < hairlineFill(-0.5 * L.baby, 0), 'fainter at the nape');
});

test('#2050 line shape: temple recessions and tapering sideburns', () => {
  assert(hairlineAt(28) > hairlineAt(14) && hairlineAt(28) > hairlineAt(40), 'the temples recede above the forehead line');
  assert(hairlineAt(67) < hairlineAt(63) - 4 && hairlineAt(67) < hairlineAt(72) - 3, 'the sideburn narrows to a point');
});

test('#2050 every hairstyle: the scalp shell starts below the visible line; flyaways root above the band (not on a curtain)', () => {
  const hb = bindAt('head');
  for (let style = 0; style < 5; style++) {
    const g = avatarModelGeometry({ ...avatarLook('2050-' + style), style, facial: 0 }), a = g.attributes;
    let below = 0;
    for (let i = 0; i < a.position.count; i++) {
      if (a.region.getX(i) !== 3) continue;
      const [az, el] = hairAngles([a.position.getX(i) - hb.x, a.position.getY(i) - hb.y, a.position.getZ(i) - hb.z]);
      if (isFlyaway(a, i, 7, 11)) {
        if (a.faceAnchor.getY(i) % 2 < 1e-6 && Math.abs(az) < hairlineCurtain(style) - 1) assert(el >= hairlineAt(az) + 1, `style ${style}: a flyaway rooted in the sparse band (${az.toFixed(1)}°, ${el.toFixed(1)}°)`);
        continue;
      }
      if (el < hairlineAt(az) - L.drop + 0.2 && Math.abs(az) < 60) below++;
    }
    assert(below > 10, `style ${style}: the shell reaches under the soft edge at the front (${below})`);
    assert.equal(Object.keys(a).length, 17, 'no new attribute');
    g.dispose();
  }
  for (const a of [0, 30, 50, 66, 68, 90, 150]) assert(hairlineShell(a) <= hairlineAt(a) - L.drop + 1e-9);
  // the shell's straight edge between columns (≤ 6° apart) stays under the visible line
  for (let a = 0; a <= 180; a += 0.5) {
    const a0 = Math.floor(a / 6) * 6, a1 = a0 + 6, t = (a - a0) / 6;
    assert(hairlineShell(a0) * (1 - t) + hairlineShell(a1) * t < hairlineAt(a) - 0.5 * L.drop, `edge above the line at ${a}`);
  }
  assert(HAIR.cols.includes(HAIR.long.from) && HAIR.cols.includes(72), 'the curtains still start on a column');
});

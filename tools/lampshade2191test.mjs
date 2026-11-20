// #2191: shaded lamps throw light up and down. node tools/lampshade2191test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { shadeGain, shadeRows } from '../src/lampshade.js';
import { LIGHTING } from '../src/config.js';

const S = LIGHTING.shades;
test('a bare lamp gives 1 everywhere', () => { for (const c of [-1, 0, 1]) assert.equal(shadeGain(c, undefined), 1); });
test('copper dome: strong straight down, weak up, dark sideways', () => {
  const down = shadeGain(1, S.copper), up = shadeGain(-1, S.copper), side = shadeGain(0, S.copper);
  assert.ok(down > 1.5 && up < down * 0.25 && side < 0.15 * down, `${down} ${up} ${side}`);
});
test('paper / Silvia: ceiling and floor lit, a dimmer band between', () => {
  for (const s of [S.paper, S.silvia]) {
    assert.ok(shadeGain(1, s) > 1 && shadeGain(-1, s) > 0.5 * shadeGain(1, s));
    assert.ok(shadeGain(0, s) < 0.45 * shadeGain(1, s));
  }
});
test('the profile is monotone and soft at the edge', () => {
  let prev = -1;
  for (let c = 0; c <= 1; c += 0.05) { const g = shadeGain(c, S.reading); assert.ok(g >= prev - 1e-9); prev = g; }
  const mid = shadeGain((S.reading.inner + S.reading.outer) / 2, S.reading);
  assert.ok(mid > shadeGain(0, S.reading) && mid < shadeGain(1, S.reading));
});
test('rows: bare = zeros (boost 0), shaded carries axis and lobes, default axis down', () => {
  assert.deepEqual(shadeRows({}), [0, 0, 0, 0, 0, 0, 0, 0]);
  const r = shadeRows({ shade: S.copper });
  assert.deepEqual(r.slice(0, 3), [0, -1, 0]); assert.equal(r[7], S.copper.boost);
  assert.equal(shadeRows({ shade: S.reading, axis: { x: 1, y: 0, z: 0 } })[0], 1);
});

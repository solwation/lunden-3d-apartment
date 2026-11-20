// #2199: coloured spill from screens and neon. node tools/screenspill2199test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { averageRgb, easeRgb, spillColour, clubGlowTerms } from '../src/screenspill.js';
import { PLAYROOM as R } from '../src/config.js';

test('averageRgb: mean of RGBA bytes, alpha ignored', () => {
  assert.deepEqual(averageRgb(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0])), [0.5, 0, 0.5]);
  assert.deepEqual(averageRgb([]), [0, 0, 0]);
});
test('easeRgb: moves towards the target, never past it, frame-rate independent', () => {
  const a = easeRgb([0, 0, 0], [1, 0.5, 0], 0.1, 0.22);
  assert.ok(a[0] > 0 && a[0] < 1 && a[1] > 0 && a[1] < 0.5 && a[2] === 0);
  const twoSteps = easeRgb(easeRgb([0, 0, 0], [1, 1, 1], 0.05), [1, 1, 1], 0.05);
  const oneStep = easeRgb([0, 0, 0], [1, 1, 1], 0.1);
  assert.ok(Math.abs(twoSteps[0] - oneStep[0]) < 1e-9);
  assert.deepEqual(easeRgb([0.3, 0.3, 0.3], [0.3, 0.3, 0.3], 1), [0.3, 0.3, 0.3]);
});
test('spillColour: black is nothing, hue is kept, brighter pictures spill more (the flicker carries on)', () => {
  assert.deepEqual(spillColour([0, 0, 0]), [0, 0, 0]);
  const red = spillColour([0.9, 0.2, 0.1]);
  assert.ok(red[0] > red[1] && red[1] > red[2]);
  const dim = spillColour([0.2, 0.05, 0.03]), bright = spillColour([0.9, 0.22, 0.13]);
  assert.ok(bright[0] > dim[0] && dim[0] > 0, `${dim} ${bright}`);
  const blue = spillColour([0.1, 0.1, 0.4]);
  assert.ok(blue[2] > 4 * blue[0]);
});
test('clubGlowTerms: a few static terms inside SPEL, each coloured, none beyond the room', () => {
  const t = clubGlowTerms();
  assert.ok(t.length >= 3 && t.length <= 8, `${t.length}`);
  for (const g of t) {
    assert.ok(g.x > 3 && g.x < R.w / 2 && g.z > -R.d / 2 && g.z < 1.4 && g.y > 1 && g.y < R.ceiling, JSON.stringify(g));
    assert.ok(Math.max(...g.rgb) > 0.3 && g.range > 1);
  }
  assert.ok(new Set(t.map((g) => g.rgb.map((v) => v.toFixed(2)).join())).size >= 3); // cyan, pink, purple, …
});

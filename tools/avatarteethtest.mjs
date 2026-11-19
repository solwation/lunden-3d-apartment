// #2150: teeth, cavity and tongue visibility from the mouth opening (src/avatarteeth.js), function level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { teethHeight, teethVisible, teethStrip, teethBand, jawSide, teethExtraTriangles } from '../src/avatarteeth.js';
import { lipOutline } from '../src/avatarsculpt.js';
import { AVATAR_FACE as FACE, AVATAR_MOUTH as MOUTH, AVATAR_TEETH as T } from '../src/config.js';

const front = (x, y) => 0.1 - x * x + y * 0.03;
const KINDS = ['cavity', 'upper', 'lower', 'tongue'];
test('#2150 every row is invisible with the mouth shut and grows with the opening', () => {
  for (const k of KINDS) {
    assert.equal(teethHeight(k, 0), 0); assert.equal(teethVisible(k, 0), false);
    let prev = 0;
    for (const o of [0.1, 0.3, 0.6, 1]) { const h = teethHeight(k, o); assert(h >= prev); prev = h; }
    assert(teethHeight(k, 1) > 0.001, `${k} shows at full opening`);
    assert.equal(teethHeight(k, 2), teethHeight(k, 1)); assert.equal(teethHeight(k, -1), 0);
  }
  assert.equal(teethVisible('upper', 0.05), false); // a mere crack shows no teeth
});
test('#2150 the lower row and tongue need a wider mouth than the upper teeth', () => {
  assert(teethHeight('upper', 0.5) > teethHeight('lower', 0.5));
  assert(teethHeight('upper', 0.5) > teethHeight('tongue', 0.5) * 0.4);
});
test('#2150 shut, every strip is flat (zero height) once the shader drop is applied', () => {
  for (const k of KINDS.filter((v) => v !== 'cavity')) {
    const s = teethStrip(k, front), cols = T[k].cols;
    for (let i = 0; i <= cols; i++) assert.equal(s.position[i * 3 + 1], s.position[(cols + 1 + i) * 3 + 1]);
  }
});
test('#2150 at any opening the strips stay between the lips and inside the corners', () => {
  for (const open of [0, 0.25, 0.6, 1]) for (const k of KINDS) {
    const s = teethStrip(k, front);
    for (let n = 0; n < s.weight.length; n++) {
      const x = s.position[n * 3], y = s.position[n * 3 + 1] - open * MOUTH.drop * s.weight[n], o = lipOutline(x);
      assert(Math.abs(x) <= FACE.mouth.halfWidth + 1e-9);
      if (k !== 'cavity') assert(Math.abs(x) <= T[k].reach * FACE.mouth.halfWidth + 1e-9);
      assert(s.weight[n] >= 0 && s.weight[n] <= 1);
      // never above the upper lip's seam edge, never below the dropped lower lip's seam edge
      assert(y <= o.seam + 0.0006 + 1e-9, 'under the upper lip');
      assert(y >= o.seam - 0.0006 - open * MOUTH.drop * jawSide(x) - 1e-9, 'above the dropped lower lip');
    }
  }
});
test('#2150 teeth strips are finite, wound like the old ribbon and coloured per vertex', () => {
  for (const k of KINDS) {
    const s = teethStrip(k, front), n = s.weight.length;
    assert.equal(s.position.length, n * 3); assert.equal(s.color.length, n * 3);
    assert(s.position.every(Number.isFinite) && s.color.every((c) => c >= 0 && c <= 1));
    assert(s.index.every((i) => i < n));
  }
  const cav = teethStrip('cavity', front), top = cav.color.length / 3 - 1; // bottom row first vertex, top row last vertex
  assert(cav.color[top * 3] < cav.color[0], 'the cavity darkens from the lower lip into the mouth');
  assert.equal(teethExtraTriangles(), 24, 'the extra triangles stay near the issue budget (~40)');
  assert.deepEqual(teethBand('cavity'), [0, 1]);
});

// #2142: gender in the face's base form (src/avatarfacegender.js). node --test tools/avatarfacegendertest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { genderFaceOffset as off, genderFaceGLSL, GENDER_PARTS } from '../src/avatarfacegender.js';
import { AVATAR_FACE_GENDER as G, AVATAR_FACE as FACE } from '../src/config.js';
import { lipOutline } from '../src/avatarsculpt.js';

const grid = [];
for (let x = -0.07; x <= 0.0701; x += 0.007) for (let y = -0.03; y <= 0.16; y += 0.01) for (const z of [-0.05, 0, 0.04, 0.08, 0.11]) grid.push([x, y, z]);
test('offsets are bounded (a few mm) for every gender weight, part and probe point', () => {
  for (const g of [0, 0.5, 1]) for (const part of GENDER_PARTS) for (const [x, y, z] of grid) {
    const d = off(x, y, z, g, part);
    assert(d.every(Number.isFinite));
    assert(Math.hypot(...d) < 0.0155, `${part} ${g} @${x},${y},${z}: ${d}`);
  }
});
test('symmetric: the mirrored point gets the mirrored offset', () => {
  for (const g of [0, 1]) for (const part of GENDER_PARTS) for (const [x, y, z] of grid) {
    const a = off(x, y, z, g, part), b = off(-x, y, z, g, part);
    assert(Math.abs(a[0] + b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12 && Math.abs(a[2] - b[2]) < 1e-12);
  }
});
test('zero inside the eye opening and on the lip seam; lips fade to nothing at their outer edge', () => {
  for (const g of [0, 1]) for (const s of [-1, 1]) for (const [dx, dy] of [[0, 0], [0.01, 0.005], [-0.012, -0.01]]) {
    const d = off(s * (G.keep.at[0] + dx), G.keep.at[1] + dy, 0.1, g, 'head');
    assert(Math.hypot(d[0], d[2]) < 4e-4, `eye ${d}`);
    assert(Math.abs(off(s * (G.keep.at[0] + dx), G.keep.at[1] + dy, 0.1, g, 'brow')[1] - G.browY[g]) < 1e-9); // brow hairs only move in y there
  }
  for (const g of [0, 1]) for (let x = -0.02; x <= 0.0201; x += 0.004) {
    const seam = lipOutline(x).seam, lip = off(x, seam, 0.11, g, 'lip'), head = off(x, seam, 0.11, g, 'head');
    assert.deepEqual(lip, head, 'the lip term is zero on the seam'); // lip == skin field there
    const edge = off(x, seam + 0.0105, 0.11, g, 'lip'), skin = off(x, seam + 0.0105, 0.11, g, 'head');
    assert.deepEqual(edge, skin, 'the lip term is gone at the outer edge');
  }
});
test('direction: a male brow ridge and jaw are stronger, female cheeks and lips fuller, brows higher', () => {
  assert(off(0, G.ridge.y, 0.11, 0, 'head')[2] > off(0, G.ridge.y, 0.11, 1, 'head')[2] + 0.003);
  assert(off(0.05, G.jaw.y, G.jaw.z[0], 0, 'head')[0] > off(0.05, G.jaw.y, G.jaw.z[0], 1, 'head')[0]);
  assert(off(0.01, G.chin.y, 0.08, 0, 'head')[0] > off(0.01, G.chin.y, 0.08, 1, 'head')[0]);
  assert(off(G.cheek.at[0], G.cheek.at[1], 0.1, 1, 'head')[2] > 0.0025);
  const seam = FACE.mouth.seamY, up = off(0, seam + 0.0045, 0.11, 1, 'lip'), dn = off(0, seam - 0.0045, 0.11, 1, 'lip');
  assert(up[2] - off(0, seam + 0.0045, 0.11, 1, 'head')[2] > 0.0005 && up[1] > 0 && dn[1] < 0, 'fuller lips open up/down from the seam');
  assert(off(0, 0.12, 0.1, 1, 'brow')[1] - off(0, 0.12, 0.1, 0, 'brow')[1] > 0.003, 'higher brows');
  assert(Math.abs(off(0, 0.12, 0.1, 1, 'head')[1] - off(0, 0.12, 0.1, 0, 'head')[1]) < 1e-9, 'skin does not move in y');
});
test('GLSL is generated from the same constants and carries the same terms', () => {
  const s = genderFaceGLSL();
  assert(s.includes('vec3 genderFaceDelta(vec3 q, float kind, float g)') && !/pow\(/.test(s));
  assert(s.includes(G.ridge.y.toFixed(5)) && s.includes(G.lip.band[3].toFixed(5)) && s.includes(FACE.mouth.seamY.toFixed(5)));
});

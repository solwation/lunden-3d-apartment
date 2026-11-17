// #2044: the sculpted face (src/avatarsculpt.js). node --test tools/avatarsculpttest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sculptShape, sculptNormal, lipOutline, lipDistance, sculptShader, sealLipEdge } from '../src/avatarsculpt.js';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook, AVATAR_FACE as FACE } from '../src/config.js';
import { bindAt } from '../src/olof.js';

test('#2044 the forms sit on the face front, mirrored, and the smile deepens the fold', () => {
  assert(sculptShape(0.035, 0.117) < -0.0015, 'the upper-lid sulcus is a hollow');
  assert(sculptShape(0.03, 0.125) > 0.0005, 'the brow ridge stands out');
  assert.equal(sculptShape(0.035, 0.117), sculptShape(-0.035, 0.117));
  for (const [x, y] of [[0, 0.2], [0.09, 0.0], [0, -0.03]]) {
    const n = sculptNormal(x, y);
    assert(Math.abs(sculptShape(x, y)) + Math.abs(n.form) + Math.abs(n.fine) < 1e-5, `nothing away from the face (${x}, ${y})`);
  }
  assert(sculptNormal(0.05, 0.088).form > 0.0015, 'the cheekbone');
  const fold = (s) => sculptNormal(0.027, 0.058, s).fine;
  assert(fold(0) > 0 && fold(1) > fold(0) * 1.8, 'the cheek over the nasolabial fold, deeper in a smile');
  assert(sculptNormal(0.0235, 0.0445).fine < -0.0003, 'the mouth corners sink in');
});

test('#2044 the lip outline mirrors addFace and the lip edge shares the skin band normal', () => {
  const g = avatarModelGeometry({ ...avatarLook('2044'), style: 0, facial: 0 }), a = g.attributes, hb = bindAt('head');
  let lips = 0, worst = 0;
  for (let i = 0; i < a.position.count; i++) if (a.region.getX(i) === 6) {
    const y = a.position.getY(i) - hb.y, z = a.position.getZ(i) - hb.z, xw = a.position.getX(i) - hb.x;
    const W = FACE.warp, k = W.width * (1 - W.narrow * (1 - smooth(0, W.y[0], y)) * smooth(W.z[0], W.z[1], z)); // faceWarp's squeeze
    worst = Math.max(worst, lipDistance(xw / k, y)); lips++;
  }
  assert(lips > 100 && worst < 0.0003, `lip vertices lie inside the mirrored outline (worst ${worst})`);
  const o = lipOutline(0.007);
  assert(o.upper > FACE.mouth.upper * 0.95 && o.edge > 0.9, "the cupid's bow peak");
  // sealLipEdge: the lip's outer row takes the band's inner-row normals
  const grid = (rows, cols, n) => ({ attributes: { normal: { a: Array.from({ length: (rows + 1) * (cols + 1) }, () => [...n]),
    setXYZ(i, x, y, z) { this.a[i] = [x, y, z]; }, getX(i) { return this.a[i][0]; }, getY(i) { return this.a[i][1]; }, getZ(i) { return this.a[i][2]; } } } });
  const lip = grid(3, 4, [0, 1, 0]), band = grid(1, 4, [0, 0, 1]);
  sealLipEdge(lip, band, 4);
  assert.deepEqual(lip.attributes.normal.a[3 * 5 + 2], [0, 0, 1]); assert.deepEqual(lip.attributes.normal.a[2 * 5 + 2], [0, 1, 0]);
  g.dispose();
});

test('#2044 the shader splice keeps every include and adds the bump, the lip edge and the cavity', () => {
  const fs = ['#include <common>', '#include <color_fragment>', '#include <normal_fragment_maps>', '#include <lights_fragment_end>'].join('\n');
  const out = sculptShader(fs, { head: bindAt('head'), part: { head: 1, cowlHide: 11 } });
  for (const inc of fs.split('\n')) assert(out.includes(inc));
  assert(/uniform vec3 uExpr/.test(out) && /scHeight/.test(out) && /indirectDiffuse \*= 1\.0 - scCav/.test(out) && /soft lip edge/.test(out));
  assert(!/NaN|undefined/.test(out));
});
function smooth(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

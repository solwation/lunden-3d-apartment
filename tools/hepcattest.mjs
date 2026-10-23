// node --test tools/hepcattest.mjs — #1533: HepCat Store rebuilt from the user's photos. The #261 footprints are kept; the
// wing roof is hipped at the north end and a gable at the south (nr 21), the white middle's cross gable stands higher, the
// walkable roof (roofY) matches the drawn roof, the chimney rises over the ridge, wall faces point outwards and the parts fit
// the existing batches (walls with uv for the one atlas, roof, dark boxes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE } from '../src/config.js';
import { buildHepcat } from '../src/hepcat.js';

const b = SITE.blocks.find((q) => q.name === 'HepCat Store'), w = SITE.blocks.find((q) => q.name === 'HepCat Store, the white middle');
const h = buildHepcat(), s = h.spec;
const tris = (g, f) => { const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) f([0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]), i); };

test('the #261 footprints are unchanged', () => {
  assert.deepEqual([b.x0, b.x1, b.z0, b.z1], [28.2, 36.4, -10.8, 10.0]);
  assert.deepEqual([w.x0, w.x1, w.z0, w.z1], [27.9, 36.4, -2.6, 1.8]);
});

test('hipped at the north end, a gable at the south end, the cross gable higher than the wing ridge', () => {
  const { cx, R, E, WR } = s, M = SITE.hepcat.model;
  assert.ok(Math.abs(h.roofY(cx, b.z1) - R) < 1e-6, 'the ridge runs out to the nr 21 gable');
  assert.ok(Math.abs(h.roofY(cx, b.z0) - E) < 1e-6, 'the north end falls to the eave (hip)');
  assert.ok(Math.abs(h.roofY(cx, s.hipZ) - R) < 1e-6 && h.roofY(cx, (b.z0 + s.hipZ) / 2) < R - 1, 'the hip meets the ridge');
  assert.ok(WR > R + 0.5, `the white middle's ridge ${WR.toFixed(2)} over the wing ridge ${R.toFixed(2)}`);
  assert.ok(Math.abs(h.roofY(w.x0, s.wcz) - WR) < 1e-6, 'the cross gable reaches the west face');
  assert.ok(R - b.base > 6 && R - b.base < 8.5 && WR - b.base < 10, 'a storey-and-attic house (*guess*)');
  const [chx, chz, , chh] = M.chimney;
  assert.ok(Math.abs(h.roofY(chx, chz) - (R + chh)) < 1e-6, 'the chimney top over the ridge');
  const d = h.dark[0].attributes.position; let lo = Infinity; for (let i = 0; i < d.count; i++) lo = Math.min(lo, d.getY(i));
  assert.ok(lo < h.roofY(chx + 0.3, chz) && lo < h.roofY(chx - 0.3, chz), 'the chimney is rooted in the roof');
});

test('the drawn roof never rises over roofY and mostly lies on it', () => {
  let n = 0, on = 0;
  tris(h.roof, (t) => {
    const c = [0, 1, 2].map((k) => (t[0][k] + t[1][k] + t[2][k]) / 3), y = h.roofY(c[0], c[2]);
    n++; assert.ok(c[1] <= y + 0.05, `roof triangle at ${c.map((v) => v.toFixed(2))} over roofY ${y}`);
    if (Math.abs(c[1] - y) < 0.06) on++;
  });
  assert.ok(on / n > 0.6, `most roof triangles lie on roofY (${on}/${n})`);
});

test('walls face outwards, stay by the footprint and carry atlas uvs; the gable triangle is a wall, not roof', () => {
  const g = h.walls, nrm = g.attributes.normal, uv = g.attributes.uv;
  assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position', 'uv']);
  assert.deepEqual(Object.keys(h.roof.attributes).sort(), ['normal', 'position', 'uv']);
  for (let i = 0; i < uv.count; i++) assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1, 'uv inside the atlas');
  let gableTop = -Infinity;
  tris(g, (t, i) => {
    const c = [0, 1, 2].map((k) => (t[0][k] + t[1][k] + t[2][k]) / 3), nx = nrm.getX(i), nz = nrm.getZ(i);
    assert.ok(t.flat().every(Number.isFinite));
    assert.ok(c[0] > b.x0 - 1 && c[0] < b.x1 + 1 && c[2] > b.z0 - 1 && c[2] < b.z1 + 1, 'near the footprint');
    const out = Math.abs(nx) > 0.5 ? (c[0] - s.cx) * nx : (c[2] - (Math.abs(c[0] - s.cx) < 4.3 && Math.abs(c[2] - s.wcz) < 2.3 ? s.wcz : (b.z0 + b.z1) / 2)) * nz;
    assert.ok(out > 0, `wall triangle at ${c.map((v) => v.toFixed(2))} faces outwards`);
    if (nz > 0.9 && Math.abs(c[2] - b.z1) < 0.01) gableTop = Math.max(gableTop, ...t.map((p) => p[1]));
  });
  assert.ok(Math.abs(gableTop - s.R) < 1e-6, 'the nr 21 brick gable reaches the ridge');
});

test('a modest budget: three geometries for the existing batches', () => {
  const n = h.walls.attributes.position.count / 3 + h.roof.attributes.position.count / 3 + h.dark.reduce((a, g) => a + g.attributes.position.count / 3, 0);
  assert.ok(n < 2500, `${n} triangles`);
  assert.ok(h.lights.length >= 14 && h.lights.every((l) => Number.isFinite(l.x + l.y + l.z)), `${h.lights.length} lit windows`);
});

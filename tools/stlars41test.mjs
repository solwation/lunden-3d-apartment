// node --test tools/stlars41test.mjs — #1529: Sankt Lars väg 41 rebuilt from the user's photos. The OSM outline is kept,
// 3 storeys over the plinth (the SE wing 2), towers above the eaves, hipped roofs whose drawn height matches roofY, chimneys
// rooted in the roof, and one geometry per southbackdrop batch (no extra draw calls).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE } from '../src/config.js';
import { buildStLars41 } from '../src/stlars41.js';

const b = SITE.south.buildings.find(q => q.template === 'stlars41');
const base = 1.83, bottom = 1.2, parts = { facade: [], roof: [], glass: [] };
const r = buildStLars41(b, b.polygon.slice(0, -1), base, bottom, parts), I = r.stlars41;

test('the OSM outline (way 145221569) is unchanged', () => {
  assert.equal(b.source, '145221569');
  assert.deepEqual(b.polygon, [[-58.26, 284.51], [-35.42, 267.93], [-21.1, 287.58], [-27.44, 292.18], [-23.83, 297.14], [-34.34, 304.75], [-37.93, 299.81], [-43.95, 304.18], [-58.26, 284.51]]);
  assert.ok(Math.abs(I.L - 28.22) < 0.05 && Math.abs(I.D - 24.31) < 0.05 && Math.abs(I.w1 - I.w0 - 12.98) < 0.05 && Math.abs(I.Dw - I.D - 6.13) < 0.05);
});

test('3 storeys over the plinth, the wing 2 with its own lower eave, the towers higher than the eave', () => {
  assert.equal(b.levels, 3);
  assert.ok(Math.abs(I.eave - (I.plinthTop + 3 * I.storey + b.model.frieze)) < 1e-9);
  assert.ok(I.wingEave < I.plinthTop + 2 * I.storey + 0.01 && I.wingEave > I.plinthTop + 2 * I.storey - 0.5, 'the wing eave at its second floor line');
  assert.ok(I.towerEave > I.ridge - b.rise + 1, 'the towers stand clear of the eaves');
  assert.ok(I.eave - base > 10 && I.eave - base < 13, 'a 3-storey villa height (*guess*)');
});

test('the hipped roofs: roofY peaks at the ridge, falls to the eave and is never under a drawn roof triangle', () => {
  const at = (u, v) => I.roofAt(u, v);
  assert.ok(Math.abs(at(I.L / 2, I.D / 2) - I.ridge) < 1e-6, 'main ridge');
  assert.ok(Math.abs(at(-b.model.overhang + 1e-6, 3) - I.eave) < 1e-3, 'main eave at the overhang edge');
  assert.ok(at((I.w0 + I.w1) / 2, I.Dw) < I.eave && at((I.w0 + I.w1) / 2, I.Dw) > I.wingEave, 'the wing keeps its own low roof');
  assert.ok(at(0, b.model.towerSW) > I.towerEave && at(b.model.towerSE, I.D) > I.towerEave, 'both tower caps');
  const pos = parts.roof[0].attributes.position;
  let same = 0, n = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const walk = r.roofY(x, z); n++;
    assert.ok(y <= walk + 1e-3, `roof triangle ${i / 3} not above the walkable roof`);
    if (Math.abs(y - walk) < 1e-3) same++;
  }
  assert.ok(same / n > 0.7, `most drawn roof triangles lie on roofY (${same}/${n})`);
  const n0 = parts.roof[0].attributes.normal; for (let i = 0; i < n0.count; i++) assert.ok(n0.getY(i) > 0.9, 'roof normals up');
});

test('chimneys stand in the roof and rise above the ridge', () => {
  for (const [u, v] of I.chimneys) {
    for (const [a, d] of [[-0.38, -0.5], [0.38, -0.5], [0.38, 0.5], [-0.38, 0.5]]) assert.ok(I.mainRoof(u + a, v + d) > I.eave, 'on the main roof');
  }
  const p = parts.facade[0].attributes.position; let top = -Infinity; for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
  assert.ok(Math.abs(top - (I.ridge + 0.9)) < 1e-4, 'the chimney tops are the highest facade points');
});

test('one geometry per southbackdrop batch, mergeable attributes, finite and near the outline', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])), { facade: 1, roof: 1, glass: 1 });
  assert.deepEqual(Object.keys(parts.facade[0].attributes).sort(), ['color', 'normal', 'position']);
  for (const k of ['roof', 'glass']) assert.deepEqual(Object.keys(parts[k][0].attributes).sort(), ['normal', 'position']);
  for (const g of Object.values(parts).flat()) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [u, v] = I.local(p.getX(i), p.getZ(i));
      assert.ok([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite));
      assert.ok(u > -1 && u < I.L + 1 && v > -1 && v < I.Dw + 1, 'within a metre of the outline');
      assert.ok(p.getY(i) >= bottom - 1e-6);
    }
  }
  const tris = Object.values(parts).reduce((s, [g]) => s + g.attributes.position.count / 3, 0);
  assert.ok(tris < 4000, `a modest backdrop budget (${tris} triangles)`);
});

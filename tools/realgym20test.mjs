// node --test tools/realgym20test.mjs — #1532: Realgymnasiet, Sankt Lars väg 20 (the long brick building south of HepCat),
// rebuilt from the user's photos. The OSM outline is kept; a gable house, a lower range and a taller hall; roofs whose drawn
// height matches roofY; windows that follow the rising ground; one geometry per east-backdrop batch (no extra draw calls).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE } from '../src/config.js';
import { buildRealgym20 } from '../src/realgym20.js';

const b = SITE.east.buildings.find(q => q.template === 'realgym20');
const ground = (x, z) => -3 + Math.max(0, 40 - z) * 0.08; // flat at the south front, rising towards HepCat like the terrain there
const bottom = -3.15, parts = { facade: [], roof: [], glass: [] };
const r = buildRealgym20(b, b.polygon.slice(0, -1), -1.1, bottom, parts, ground), I = r.realgym20;

test('the OSM outline (way 130681301) is unchanged', () => {
  assert.equal(b.source, '130681301');
  assert.deepEqual(b.polygon, [[72.93, 40.79], [46.47, 40.46], [46.68, 19.41], [28.4, 19.19], [28.0, 58.28], [72.74, 58.83], [72.93, 40.79]]);
  assert.ok(Math.abs(I.AW - 18.25) < 0.1 && Math.abs(I.AE - 44.74) < 0.1 && Math.abs(I.BH - 18.05) < 0.1 && Math.abs(I.BN - 39.1) < 0.1);
});

test('three volumes: the gable house and the range share an eave, the range roof is lower, the hall stands above both', () => {
  const base = ground(28, 58.3);
  assert.ok(Math.abs(I.EG - (base + b.model.gable.eave)) < 1e-9, 'gable house eave over the south front');
  assert.equal(I.ER, I.EG);
  assert.ok(I.ridgeR < I.ridgeG - 1, 'the range roof stays below the gable house ridge');
  assert.ok(I.EH > I.EG + 2 && I.ridgeH > I.ridgeG, 'the hall is taller');
  assert.ok(I.towerTop > I.EG + 1.5 && I.towerTop < I.ridgeG, 'the stair tower rises over the eave, under the ridge');
  assert.equal(r.eave, I.EH);
});

test('the roofs: roofY peaks at each ridge, falls to the eaves, the hall hips to the east, never under a drawn roof triangle', () => {
  const at = I.roofAt;
  assert.ok(Math.abs(at(I.AW / 2, I.GL / 2) - I.ridgeG) < 1e-6, 'gable house ridge');
  assert.ok(Math.abs(at(I.AW / 2, 30) - I.ridgeR) < 1e-6, 'range ridge');
  assert.ok(Math.abs(at(30, I.BH / 2) - I.ridgeH) < 1e-6, 'hall ridge');
  assert.ok(Math.abs(at(0, 5) - I.EG) < 1e-6 && Math.abs(at(30, 0) - I.EH) < 1e-6, 'eaves');
  assert.ok(Math.abs(at(I.AE, I.BH / 2) - I.EH) < 1e-6, 'the hipped east end comes down to the eave');
  const check = (g, name) => {
    const pos = g.attributes.position; let same = 0, n = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const walk = r.roofY(x, z);
      assert.ok(y <= walk + 1e-3, `${name} triangle ${i / 3} not above the walkable roof`);
      if (g.attributes.normal.getY(i) < 0.5) continue; // block sides (chimney, vents) stand under their own tops
      n++; if (Math.abs(y - walk) < 1e-3) same++;
    }
    return [same, n];
  };
  const [s1, n1] = check(parts.roof[0], 'roof');
  assert.ok(s1 / n1 > 0.8, `the drawn roof surfaces lie on roofY (the tower cap runs on under the main roof) (${s1}/${n1})`);
  for (const g of [parts.roof[0]]) { const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) assert.ok(nr.getY(i) > -1e-6, 'no roof face turned down'); }
});

test('windows: four on the gable front plus one in the peak, tall hall windows, a round one in the hall gable, range windows over the ground', () => {
  const by = e => r.windows.filter(w => w.edge === e);
  assert.equal(by('gable-south').length, 4);
  assert.equal(by('gable-peak').length, 1);
  assert.ok(by('gable-peak')[0].y > I.EG, 'the peak window sits in the gable');
  assert.equal(by('hall-round').length, 1);
  assert.ok(by('hall-south').length >= 5 && by('hall-south').every(w => w.height > 5), 'two-storey hall windows');
  const range = [...by('range-west'), ...by('range-east')];
  assert.ok(by('range-west').length >= 10, `a long row along the road (${by('range-west').length})`);
  for (const w of range) {
    assert.ok(w.y + .09 - w.height / 2 >= ground(w.x, w.z) + b.model.minSill - .01, 'sill over the local ground');
    assert.ok(w.y + .09 + w.height / 2 <= I.ER - 0.3, 'head under the eave');
  }
});

test('one geometry per east-backdrop batch, mergeable attributes, finite and near the outline', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])), { facade: 1, roof: 1, glass: 1 });
  for (const k of ['facade', 'glass']) assert.deepEqual(Object.keys(parts[k][0].attributes).sort(), ['color', 'normal', 'position']);
  assert.deepEqual(Object.keys(parts.roof[0].attributes).sort(), ['normal', 'position']);
  for (const g of Object.values(parts).flat()) {
    const p = g.attributes.position;
    for (const k of Object.keys(g.attributes)) assert.equal(g.attributes[k].count, p.count, `${k} per vertex`);
    for (let i = 0; i < p.count; i++) {
      const [u, v] = I.local(p.getX(i), p.getZ(i));
      assert.ok([p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite));
      assert.ok(u > -1 && u < I.AE + 1 && v > -1 && v < I.BN + 1, 'within a metre of the outline');
      assert.ok(u < I.AW + 1 || v < I.BH + 1, 'nothing in the open yard north of the hall');
      assert.ok(p.getY(i) >= bottom - 1e-6);
    }
  }
  const tris = Object.values(parts).reduce((s, [g]) => s + g.attributes.position.count / 3, 0);
  assert.ok(tris < 3000, `a modest backdrop budget (${tris} triangles)`);
});

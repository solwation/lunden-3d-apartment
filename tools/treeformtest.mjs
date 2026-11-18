// #2131: node --test tools/treeformtest.mjs  (species-specific tree forms, src/treeform.js): deterministic species and forms,
// species variety and per-tree variation, the per-tree budget (lobes, trunk triangles desktop / phone), the far-LOD contract
// (the far trunk keeps its 14 triangles on phones, 32 with three main limbs on desktop, and the lobes stay plain instances of the shared lobe geometry) and the world-space
// skeleton helper for the squirrels' climbing (#2132). Function-level checks only; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';

const ctx = (canvas) => new Proxy({ canvas }, { get: (t, k) => k in t ? t[k] : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
  : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => { const c = { width: 1, height: 1 }; c.getContext = () => ctx(c); return c; } };

const { TREE_FORM: TF } = await import('../src/config.js');
const F = await import('../src/treeform.js');
const { trunkGeometry } = await import('../src/foliage.js');

const grid = (kind, n = 400) => Array.from({ length: n }, (_, i) => ({ x: -200 + (i % 20) * 17.3, z: 40 + Math.floor(i / 20) * 13.1, y: -2, s: 1.4, kind }));
const plain = (f) => JSON.stringify({ ...f, trunk: { pos: f.trunk.pos.toArray(), quat: f.trunk.quat.toArray(), scale: f.trunk.scale.toArray() },
  lobes: f.lobes.map((l) => [l.pos.toArray(), l.rot.toArray(), l.scale.toArray()]) });

test('species and forms are deterministic and come from the position alone', () => {
  for (const kind of ['tree', 'big', 'birch', 'young']) for (const t of grid(kind, 40)) {
    assert.equal(F.treeSpecies(kind, t.x, t.z), F.treeSpecies(kind, t.x, t.z));
    assert.equal(plain(F.treeForm(t)), plain(F.treeForm({ ...t })));
    assert.equal(plain(F.treeForm(t, true)), plain(F.treeForm({ ...t }, true)));
  }
  assert.deepEqual(F.trunkLayout('bark'), F.trunkLayout('bark'));
});

test('the species mix: every site kind draws its species, ordinary and big trees a mix close to TREE_FORM.mix', () => {
  for (const kind of ['tree', 'big']) {
    const count = {}; for (const t of grid(kind)) { const s = F.treeSpecies(kind, t.x, t.z); count[s] = (count[s] ?? 0) + 1; }
    for (const [name, share] of Object.entries(TF.mix[kind])) assert.ok(Math.abs(count[name] / 400 - share) < 0.09, `${kind} ${name}: ${count[name]}`);
  }
  assert.ok(grid('birch', 30).every((t) => F.treeSpecies('birch', t.x, t.z) === 'birch'));
  assert.ok(grid('young', 30).every((t) => F.treeSpecies('young', t.x, t.z) === 'youngMaple'));
});

test('species shapes differ: birches narrow and tall, oaks lean more and are less symmetric, limes domed', () => {
  const by = {}; for (const t of grid('tree')) { const f = F.treeForm(t); (by[f.species] ??= []).push(f); }
  for (const t of grid('birch', 100)) (by.birch ??= []).push(F.treeForm(t));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const aspect = (f) => { const ys = f.lobes.flatMap((l) => [l.pos.y + l.scale.y, l.pos.y - l.scale.y]); return (Math.max(...ys) - Math.min(...ys)) / (2 * f.crown.r); };
  const lean = (f) => new T.Vector3(0, 1, 0).applyQuaternion(f.trunk.quat).angleTo(new T.Vector3(0, 1, 0));
  const skew = (f) => { const c = f.lobes.reduce((s, l) => s.add(l.pos.clone().multiplyScalar(l.scale.x ** 3)), new T.Vector3()).multiplyScalar(1 / f.lobes.reduce((s, l) => s + l.scale.x ** 3, 0)); return Math.hypot(c.x - f.crown.x, c.z - f.crown.z) / f.crown.r; };
  assert.ok(mean(by.birch.map(aspect)) > mean(by.maple.map(aspect)) * 1.25, 'birch crowns are narrower for their height');
  assert.ok(mean(by.lime.map(aspect)) > mean(by.maple.map(aspect)), 'lime crowns are taller domes than the broad maples');
  assert.ok(mean(by.oak.map(lean)) > mean(by.maple.map(lean)) * 1.8 && mean(by.oak.map(skew)) > mean(by.maple.map(skew)), 'oaks lean and are lopsided');
  // per-tree variation: no two trees of a species share height or lean
  const hs = by.maple.map((f) => f.trunk.scale.y.toFixed(4)); assert.ok(new Set(hs).size > hs.length * 0.95);
  for (const fs of Object.values(by)) for (const f of fs) assert.ok(lean(f) <= TF.species[f.species].lean + 1e-9);
});

test('budget per tree: lobes and trunk triangles, desktop and phone; the far trunk stays the 14-triangle LOD', () => {
  for (const kind of ['tree', 'big', 'birch', 'young']) for (const t of grid(kind, 100)) {
    const d = F.treeForm(t), p = F.treeForm(t, true), S = TF.species[d.species];
    assert.ok(d.lobes.length >= 1 && d.lobes.length <= TF.budget.lobes, `${kind} ${d.species} ${d.lobes.length}`);
    assert.ok(p.lobes.length <= S.phone[kind === 'big' ? 1 : 0] && p.lobes.length <= d.lobes.length);
    assert.ok(d.lobes.every((l) => l.scale.x > 0 && l.scale.y > 0 && l.scale.z > 0));
  }
  for (const bark of ['bark', 'birch']) {
    assert.ok(F.trunkTriangles(bark) <= TF.budget.trunk[0], `${bark} ${F.trunkTriangles(bark)}`);
    assert.ok(F.trunkTriangles(bark, true) <= TF.budget.trunk[1], `${bark} phone ${F.trunkTriangles(bark, true)}`);
    // more branch orders than before (#679's trunk had the stem, a leader and three limbs, two forked: 46 triangles)
    assert.ok(new Set(F.trunkLayout(bark).map((l) => l.order)).size === 4 && F.trunkLayout(bark).filter((l) => l.order).length > 20);
    assert.equal(new Set(F.trunkLayout(bark, true).map((l) => l.order)).size, 3);
    assert.equal(trunkGeometry(false, bark).attributes.position.count / 3, F.trunkTriangles(bark));
  }
  assert.equal(F.trunkTriangles('bark', false, true), TF.budget.farTrunk[0]);
  assert.equal(F.trunkTriangles('bark', true, true), TF.budget.farTrunk[1], 'phones keep the #1958 far trunk');
  assert.equal(trunkGeometry(true).attributes.position.count / 3, TF.budget.farTrunk[0]);
  assert.ok(F.farTrunkLayout().every((l) => F.trunkLayout('bark').some((n) => n.a.join() === l.a.join() && n.b.join() === l.b.join())), 'far limbs follow the near ones (no jump at the hand-over)');
  assert.equal(trunkGeometry(true), trunkGeometry(true, 'birch'), 'one far trunk for both bark kinds (#1958)');
  // birches droop: their finest twigs end below where they start; bark trees reach up
  const dy = (bark) => F.trunkLayout(bark).filter((l) => l.order === 3).map((l) => l.b[1] - l.a[1]);
  assert.ok(dy('birch').every((v) => v < 0) && dy('bark').every((v) => v > 0));
});

test('lobes stay round the trunk: the crown sits over the (leaning) stem top, inside the envelope radius', () => {
  for (const kind of ['tree', 'big', 'birch', 'young']) for (const t of grid(kind, 60)) {
    const f = F.treeForm(t), top = new T.Vector3(0, 1, 0).applyMatrix4(new T.Matrix4().compose(f.trunk.pos, f.trunk.quat, f.trunk.scale));
    const K = TF.kinds[kind];
    assert.ok(f.crown.y > top.y, 'crown above the stem top');
    assert.ok(f.crown.r < K.R * t.s * 1.45 * (K.lobe ?? 1) && f.crown.r > K.R * t.s * 0.6, `${kind} r ${f.crown.r}`);
    assert.equal(f.crown.x, t.x); assert.equal(f.crown.z, t.z); // aoTrees x/z = the foot (squirrels/cats match crowns by it)
  }
});

test('skeleton helper: world-space trunk axis and main branches from the trunk matrix', () => {
  const t = { x: 12.5, y: -1, z: 140.2, s: 1.6, kind: 'tree' }, f = F.treeForm(t), M = new T.Matrix4().compose(f.trunk.pos, f.trunk.quat, f.trunk.scale);
  const sk = F.treeSkeleton(M.toArray(), f.bark);
  assert.ok(sk.axis.from.distanceTo(new T.Vector3(t.x, t.y, t.z)) < 1e-6, 'axis starts at the foot');
  assert.ok(Math.abs(sk.axis.to.distanceTo(sk.axis.from) - f.trunk.scale.y) < 1e-6, 'axis as long as the stem');
  assert.equal(sk.branches.length, TF.branch.bark.main);
  const axis = sk.axis.to.clone().sub(sk.axis.from).normalize();
  for (const b of sk.branches) {
    const along = b.from.clone().sub(sk.axis.from).dot(axis), off = b.from.clone().sub(sk.axis.from).addScaledVector(axis, -along).length();
    assert.ok(off < 1e-6 && along > 0 && along <= f.trunk.scale.y + 1e-6, 'a main branch leaves the stem');
    assert.ok(b.to.y > b.from.y && b.r0 > b.r1 && b.r0 > 0, 'it climbs and tapers');
    assert.ok(Math.hypot(b.to.x - t.x, b.to.z - t.z) < f.crown.r, 'it ends inside the crown');
  }
  assert.ok(F.treeSkeleton(M, f.bark, { orders: 3 }).branches.length > sk.branches.length);
  assert.ok(sk.leader.to.y > sk.axis.to.y);
});

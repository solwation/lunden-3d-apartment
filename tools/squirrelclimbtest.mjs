// #2132: node --test tools/squirrelclimbtest.mjs  (the squirrels climbing the trees' real skeletons: src/squirrelclimb.js and the brain's
// climb / limb / hop states in src/squirrelbrain.js, on treeform.js forms and skeletons, #2131). Function-level checks, no browser: the climb
// path lies on the trunk's / limb's bark and spirals, jumps only between branch points within SQUIRREL_CLIMB.hop, the descent is head first,
// the brains are deterministic, and the new `limb` state goes over the wire as an old one.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';

const ctx = (canvas) => new Proxy({ canvas }, { get: (t, k) => k in t ? t[k] : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
  : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document ??= { createElement: () => { const c = { width: 1, height: 1 }; c.getContext = () => ctx(c); return c; } };

const { SQUIRRELS: C, SQUIRREL_CLIMB: K, TREE_FORM } = await import('../src/config.js');
const { treeForm, treeSkeleton, trunkLayout } = await import('../src/treeform.js');
const { trunkGeometry } = await import('../src/foliage.js');
const CL = await import('../src/squirrelclimb.js');
const { SquirrelBrain, NutField, linkTrees } = await import('../src/squirrelbrain.js');
const { encodeAnimal, STATES } = await import('../src/squirrelsync.js');

const rng = (seed) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
/** A tree as squirrels.js builds it: the form's trunk instance -> skeleton (+ the drawn shape) -> climbing frame. `tris`: the drawn trunk
 * geometry's triangles in world space (foliage.js trunkGeometry under the instance matrix), to measure the bark against. */
const tree = (x, z, kind = 'tree', s = 1.2) => {
  const f = treeForm({ x, z, y: 0, s, kind }), m = new T.Matrix4().compose(f.trunk.pos, f.trunk.quat, f.trunk.scale), a = m.toArray();
  const cf = CL.climbFrame(treeSkeleton(a, f.bark, { orders: 2 }), { m: a, aspect: TREE_FORM.branch[f.bark].aspect, layout: trunkLayout(f.bark) });
  const pos = trunkGeometry(false, f.bark).attributes.position, tris = [];
  for (let i = 0; i < pos.count; i += 3) tris.push(new T.Triangle(...[0, 1, 2].map((k) => new T.Vector3().fromBufferAttribute(pos, i + k).applyMatrix4(m))));
  Object.defineProperty(cf, 'tris', { value: tris }); // (not enumerable: the frames stay plain data)
  return { x, z, y: 0, cy: f.crown.y, r: f.crown.r, cf };
};
const SPOTS = [[0, 0, 'tree'], [4.6, 1.2, 'tree'], [7.9, -1.6, 'big', 1.1], [3.0, 5.6, 'birch'], [-4.3, 3.2, 'tree'], [13.8, 4.4, 'young'], [-9.5, -4, 'tree']];
const forest = () => linkTrees(SPOTS.map(([x, z, k, s]) => tree(x, z, k, s)));
const ground = () => 0;

/** How far `p` is off the drawn bark: 0 = its body centre exactly `cling` m from the nearest surface of the trunk geometry the visitor sees. */
const V = new T.Vector3(), Q = new T.Vector3();
const offBark = (cf, p) => {
  V.set(p.x, p.y, p.z); let d = Infinity;
  for (const t of cf.tris) d = Math.min(d, t.closestPointToPoint(V, Q).distanceTo(V));
  return { off: Math.abs(d - K.cling), d };
};

test('the climbing frame follows the skeleton: a leaning stem and main limbs that leave it on the bark', () => {
  for (const [x, z, k, s] of SPOTS) {
    const t = tree(x, z, k, s), cf = t.cf;
    assert.ok(cf.limbs.length >= 4, `${k}: limbs ${cf.limbs.length}`);
    assert.ok(Math.hypot(cf.foot.x - x, cf.foot.z - z) < 1e-6 && cf.len > 2, 'the stem starts at the foot');
    for (const L of cf.limbs) {
      assert.ok(L.h > 0.3 && L.h < 1, `attached up the stem (${L.h})`);
      assert.ok(L.pts.length === 3 && L.len > 1, 'a main limb carried on by its second limb');
      for (const f of [0.3, 0.6]) assert.ok(offBark(cf, CL.limbAt(cf, cf.limbs.indexOf(L), f)).off < 0.02, `${k}: on top of the drawn limb at ${f}`);
    }
  }
});

test('the climb path lies on the bark, spirals round the trunk and runs out along a limb', () => {
  for (const [x, z, k, s] of SPOTS) {
    const cf = tree(x, z, k, s).cf;
    cf.limbs.forEach((L, li) => {
      const a0 = li * 1.7, from = { x: x + Math.cos(a0) * (cf.r0 + K.cling), y: 0, z: z + Math.sin(a0) * (cf.r0 + K.cling) };
      const route = CL.climbRoute(cf, from, li, 0.8), path = CL.pathOf(route);
      let worst = 0, turn = 0, last = null, top = null; const samples = [];
      for (let s2 = 0; s2 <= path.total; s2 += 0.05) {
        const o = CL.pathAt(path, s2, {});
        if (o.y > 0.15) { const ob = offBark(cf, o); worst = Math.max(worst, ob.off); samples.push(ob.off); } // (the first step from the ground to the trunk's foot aside; the most is in a crotch, where a limb leaves the stem)
        if (o.trunk) { if (last !== null) turn += Math.abs(o.a - last); last = o.a; }
      }
      samples.sort((p, q) => p - q);
      assert.ok(samples[Math.floor(samples.length * 0.85)] < 0.03, `${k} limb ${li}: most of the way on the bark (85 %: ${samples[Math.floor(samples.length * 0.85)].toFixed(3)} m)`);
      assert.ok(worst < 0.065, `${k} limb ${li}: ${worst.toFixed(3)} m off the bark`);
      const want = K.turns * L.hs * cf.len * Math.PI * 2;
      assert.ok(turn >= want - Math.PI * 2 && turn <= want + Math.PI * 2 + 1e-6, `${k}: ${(turn / 6.283).toFixed(2)} turns for ${(want / 6.283).toFixed(2)}`);
      top = route.filter((q) => q.trunk).pop();
      assert.ok(Math.abs(Math.atan2(Math.sin(top.a - L.ang), Math.cos(top.a - L.ang))) < 1e-6, 'the spiral ends on the limb\'s side');
      const end = CL.limbAt(cf, li, 0.8), p = route[route.length - 1];
      assert.ok(Math.hypot(p.x - end.x, p.y - end.y, p.z - end.z) < 1e-9, 'and ends at its perch on the limb');
    });
  }
});

test('crown hops: trees are linked as leaps only when two branch points are within reach', () => {
  const ts = forest();
  let pairs = 0, hops = 0;
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const d = Math.hypot(ts[i].x - ts[j].x, ts[i].z - ts[j].z); if (d > C.leapRange) continue; pairs++;
    const h = CL.bestHop(ts[i].cf, ts[j].cf), near = ts[i].near.includes(j);
    assert.equal(near, h.d <= K.hop, `${i}-${j}: gap ${h.d.toFixed(2)} m`);
    if (near) { hops++; assert.ok(ts[i].hops[j].d <= K.hop && ts[j].hops[i].li === ts[i].hops[j].lj, 'stored both ways'); }
  }
  assert.ok(hops >= 2 && hops < pairs, `some (${hops}) of the ${pairs} trunk pairs within leapRange are branch hops, not all`);
});

const world = (seed) => {
  const rnd = rng(seed), ts = forest(), nuts = new NutField(ts, ground, () => true, rnd), clock = { t: 0 };
  const player = { x: 500, z: 500, lure: false, hx: 500, hz: 500 };
  return { ts, nuts, env: { trees: ts, ground, walkable: () => true, nuts, player, scares: [], rnd, onTake: () => true, now: () => clock.t, hour: () => 11 }, clock };
};
/** Simulates squirrels for `seconds`, watching every frame. */
const simulate = (seed, seconds, watch = () => {}) => {
  const w = world(seed), brains = C.animals.slice(0, 3).map((sp, i) => new SquirrelBrain(sp, w.env, i * 2));
  w.env.others = brains; w.nuts.setActive(true);
  const prev = brains.map((b) => ({ state: b.state, x: b.x, y: b.y, z: b.z }));
  for (let t = 0; t < seconds; t += 0.05) {
    w.clock.t += 0.05; w.nuts.update(0.05);
    brains.forEach((b, i) => { b.update(0.05); watch(b, prev[i], w); Object.assign(prev[i], { state: b.state, x: b.x, y: b.y, z: b.z }); });
  }
  return brains;
};

test('in the trees: on the bark while climbing, head first down, jumps only within reach, and the cats\' ground rule holds', () => {
  const seen = { up: 0, down: 0, limb: 0, hop: 0, crown: 0, offWorst: 0, headUp: 0, headFirst: 0, low: 0 }, offs = [];
  simulate(11, 1800, (b, p, w) => {
    const t = b.tr;
    if (b.state === 'leap' && p.state !== 'leap' && b.hopTo) { // a branch jump just started: from its take-off to its landing
      seen.hop++; if (b.tree2 === b.tree) seen.crown++;
      const d = Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y, b.to.z - b.from.z);
      assert.ok(d <= K.hop + 1e-9, `jump of ${d.toFixed(2)} m`);
      assert.ok(offBark(w.ts[b.tree2].cf, b.to).off < 0.03, 'lands on a limb');
    }
    if (b.state === 'leap' && p.state !== 'leap' && !b.hopTo) assert.fail('a crown leap without a branch hop between framed trees');
    if (!['up', 'down', 'limb'].includes(b.state) || !b.path) { b.onStem_ = 0; return; }
    seen[b.state]++;
    const o = CL.pathAt(b.path, Math.min(1, b.t / b.dur) * b.path.total, {});
    if (b.y > 0.15 && seen[b.state] % 5 === 0) { const ob = offBark(t.cf, b); offs.push(ob.off); seen.offWorst = Math.max(seen.offWorst, ob.off); } // (every 5th frame: the drawn trunk is ~190 triangles)
    b.onStem_ = o.trunk ? (b.onStem_ ?? 0) + 1 : 0;
    if (o.trunk && b.onStem_ > 6) { // (posed on the stem: the turn from a limb onto it is eased over a few frames)
      if (b.state === 'up' && o.dy > 0) { seen.headUp++; assert.ok(b.pitch > 1.3, `up the stem nose up (${b.pitch.toFixed(2)})`); }
      if (b.state === 'down' && o.dy < 0) { seen.headFirst++; assert.ok(b.pitch < -1.3 && b.y < p.y + 1e-9, `down the stem head first (${b.pitch.toFixed(2)})`); }
    }
    if (b.state === 'up' && b.t > 0.6 && b.y - ground() < 0.15) seen.low++; // (main.js prey(): a cat only stalks a squirrel within 0.15 m of the ground)
  });
  assert.ok(seen.up > 0 && seen.down > 0 && seen.limb > 0 && seen.hop > 0, JSON.stringify(seen));
  assert.ok(seen.headFirst > 50 && seen.headUp > 50, JSON.stringify(seen));
  offs.sort((p, q) => p - q); seen.off85 = offs[Math.floor(offs.length * 0.85)];
  assert.ok(seen.off85 < 0.025 && seen.offWorst < 0.065, `off the drawn bark: 85 % within ${seen.off85.toFixed(3)} m, worst ${seen.offWorst.toFixed(3)} m (a crotch)`);
  assert.equal(seen.low, 0, 'once climbing it is out of a cat\'s reach');
  console.log(`# ${JSON.stringify(seen)}`);
});

test('deterministic: the same seed and trees give the same climbs and hops', () => {
  const key = (bs) => JSON.stringify(bs.map((b) => [b.log.join(','), b.x.toFixed(6), b.y.toFixed(6), b.z.toFixed(6), b.limb, b.lf.toFixed(6)]));
  assert.equal(key(simulate(5, 900)), key(simulate(5, 900)));
  assert.equal(CL.perchF(1.234), CL.perchF(1.234));
});

test('the shared pose: `limb` goes over the wire as `up` (the room\'s states and the 9 numbers unchanged)', () => {
  const w = world(3), b = new SquirrelBrain(C.animals[0], w.env, 0);
  assert.equal(STATES.length, 12);
  b.state = 'limb'; const a = encodeAnimal(b);
  assert.equal(a.length, 9); assert.equal(STATES[a[7]], 'up');
  for (const st of ['perch', 'leap', 'up', 'down']) { b.state = st; assert.equal(STATES[encodeAnimal(b)[7]], st); }
});

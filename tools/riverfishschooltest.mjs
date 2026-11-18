// #2130: the river fish's local school / hold / take layer (src/riverfishschool.js) against the real shared fish (src/riverfishswim.js).
// node --test tools/riverfishschooltest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RIVER_FISH as C, RIVER_FISH_SCHOOL as SC } from '../src/config.js';
import { fishSpec, fishAt, riverPoint, swimIntervals, ringsAt } from '../src/riverfishswim.js';
import { schoolsOf, schoolContext, presentAt, placeAt, holdAt, takeRings, moveRing, coverFrame } from '../src/riverfishschool.js';

const specs = Array.from({ length: C.count }, (_, id) => fishSpec(id, 0));
// stand-in cover: a stone every 5 m along the channel, alternating sides (the real ones come from src/riverflora.js through RiverFlora.cover)
const cover = []; for (let s = 10; s < 660; s += 5) { const p = riverPoint(s), d = (s / 5) % 2 ? 1.2 : -1.2; cover.push({ x: p.x + p.nx * d, z: p.z + p.nz * d, r: 0.3, kind: 'stone' }); }
const ctx = schoolContext(specs, C.seed, coverFrame(cover));
const T0 = 2e6, HOUR = 3600, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

test('schools: schooling kinds of one stretch group together under the lowest id; pike, trout and eel stay alone', () => {
  const g = schoolsOf(specs);
  let schooled = 0;
  for (const f of specs) {
    const e = g.get(f.id), kind = SC.kinds[f.spec.name];
    assert.ok(e.size <= SC.maxSize && e.members[0] === e.lead && e.lead <= f.id && e.members[e.rank] === f.id);
    if (!kind) assert.equal(e.size, 1, `${f.spec.name} ${f.id} alone`);
    for (const m of e.members) assert.equal(SC.kinds[specs[m].spec.name], kind);
    if (e.size > 1) schooled++;
  }
  assert.ok(schooled >= 4, `some schools with this seed (${schooled} fish in schools)`);
  assert.deepEqual([...schoolsOf([...specs].reverse())], [...g], 'order of the input does not matter');
});

test('members keep a slot by their leader and turn with it; independent fish do not', () => {
  let inSlot = 0, together = 0, n = 0, apart = [];
  for (let t = T0; t < T0 + HOUR; t += 1) for (const [id, g] of ctx.groups) {
    if (g.rank === 0) continue;
    const m = presentAt(id, t, ctx, {}), l = presentAt(g.lead, t, ctx, {});
    if (m.w < 0.95) continue;
    inSlot++;
    assert.ok(Math.hypot(m.x - l.x, m.z - l.z) < 1 + SC.spread * Math.ceil(g.rank / 2) + SC.behind * g.rank + l.speed * SC.lag * g.rank + SC.wobble[0] * 2, 'close to the leader');
    if (l.speed > 0.15 && l.hold < 0.05) { n++; if (Math.abs(wrap(m.yaw - l.yaw)) < 0.5) together++; }
    const a = fishAt(specs[id], t), b = fishAt(specs[g.lead], t); if (a.speed > 0.15 && b.speed > 0.15) apart.push(Math.abs(wrap(a.yaw - b.yaw)) < 0.5);
  }
  assert.ok(inSlot > 1000, `members swim in their slot a good part of the time (${inSlot} fish-seconds)`);
  assert.ok(together / n > 0.8, `heading together while the leader swims (${(together / n).toFixed(2)})`);
  const shared = apart.filter(Boolean).length / apart.length;
  assert.ok(together / n > shared + 0.15, `more aligned than their shared paths (${(together / n).toFixed(2)} vs ${shared.toFixed(2)})`);
});

test('holds: rare, still, in the lee of cover, head against the current', () => {
  let held = 0, total = 0, inLee = 0, starts = 0;
  for (const f of specs) {
    if (ctx.groups.get(f.id).rank) continue;
    let was = false;
    for (let t = T0; t < T0 + HOUR; t += 0.5) {
      total++;
      const o = presentAt(f.id, t, ctx, {}), h = holdAt(f, t, C.seed, ctx.cover);
      if (o.hold < 0.999) { was = false; continue; }
      held++;
      if (holdAt(f, t - 0.3, C.seed, ctx.cover).h === 1 && holdAt(f, t + 0.3, C.seed, ctx.cover).h === 1) assert.ok(o.speed < 0.01, `still while holding (${o.speed})`);
      assert.ok(Math.abs(wrap(o.yaw - o.up)) < 0.02, 'facing upstream');
      if (!was) { starts++; if (h.plan.cover !== 'open' && ctx.cover.some((c) => c.s < h.plan.s && h.plan.s - c.s < c.r + SC.hold.clear + f.spec.len && Math.abs(c.d - h.plan.d) < 0.6)) inLee++; }
      was = true;
    }
  }
  assert.ok(starts > 10 && held / total > 0.02 && held / total < 0.15, `rare still moments (${starts} holds, ${(100 * held / total).toFixed(1)} % of the time)`);
  assert.ok(inLee / starts > 0.8, `in the lee of a stone (${inLee}/${starts})`);
});

test('takes: rare, deterministic, the taker darts to the surface and the rings sit where it was drawn', () => {
  const events = new Set(); let lifted = 0;
  for (let t = T0; t < T0 + HOUR; t += 0.25) for (const r of takeRings(t, ctx)) {
    if (!events.has(`${r.id}:${r.te}`)) { events.add(`${r.id}:${r.te}`); const o = placeAt(r.id, r.te, ctx, {}); if (o.take > 0.99 && Math.hypot(o.x - r.x, o.z - r.z) < 1e-6) lifted++; }
  }
  const units = [...ctx.groups.values()].filter((g) => g.rank === 0).length, perUnit = events.size / units;
  assert.ok(perUnit > 3 && perUnit < 20, `rare: ${perUnit.toFixed(1)} takes per fish / school and hour`);
  assert.equal(lifted, events.size, 'every take: the taker is at the surface where its rings start');
  const again = schoolContext([...specs].reverse(), C.seed, coverFrame(cover)), t = +[...events][0].split(':')[1] + 1;
  assert.deepEqual(takeRings(t, again), takeRings(t, ctx), 'the same rings in another client (other build order)');
});

test('sync-facing: shared places untouched, drawn fish stay in the channel and near their shared place', () => {
  const before = JSON.stringify(specs.map((f) => [fishAt(f, T0 + 10), fishAt(f, T0 + 999)]));
  let worst = 0;
  for (let t = T0; t < T0 + HOUR; t += 2) for (const f of specs) {
    const o = presentAt(f.id, t, ctx, {}), s = fishAt(f, t), p = riverPoint(o.s);
    worst = Math.max(worst, Math.hypot(o.x - s.x, o.z - s.z));
    assert.ok(swimIntervals.some(([a, b]) => o.s >= a && o.s <= b), 'inside a swim stretch (clear of the piers)');
    assert.ok(Math.abs(o.d) <= p.hw - C.edge + 1e-6, 'inside the channel');
    assert.ok(o.y > o.bed && o.y < o.water + f.spec.h, 'between bed and surface');
  }
  assert.ok(worst < C.sync.reach - 10, `drawn within ${worst.toFixed(1)} m of the shared place (the room's catch reach ${C.sync.reach} m less a harpoon line)`);
  assert.equal(JSON.stringify(specs.map((f) => [fishAt(f, T0 + 10), fishAt(f, T0 + 999)])), before, 'fishAt unchanged by the layer');
  const r = ringsAt(specs[0], T0, []), copy = r.map((x) => ({ ...x }));
  for (const x of copy) moveRing(x, T0, ctx);
  assert.deepEqual(ringsAt(specs[0], T0, []), r, 'shared rings unchanged (only a copy is moved)');
  const a = presentAt(4, T0 + 77, ctx, {}); presentAt(4, T0 + 5, ctx, {});
  assert.deepEqual(presentAt(4, T0 + 77, ctx, {}), a, 'pure: no state between calls');
});

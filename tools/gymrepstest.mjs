// #1828: completed animation cycles, daily points, and the actual shared medal/Worker boundaries.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
if (process.env.THREE_DIR) register('data:text/javascript,' + encodeURIComponent(`
const root=${JSON.stringify(pathToFileURL(process.env.THREE_DIR + '/').href)};
export async function resolve(s,c,n){if(s==='three')return{url:root+'build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return{url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
const T = await import('three');
const { OutdoorGym } = await import('../src/outdoorgym.js');
const { OUTDOOR_GYM: C, SCORE, DUCKS } = await import('../src/config.js');
const { creditGym, gymScoreOf } = await import('../src/gymscore.js');
const { MEDALS, levelOf } = await import('../src/medalcatalog.js');
const { boardCounters, COUNTERS } = await import('../src/boardcatalog.js');
const { clampCounters, medalsOf } = await import('../cloudflare/boards.js');

function rig() {
  const g = Object.create(OutdoorGym.prototype), events = [];
  Object.assign(g, { active: null, elapsed: 0, repetitions: 0, onRep: (n, id) => events.push({ n, id }) });
  g.stations = C.stations.map(spec => ({ spec, target: { kind: 'outdoorGym' }, origin: new T.Vector3(),
    spot: { pos: new T.Vector3() }, stockOrigin: new T.Vector3(), stock: spec.id === 'press' ? { position: new T.Vector3() } : null,
    world: (x, y, z) => new T.Vector3(x, y, z) }));
  const rest = { active: true, target: g.stations[0].target, t: 1, scale: 1 };
  return { g, events, rest };
}

for (const spec of C.stations) test(`${spec.id}: only full cycles count, exactly once, including multiple cycles in one update`, () => {
  const { g, events, rest } = rig(); rest.target = g.stations.find(s => s.spec.id === spec.id).target;
  g.update(0, rest); assert.deepEqual(events, []);
  g.update(spec.period / 4, rest); g.update(spec.period / 4, rest); g.update(spec.period / 4, rest);
  assert.deepEqual(events, []); // reaching the raised/pressed position alone is not a full repetition
  g.update(spec.period / 4, rest);
  assert.deepEqual(events, [{ n: 1, id: spec.id }]);
  g.update(0, rest); assert.equal(events.length, 1);
  g.update(spec.period * 2.5, rest);
  assert.deepEqual(events, [{ n: 1, id: spec.id }, { n: 2, id: spec.id }]);
  assert.equal(g.repetitions, 3);
});

test('entry glide, pause, ordinary seats, leaving mid-cycle and switching stations grant no extra cycle', () => {
  const { g, events, rest } = rig();
  rest.t = .9; g.update(100, rest); assert.equal(g.elapsed, 0);
  rest.t = 1; g.update(C.stations[0].period * .6, rest);
  g.update(0, rest); g.update(-1, rest); g.update(NaN, rest); assert.equal(events.length, 0);
  rest.active = false; g.update(0, rest); assert.equal(g.elapsed, 0);
  rest.active = true; g.update(C.stations[0].period * .6, rest); assert.equal(events.length, 0);
  rest.target = g.stations[1].target; g.update(C.stations[1].period * .6, rest); assert.equal(events.length, 0);
  rest.target = { kind: 'chair' }; g.update(100, rest); assert.equal(events.length, 0);
  assert.equal(g.active, null);
});

test('daily award ceiling, saved ledger and next local day leave all repetitions available to the medal', () => {
  let s = { gymReps: 0 }, gain = 0;
  for (let i = 0; i < 100; i++) { s.gymReps++; gain += creditGym(s, 1, '2026-11-03'); }
  assert.equal(s.gymReps, 100); assert.equal(gain, C.scorePerDay); assert.equal(gymScoreOf(s), C.scorePerDay);
  s = JSON.parse(JSON.stringify(s)); assert.equal(creditGym(s, 10, '2026-11-03'), 0);
  assert.equal(creditGym(s, 1, '2026-11-04'), SCORE.each.gymReps);
  assert.equal(gymScoreOf(s), C.scorePerDay + SCORE.each.gymReps);
  const medal = MEDALS.find(m => m.id === 'gym'); assert.equal(levelOf(medal, 99), 0); assert.equal(levelOf(medal, s.gymReps), 1);
});

test('invalid repetitions never credit points, older saves start without retrospective gym rewards', () => {
  const s = { gymReps: 123 };
  assert.equal(gymScoreOf(s), 0);
  for (const n of [0, -1, .5, NaN, Infinity, '1']) assert.equal(creditGym(s, n), 0);
  assert.equal(s.gymScore, undefined);
  assert.equal(creditGym(s, 1, '2026-11-03'), SCORE.each.gymReps);
  assert.equal(s.gymScore, SCORE.each.gymReps);
});

test('Worker accepts gym repetitions and derives Utegymmare at the same 100-repetition boundary', () => {
  assert.equal(MEDALS.find(m => m.id === 'gym').counter, 'gymReps');
  assert.ok(COUNTERS.gymReps.perMin >= 60 / Math.min(...C.stations.map(s => s.period)));
  assert.deepEqual(boardCounters({ gymReps: 100, unknown: 100 }), { gymReps: 100 });
  const c = clampCounters({ gymReps: 100 }, null, 1e12); assert.equal(c.gymReps, 100);
  assert.equal(medalsOf({ id: 'gym-tester', c, mt: {}, t: 123 }).gym.length, 1);
  assert.equal(medalsOf({ id: 'gym-tester', c: { gymReps: 99 }, mt: {}, t: 123 }).gym, undefined);
});

test('actual stats.bump/rawScore never add the uncapped per-repetition path as well', async t => {
  const old = globalThis.addEventListener;
  globalThis.addEventListener = () => {};
  t.mock.method(globalThis, 'setInterval', () => 0);
  try {
    const { stats, bump, rawScore } = await import('../src/stats.js');
    const before = rawScore();
    bump('gymReps', 100);
    assert.equal(stats.gymReps, 100);
    assert.equal(rawScore() - before, C.scorePerDay);
    bump('gymReps', 100);
    assert.equal(stats.gymReps, 200);
    assert.equal(rawScore() - before, C.scorePerDay);
    bump('gymReps', -1); bump('gymReps', .5);
    assert.equal(stats.gymReps, 200);
    // Integration: both activity ledgers must coexist in one profile without bypassing either day cap.
    bump('duckFeeds', 100);
    assert.equal(rawScore() - before, C.scorePerDay + DUCKS.scorePerDay);
    bump('duckFeeds', 100); bump('gymReps', 100);
    assert.equal(rawScore() - before, C.scorePerDay + DUCKS.scorePerDay);
    const saved = JSON.parse(JSON.stringify(stats));
    assert.equal(saved.gymScore, C.scorePerDay); assert.equal(saved.duckScore, DUCKS.scorePerDay);
  } finally {
    if (old === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = old;
  }
});

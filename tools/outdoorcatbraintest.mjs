// #1772: node --test tools/outdoorcatbraintest.mjs  (the outdoor cats' brains: personalities, outings, the visitor; no browser)
// A made-up lawn with a river (z > 9) and a road (x > 11) beside the loop, a few trees, the wall clock as the fixed seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTDOOR_CATS as C } from '../src/config.js';
import { OutdoorCatBrain, BEHAVIOURS, utilities, choose, spend, startNeeds } from '../src/outdoorcatbrain.js';

const water = (x, z) => z > 9, road = (x, z) => x > 11, walkable = (x, z) => !water(x, z) && !road(x, z) && x > -16 && z > -16;
const clear = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5)); for (let k = 0; k <= n; k++) if (!walkable(ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return false; return true; };
const trees = [[0, -7.5], [-9.5, 0], [8, 6.5], [9.5, -6]].map(([x, z]) => ({ x, z, y: 0, cy: 4.6, r: 2.4 }));
const T0 = C.epoch + 86400 * 3; // the fixed seed: the same clock, the same cats
const spec = (traits, name = 'test') => ({ name, phase: 0, rest: [70, 40, 90, 55, 35, 80], traits, route: [[-6, -4], [0, -4.5], [6, -4], [7, 4], [0, 5], [-7, 4]] });
const world = (clock = { t: T0 }) => ({ clock, env: { now: () => clock.t, hour: () => 12, month: () => 7, ground: () => 0, clear, trees } });
const PERS = Object.fromEntries(C.cats.map((c) => [c.kind, c.traits]));
const tally = (b, n = 3000) => { const k = Object.fromEntries(BEHAVIOURS.map((q) => [q, 0])); for (let m = 0; m < n; m++) k[b.behaviourAt(m)]++; for (const q in k) k[q] /= n; return k; };

test('every cat has a personality with all five traits, and they differ', () => {
  for (const c of C.cats) for (const t of ['social', 'play', 'lazy', 'shy', 'curious']) assert.ok(c.traits[t] >= 0 && c.traits[t] <= 1, `${c.name} ${t}`);
  assert.deepEqual(new Set(C.cats.map((c) => c.kind)).size, C.cats.length);
});

test('the utility AI: needs steer the choice, spending a behaviour lowers its need', () => {
  const t = PERS.playful, ctx = { rest: 90, tree: true, spots: true, butterflies: true, sunny: false }, zero = () => 0;
  assert.equal(choose({ energy: 0.05, play: 0.1, social: 0.1, hunger: 0.1 }, PERS.lazy, ctx, zero), 'sleep', 'a tired lazy cat sleeps');
  assert.ok(['butterfly', 'climb'].includes(choose({ energy: 0.9, play: 0.95, social: 0.1, hunger: 0.1 }, t, ctx, zero)), 'a rested playful cat with an urge to play plays');
  assert.equal(choose({ energy: 0.8, play: 0.1, social: 0.95, hunger: 0.1 }, PERS.social, ctx, zero), 'seek', 'a lonely social cat seeks company');
  assert.ok(utilities({ energy: 1, play: 1, social: 1, hunger: 1 }, t, { ...ctx, tree: false, butterflies: false }).climb < 0, 'no tree: no climbing');
  assert.equal(choose({ energy: 0.9, play: 0.95, social: 0.1, hunger: 0.1 }, t, { ...ctx, rest: 20 }, zero), 'rest', 'a short rest leaves no time for an outing');
  const n = { energy: 0.5, play: 0.9, social: 0.5, hunger: 0.5 };
  assert.ok(spend(n, 'butterfly').play < n.play && spend(n, 'sleep').energy > n.energy && spend(n, 'seek').social < n.social);
});

test('fixed seed: the same clock gives the same choice and the same pose on every client', () => {
  const a = new OutdoorCatBrain(spec(PERS.playful), 2, world().env), b = new OutdoorCatBrain(spec(PERS.playful), 2, world().env);
  for (const m of [5, 77, 1234, 999]) assert.equal(a.behaviourAt(m), b.behaviourAt(m)); // (b asks in another order: the block re-run agrees)
  assert.deepEqual(startNeeds(2, 9), startNeeds(2, 9));
  const ca = { t: T0 + 500 }, cb = { t: T0 + 500 }, A = new OutdoorCatBrain(spec(PERS.playful), 2, world(ca).env), Bb = new OutdoorCatBrain(spec(PERS.playful), 2, world(cb).env);
  const far = { x: 500, z: 500, d: 500, ok: false, still: 0 };
  for (let i = 0; i < 3000; i++) { ca.t += 0.2; A.update(0.2, far); } // A has been watching for 10 minutes, B just turns up
  cb.t = ca.t; Bb.update(0.2, far);
  assert.ok(Math.hypot(A.x - Bb.x, A.z - Bb.z) < 1e-6 && Math.abs(A.h - Bb.h) < 1e-6, `same place ${A.x},${A.z} / ${Bb.x},${Bb.z}`);
});

test('each personality has a noticeably different mix of behaviours', () => {
  const mix = Object.fromEntries(Object.entries(PERS).map(([k, t], i) => [k, tally(new OutdoorCatBrain(spec(t, k), 3, world().env))]));
  const r = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(2)]));
  console.log(Object.entries(mix).map(([k, v]) => `${k} ${JSON.stringify(r(v))}`).join('\n'));
  const play = (k) => mix[k].butterfly + mix[k].climb;
  for (const k of Object.keys(PERS)) if (k !== 'playful') assert.ok(play('playful') > play(k) + 0.1, `the playful one chases and climbs most: ${k}`);
  assert.ok(mix.playful.climb > 0.05 && mix.playful.butterfly > 0.05, 'it both climbs and chases butterflies');
  for (const k of Object.keys(PERS)) if (k !== 'social') assert.ok(mix.social.seek > mix[k].seek + 0.1, `the social one waits for company most: ${k}`);
  for (const k of Object.keys(PERS)) if (k !== 'lazy') assert.ok(mix.lazy.sleep > mix[k].sleep + 0.08, `the lazy one sleeps most: ${k}`);
  assert.ok(mix.shy.explore + mix.shy.stalk > mix.social.explore + mix.social.stalk, 'the shy, curious one explores and stalks more than the social one');
  const dist = (a, b) => BEHAVIOURS.reduce((s, k) => s + Math.abs(a[k] - b[k]), 0) / 2;
  const ks = Object.keys(PERS);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) assert.ok(dist(mix[ks[i]], mix[ks[j]]) > 0.2, `${ks[i]} vs ${ks[j]}: ${dist(mix[ks[i]], mix[ks[j]]).toFixed(2)}`);
});

test('no butterflies at night or in winter months; no climbing without a tree', () => {
  const night = world(); night.env.hour = () => 2; night.env.now = () => T0; // (the clock at 02 now: the stops round it are at night)
  const b = new OutdoorCatBrain(spec(PERS.playful), 3, night.env);
  const n0 = b.stop(0).start, m0 = Math.round((T0 - n0) / (b.plan.period / b.L)); // stops within ±3 h of 02:00
  for (let m = m0 - 80; m < m0 + 80; m++) { const h = b.hourAt(b.stop(m).start); if (h < 6 || h > 22) assert.notEqual(b.behaviourAt(m), 'butterfly', `stop ${m} at ${h.toFixed(1)}`); }
  const winter = world(); winter.env.month = () => 1;
  assert.equal(tally(new OutdoorCatBrain(spec(PERS.playful), 3, winter.env), 500).butterfly, 0);
  const bare = world(); bare.env.trees = [];
  assert.equal(tally(new OutdoorCatBrain(spec(PERS.playful), 3, bare.env), 500).climb, 0);
});

// three hours of each personality with a visitor standing 7 m off its loop: the cat's every frame
function live(traits, id, seconds = 3 * 3600, visitor = { x: -3, z: -12.5 }) {
  const w = world({ t: T0 }), b = new OutdoorCatBrain(spec(traits), id, w.env), seen = { near: 0, frames: 0, kinds: new Set(), states: new Set(), bad: [], top: 0, upDown: 0, chaseBf: 0, maxBfR: 0 };
  let prevH = 0;
  for (let t = 0; t < seconds; t += 0.2) {
    w.clock.t += 0.2;
    const d = Math.hypot(visitor.x - b.x, visitor.z - b.z);
    b.update(0.2, { ...visitor, d, ok: true, still: 30 });
    if (b.lost) b.resume(); // (outdoorcats.js: it fades and turns up on its loop)
    seen.frames++; if (d < 2.2) seen.near++;
    seen.kinds.add(b.activity); seen.states.add(b.st);
    if (b.h < 0.01 && (!walkable(b.x, b.z) || water(b.x, b.z) || road(b.x, b.z))) seen.bad.push([+b.x.toFixed(2), +b.z.toFixed(2), b.st, b.activity]);
    if (![b.x, b.z, b.h, b.yaw].every(Number.isFinite)) seen.bad.push(['nan', b.st]);
    seen.top = Math.max(seen.top, b.h);
    if (prevH < 0.05 && b.h >= 0.05) seen.upDown++;
    prevH = b.h;
    if (b.bf && b.activity === 'chase') { seen.chaseBf++; seen.maxBfR = Math.max(seen.maxBfR, Math.hypot(b.bf.x - b.x, b.bf.z - b.z)); }
  }
  return seen;
}

test('in three hours: the social cat comes up to the visitor, the playful one climbs and chases, none goes into the water or onto the road', () => {
  const runs = Object.fromEntries(Object.entries(PERS).map(([k, t]) => [k, live(t, 4)]));
  for (const [k, s] of Object.entries(runs)) {
    console.log(k, { nearShare: +(s.near / s.frames).toFixed(3), top: +s.top.toFixed(2), climbs: s.upDown, chase: s.chaseBf, states: [...s.states].join(','), bad: s.bad.length });
    assert.deepEqual(s.bad.slice(0, 5), [], `${k}: never in the water, on the road or off the lawn`);
  }
  const share = (k) => runs[k].near / runs[k].frames;
  for (const k of Object.keys(PERS)) if (k !== 'social') assert.ok(share('social') > share(k) + 0.03, `the social cat is by the visitor more often than the ${k} one`);
  assert.ok(runs.social.states.has('seek'), 'it walked up');
  assert.ok(runs.playful.upDown >= 3 && runs.playful.top >= C.brain.branch[0] - 1e-6, `the playful cat climbed trees (${runs.playful.upDown}) and came down`);
  assert.ok(runs.playful.chaseBf > 100 && runs.playful.maxBfR < 3, 'and chased butterflies close by');
  assert.ok(!runs.shy.states.has('seek'), 'the shy cat never seeks the visitor');
});

test('a shy cat keeps away from a moving visitor, and calms when the visitor stands still', () => {
  const w = world({ t: T0 }), b = new OutdoorCatBrain(spec(PERS.shy), 5, w.env), far = { x: 500, z: 500, d: 500, ok: false, still: 0 };
  for (let i = 0; i < 2000 && (b.at?.walking ?? true); i++) { w.clock.t += 0.2; b.update(0.2, far); } // wait until it rests
  const v = { x: b.x + 3, z: b.z }; let minD = Infinity;
  for (let i = 0; i < 40; i++) { w.clock.t += 0.2; const d = Math.hypot(v.x - b.x, v.z - b.z); b.update(0.2, { ...v, d, ok: true, still: 0 }); minD = Math.min(minD, d); }
  assert.ok(Math.hypot(v.x - b.x, v.z - b.z) > 4, `it moved away (${Math.hypot(v.x - b.x, v.z - b.z).toFixed(2)} m, ${b.st})`);
  const v2 = { x: b.x + 3, z: b.z };
  for (let i = 0; i < 10; i++) { w.clock.t += 0.2; b.update(0.2, { ...v2, d: 3, ok: true, still: 10 }); }
  assert.equal(b.st, 'notice', 'a still visitor: it sits and looks');
});

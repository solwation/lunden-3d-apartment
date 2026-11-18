// #2125: node --test tools/catlifetest.mjs  (living cats: behaviour choice, tail and ears bounded and deterministic, the real cat's use)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAT_LIFE as L, CAT_SURFACE } from '../src/config.js';
import { sitChoice, groomKind, TailMotion, earYaw, earTwitch, stretchPose, bumps, moodOf, seedOf, approach } from '../src/catlife.js';
import { CatSpawner, createCatPuppet, BREEDS } from '../src/cat.js';
import { furState, bendPoint, TAIL_SLACK } from '../src/catfur.js';
import { vertexCompileSlack } from '../src/vertexcompile.js';

const rng = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

test('sitting: the first block grooms, later blocks follow the weights, the same seed and clock give the same choice', () => {
  assert.equal(L.sit.block % 6, 0, 'blocks start at the beginning of a washing cycle');
  for (const seed of [1, 77, seedOf('Sotis')]) for (const t of [0, 3, L.sit.block - 0.01]) assert.equal(sitChoice(seed, t), 'groom');
  const n = { groom: 0, wrap: 0, look: 0 }, N = 6000, w = L.sit.weights, sum = w.groom + w.wrap + w.look;
  for (let b = 1; b <= N; b++) { const c = sitChoice(1234, b * L.sit.block + 1); n[c]++; assert.equal(c, sitChoice(1234, b * L.sit.block + L.sit.block - 0.5)); }
  for (const k in n) assert.ok(Math.abs(n[k] / N - w[k] / sum) < 0.03, `${k} ${n[k] / N}`);
  assert.notDeepEqual([...Array(30)].map((_, b) => sitChoice(1, (b + 1) * L.sit.block)), [...Array(30)].map((_, b) => sitChoice(2, (b + 1) * L.sit.block)), 'cats differ');
  assert.equal(groomKind(5, 1), 'face', 'the first washing cycle is the face, as before');
  let flank = 0; for (let c = 1; c <= 4000; c++) flank += groomKind(5, c * 6 + 1) === 'flank';
  assert.ok(Math.abs(flank / 4000 - L.sit.flank) < 0.03);
});

test('tail: bounded for any input, deterministic, trails a turn and settles', () => {
  const r = rng(9), a = new TailMotion(42), b = new TailMotion(42);
  let t = 0;
  for (let i = 0; i < 20000; i++) {
    const dt = [r() * 0.05, 0, 1e6, NaN, -1, r() * 0.5][i % 6], turn = [(r() - 0.5) * 40, Infinity, NaN, 1e9][i % 4];
    const mood = Object.keys(L.tail.moods)[i % 7];
    t += Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1) : 0;
    a.step(dt, { turn, mood, t }); b.step(dt, { turn, mood, t });
    for (const v of [a.bend, a.lift, a.x, a.v]) assert.ok(Number.isFinite(v));
    assert.ok(Math.abs(a.bend) <= L.tail.max + 1e-12 && Math.abs(a.lift) <= L.tail.maxLift + 1e-12);
    assert.equal(a.bend, b.bend); assert.equal(a.lift, b.lift);
  }
  // turning left (+yaw rate) swings the tail out the other way; it settles once the turn stops (asleep: hardly any flicks)
  const s = new TailMotion(3);
  for (let i = 0; i < 60; i++) s.step(1 / 60, { turn: 2, mood: 'sleep', t: 0 });
  assert.ok(s.x < -0.2, `trails ${s.x}`);
  for (let i = 0; i < 240; i++) s.step(1 / 60, { turn: 0, mood: 'sleep', t: 0 });
  assert.ok(Math.abs(s.x) < 0.02, `settles ${s.x}`);
  // mood flicks: a pure function of the clock, more often when cross than calm, none before the clock starts
  const count = (mood) => { let k = 0, was = 0; const M = L.tail.moods[mood]; for (let i = 1; i < 60000; i++) { const v = bumps(7, i / 100, M.rate, M.len) !== 0; if (v && !was) k++; was = v; } return k; };
  assert.ok(count('cross') > 4 * count('calm') && count('calm') > 0);
  assert.equal(bumps(7, 0, 1, 0.3), 0); assert.equal(bumps(7, 12.3, 1, 0.3), bumps(7, 12.3, 1, 0.3));
  assert.equal(moodOf('creep'), 'stalk'); assert.equal(moodOf('flee'), 'cross'); assert.equal(moodOf('look'), 'calm');
});

test('ears: towards the stimulus, bounded, twitches bounded and pure', () => {
  for (let a = -10; a <= 10; a += 0.01) for (const s of [-1, 1]) {
    const y = earYaw(a, s); assert.ok(Math.abs(y) <= L.ears.max + 1e-12);
    const rel = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(rel) > 0.05 && Math.abs(rel) < 3) assert.equal(Math.sign(y), Math.sign(rel), 'turns towards it');
    const tw = earTwitch(11, s, a + 10); assert.ok(Math.abs(tw) <= L.ears.twitchAmp + 1e-12); assert.equal(tw, earTwitch(11, s, a + 10));
  }
  for (const v of [null, NaN, Infinity]) assert.equal(earYaw(v, 1), 0);
  assert.equal(earTwitch(11, 1, 0), 0);
  assert.equal(approach(0, 5, 0.1), 0.1); assert.equal(approach(0, NaN, 0.1), 0);
  const ends = [stretchPose(0), stretchPose(1), stretchPose(-3), stretchPose(NaN)];
  for (const e of ends) assert.equal(e.k, 0);
  const mid = stretchPose(0.5); assert.equal(mid.k, 1); assert.ok(mid.bow === L.stretch.bow && mid.chest === L.stretch.chest);
});

const room = { levels: [{ segments: [] }, { segments: [] }], doors: [] };
// CatSpawner draws its petting stars on a canvas once: a no-op 2D context is enough here (no browser)
const noop = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };

test('the ordinary cat: sits with its tail round its paws, ears to a door, stretches before it turns round, tail bent in its shader', () => {
  const cat = new CatSpawner(room, rng(5));
  cat.setCat(BREEDS[0], BREEDS[0].coats[0]);
  Object.assign(cat, { nextMeow: Infinity, tailWait: 1e9 }); cat.ignored = -1e9;
  cat.object.visible = true; cat.object.updateMatrixWorld(true);
  // find a wrap block for this cat and sit through it
  let t0 = L.sit.block; while (sitChoice(cat.lifeSeed, t0 + 1) !== 'wrap') t0 += L.sit.block;
  cat.t = t0;
  for (let i = 0; i < 90; i++) { cat.update(1 / 30); cat.object.updateMatrixWorld(true); }
  assert.ok(cat.tailWrap > 0.99, 'wrapped');
  const tip = cat.parts.tip.getWorldPosition(new THREE.Vector3()), paw = cat.shoulder.children[1].getWorldPosition(new THREE.Vector3());
  assert.ok(tip.z > paw.z - 0.06, `the tip is round in front by the paws (${tip.z.toFixed(3)} vs paw ${paw.z.toFixed(3)})`);
  // a door opening on its left (+x): both ears turn that way, within bounds
  cat.hear(2, 0.2);
  for (let i = 0; i < 20; i++) { cat.update(1 / 30); cat.object.updateMatrixWorld(true); }
  const R = CAT_SURFACE.ear.rotation;
  const ys = cat.parts.ears.map((e) => e.rotation.y - R[1]); // [−x ear (turns inwards, less), +x ear (outwards)]
  for (const y of ys) assert.ok(y > 0.15 && y <= L.ears.max + 0.01, `ear ${y}`);
  assert.ok(ys[1] > 0.45 && ys[1] > ys[0], `the near-side ear swivels furthest ${ys}`);
  // up after the long sit (tail up = it gets up and turns round): a stretch first, then the turn
  cat.sitT = L.stretch.after + 1;
  cat.raiseTail(20);
  let bowMax = 0, yaw0 = cat.object.rotation.y, turnedDuring = false;
  for (let i = 0; i < Math.ceil((L.stretch.secs + 0.6) * 30); i++) {
    cat.update(1 / 30); cat.object.updateMatrixWorld(true);
    bowMax = Math.max(bowMax, cat.bow?.k ?? 0);
    if (cat.bow?.k > 0.05 && cat.object.rotation.y !== yaw0) turnedDuring = true;
  }
  assert.ok(bowMax > 0.95, `stretched ${bowMax}`); assert.ok(!turnedDuring, 'no turning while it stretches');
  assert.equal(cat.bow, null);
  for (let i = 0; i < 60; i++) { cat.update(1 / 30); cat.object.updateMatrixWorld(true); }
  assert.notEqual(cat.object.rotation.y, yaw0, 'then it turns round as before');
  // the tail bend lives in the tail material's uniform; the tip blob follows the same bend on the CPU
  const u = furState(cat.parts.tail.material).uCatTail.value;
  assert.equal(u.z, 1);
  assert.ok(Math.abs(u.x) <= L.tail.max && Math.abs(u.y) <= L.tail.maxLift);
  const base = cat.parts.tip.userData.base.clone();
  assert.ok(bendPoint(base.clone(), u.x, u.y, 1).distanceTo(cat.parts.tip.position) < 1e-9);
  assert.ok(base.length() * 2 * Math.sin(L.tail.max / 2) <= TAIL_SLACK, 'the registered vertex slack covers the largest bend');
  assert.equal(vertexCompileSlack(cat.parts.tail.material), TAIL_SLACK);
});

test('fur materials: one shader key for every fur part, puppets own their tail bend, a sphynx is nearly bare', () => {
  const b = BREEDS.find((x) => x.name === 'maine coon'), sph = BREEDS.find((x) => x.name === 'sphynx');
  const p = createCatPuppet(b, b.coats[0]), q = createCatPuppet(sph, sph.coats[0]);
  const patched = p.materials.filter((m) => furState(m)), fur = patched.filter((m) => furState(m).uCatFur.value.x > 0);
  assert.ok(fur.length >= 9, `fur materials ${fur.length}`);
  assert.ok(patched.every((m) => m.customProgramCacheKey().endsWith('|catfur1')), 'one shader key: the cat adds no program variant');
  const bare = patched.filter((m) => !fur.includes(m));
  assert.ok(bare.length >= 3 && bare.every((m) => furState(m).uCatFur.value.x === 0 && furState(m).uCatFur.value.y === 0), 'eyes, nose, X: no fur');
  // each puppet bends its own tail
  p.tailMotion.bend = 0.5; p.mood = 'calm';
  p.live(0, 1);
  const pu = furState(p.parts.tail.material).uCatTail.value.x, qu = furState(q.parts.tail.material).uCatTail.value.x;
  assert.notEqual(pu, qu);
  assert.equal(furState(p.parts.body.material).uCatFur.value.x, 1);
  assert.equal(furState(q.parts.body.material).uCatFur.value.x, L.fur.naked);
  // a stalking puppet creeps low: the head and shoulders come down, the legs fold
  Object.assign(p, { stand: 1, wantStand: 1 }); p.pose(0); const high = p.head.position.y;
  p.wantCrouch = 1; for (let i = 0; i < 30; i++) p.pose(1 / 30);
  assert.ok(high - p.head.position.y > 0.04, `lower by ${(high - p.head.position.y).toFixed(3)} m`);
  for (const v of [p.head.position.y, p.shoulder.scale.y]) assert.ok(Number.isFinite(v) && v > 0);
});

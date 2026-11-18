// #2127: node --test tools/ponymotiontest.mjs — the ponies' secondary motion (src/ponymotion.js) and its shader patch.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PONY_MOTION as M } from '../src/config.js';
import { newPonyMotion, stepPonyMotion, ponyWind, flySeason, grazeDrift } from '../src/ponymotion.js';
import { patchPonyMotion } from '../src/paddock.js';

const run = (secs, o, seed = 7, dt = 1 / 30) => { const m = newPonyMotion(seed), tr = []; for (let t = 0; t < secs; t += dt) { stepPonyMotion(m, dt, typeof o === 'function' ? o(t) : o); tr.push(JSON.parse(JSON.stringify({ ...m, rnd: 0 }))); } return { m, tr }; };
const still = { x: 0, z: 0, power: 0 };
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('every motion stays bounded through all states, gales, flies and long frames', () => {
  const states = ['idle', 'graze', 'walk', 'watch', 'pet', 'feed'];
  for (const seed of [7, 19, 3]) {
    const { tr } = run(400, (t) => ({ state: states[Math.floor(t / 9) % 6], walking: Math.floor(t / 9) % 6 === 2, headDown: t % 18 < 9, flies: true,
      wind: { x: 1.7 * Math.sin(t * 0.7), z: -1.7 * Math.cos(t * 0.5), power: 1 } }), seed, 0.1);
    for (const s of tr) {
      assert.ok(Math.abs(s.lean) <= 1 + 1e-9 && s.rest >= 0 && s.rest <= 1);
      assert.ok(Math.abs(s.chew) <= 1 && Math.abs(s.grind) <= 1);
      for (const e of s.ears) assert.ok(Math.abs(e.y) <= M.ears.turn + 1e-9 && Math.abs(e.x) <= M.ears.back + 1e-9);
      for (const j of s.tail) assert.ok(Math.abs(j.z) <= M.tail.max + 1e-9 && Math.abs(j.x) <= M.tail.max * 0.6 + 1e-9 && Number.isFinite(j.vz));
      assert.ok(Math.abs(s.mane.x) <= M.mane.max && Math.abs(s.mane.z) <= M.mane.max && s.mane.ripple <= M.mane.ripple);
      assert.ok(s.twitch.a >= 0 && s.twitch.a <= 1 && Math.abs(s.twitch.x) < 0.3);
    }
  }
});

test('the wind drives mane and tail downwind (in the pony frame); calm leaves only a small sway', () => {
  const calm = run(30, { state: 'idle', walking: false, wind: still }).tr.slice(300);
  const side = run(30, { state: 'idle', walking: false, wind: { x: 1.2, z: 0, power: 0.8 } }).tr.slice(300);
  const tailWind = run(30, { state: 'idle', walking: false, wind: { x: 0, z: -1.2, power: 0.8 } }).tr.slice(300);
  assert.ok(Math.max(...calm.map((s) => Math.abs(s.tail[0].z))) <= M.tail.sway * 1.2, 'calm: idle sway only');
  assert.ok(calm.every((s) => s.mane.x === 0 && s.mane.z === 0));
  assert.ok(mean(side.map((s) => s.tail[0].z)) > 0.2 && mean(side.map((s) => s.tail[2].z)) > 0.05, 'a wind from the right blows the tail to the left (+x)');
  assert.ok(mean(side.map((s) => s.mane.x)) > 0.02);
  assert.ok(mean(tailWind.map((s) => s.tail[0].x)) > 0.15, 'a wind towards the rump lifts the tail back');
  // ponyWind turns the real siteWind state into the pony frame: a pony facing downwind feels it from behind (local −z… +z sign)
  const state = { time: 3, power: 0.7, dir: new THREE.Vector2(1, 0) };
  const facing = ponyWind(state, 10, 20, Math.PI / 2), across = ponyWind(state, 10, 20, 0);
  assert.ok(Math.abs(across.x - facing.z) < 1e-9 && Math.abs(across.z + facing.x) < 1e-9 && facing.power === 0.7, 'the same wind, turned with the pony');
  const zs = []; for (let t = 0; t < 60; t += 0.25) zs.push(ponyWind({ ...state, time: t }, 10, 20, Math.PI / 2).z);
  assert.ok(mean(zs) > 0.05 && Math.max(...zs) < 1.8, 'facing downwind: on average the wind comes from behind (+z), gusting');
  assert.deepEqual(ponyWind({ time: 3, power: 0, dir: new THREE.Vector2(1, 0) }, 0, 0, 1), { x: 0, z: 0, power: 0 });
});

test('a chain: the lower tail joints lag behind a swing (secondary motion)', () => {
  const m = newPonyMotion(5), cross = [null, null, null];
  for (let t = 0; t < 3; t += 1 / 60) {
    stepPonyMotion(m, 1 / 60, { state: 'idle', walking: false, wind: { x: t < 1 ? 1.5 : -1.5, z: 0, power: 1 } });
    let sum = 0; m.tail.forEach((j, k) => { sum += j.z; if (t > 1 && cross[k] === null && sum < 0) cross[k] = t; }); // world angle of joint k
  }
  const lagSeen = cross.every((c) => c !== null) && cross[0] < cross[1] && cross[0] < cross[2];
  assert.ok(lagSeen, 'when the base swings over, the next joint still bends the old way for a moment');
});

test('flies only in the summer months and dry weather: skin twitches and tail swats', () => {
  assert.deepEqual([1, 3, 5, 6, 7, 8, 9, 12].map((mo) => flySeason(mo)), [false, false, false, true, true, true, false, false]);
  assert.equal(flySeason(7, 0.8), false);
  const summer = run(60, { state: 'graze', walking: false, headDown: true, flies: true, wind: still }).tr;
  const winter = run(60, { state: 'graze', walking: false, headDown: true, flies: false, wind: still }).tr;
  assert.ok(summer.filter((s) => s.twitch.a > 0.5).length > 20 && summer.some((s) => s.swat > 0));
  assert.ok(Math.max(...summer.map((s) => Math.abs(s.tail[0].z))) > 0.3, 'a swat reaches well beyond the idle sway');
  assert.ok(winter.every((s) => s.twitch.a === 0 && s.swat === 0));
});

test('weight shifts between sides while standing, settles while walking; chewing only with the head down', () => {
  const stand = run(120, { state: 'idle', walking: false, wind: still }).tr;
  assert.ok(stand.some((s) => s.lean > 0.8) && stand.some((s) => s.lean < -0.8), 'both sides take the weight');
  assert.ok(stand.at(-1).rest > 0.9);
  const walk = run(20, { state: 'walk', walking: true, wind: still }).tr.at(-1);
  assert.ok(Math.abs(walk.lean) < 0.01 && walk.rest < 0.01);
  assert.ok(run(10, { state: 'graze', walking: false, headDown: true, wind: still }).tr.slice(100).some((s) => s.chew > 0.9));
  assert.ok(run(10, { state: 'idle', walking: false, headDown: false, wind: still }).tr.every((s) => s.chew < 1e-3));
  const watch = run(20, { state: 'watch', walking: false, wind: still }).tr.at(-1);
  assert.ok(watch.ears.every((e) => Math.abs(e.y) < 0.2 * M.ears.turn), 'ears forward to the visitor');
});

test('grazing drift: a slow step every few seconds only while grazing', () => {
  const m = newPonyMotion(11), steps = [];
  for (let t = 0; t < 120; t += 0.1) { const d = grazeDrift(m, 0.1, true); if (d) steps.push(d); }
  assert.ok(steps.length >= 120 / M.drift.every[1] - 1 && steps.length <= 120 / M.drift.every[0] + 1);
  assert.ok(steps.every((d) => d.dist >= M.drift.dist[0] && d.dist <= M.drift.dist[1] && Math.abs(d.turn) <= M.drift.turn));
  for (let t = 0; t < 60; t += 0.1) assert.equal(grazeDrift(m, 0.1, false), null);
});

test('the shader patch adds the mane and twitch uniforms with one shared program key', () => {
  const mat = new THREE.MeshStandardMaterial(), u = patchPonyMotion(mat), sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: '' };
  mat.onBeforeCompile(sh);
  assert.ok(sh.uniforms.uPonyMane === u.uPonyMane && sh.uniforms.uPonyTwitch === u.uPonyTwitch);
  assert.match(sh.vertexShader, /uniform vec4 uPonyMane/); assert.match(sh.vertexShader, /transformed\.xz \+= hair/);
  assert.equal(mat.customProgramCacheKey(), patchPonyMotion(new THREE.MeshStandardMaterial()) && 'pony-motion-2127');
});

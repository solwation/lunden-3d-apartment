// #2175: rain wets facades, roofs, cars and benches (src/wetsurface.js). node --test tools/wetsurfacetest.mjs
// Function-level: dry changes nothing, each class darkens / glosses with the wetness, streaks only on walls, drops only on car paint,
// the chain keeps the other steps (one copy, unique key, native vertex stage) and the phone policy (no new program for a plain material).
import test from 'node:test'; import assert from 'node:assert/strict';
import * as THREE from 'three';
import { wetSurface, wetSurfaceState, wetSurfaceGLSL } from '../src/wetsurface.js';
import { snowCap } from '../src/snowcap.js';
import { WET_SURFACE as W } from '../src/config.js';
import { vertexCompileSlack } from '../src/vertexcompile.js';

const UP = { x: 0, y: 1, z: 0 }, WALL = { x: 0, y: 0, z: 1 };
const scan = (kind, wet, n, fn) => { let s = 0, k = 0, max = 0; for (let x = 0; x < 8; x += 0.07) for (let y = 0; y < 8; y += 0.2) { const v = fn(wetSurfaceState(kind, wet, { x: x + 0.3, y, z: 1.7 }, n)); s += v; k++; max = Math.max(max, v); } return { mean: s / k, max }; };

test('dry changes nothing; wet darkens and glosses every class', () => {
  for (const kind of Object.keys(W.kinds)) {
    assert.deepEqual(wetSurfaceState(kind, 0), { dark: 1, rough: 0, shine: 0, streak: 0, drops: 0 }, kind + ' dry');
    const damp = wetSurfaceState(kind, 0.3), soaked = wetSurfaceState(kind, 1);
    assert(damp.dark < 1 && soaked.dark <= damp.dark && soaked.dark === W.kinds[kind].dark, `${kind} darkens, fully at 1/1.6`);
    assert(damp.rough < soaked.rough && soaked.rough === 1, `${kind}: the gloss comes as it soaks (wet²)`);
    assert(soaked.shine > 0 && soaked.shine > damp.shine);
  }
  assert(W.kinds.brick.dark > 0.5 && W.kinds.roof.dark < W.kinds.brick.dark, 'a roof film is the darkest');
  assert(W.kinds.roof.rough < W.kinds.render.rough && W.kinds.car.rough <= W.kinds.metal.rough, 'roof and paint get the glossiest films');
});

test('run streaks: only on near-vertical walls of brick and render, stronger when soaked, thin lines not a wash', () => {
  const wall = scan('brick', 1, WALL, (s) => s.streak), top = scan('brick', 1, UP, (s) => s.streak), damp = scan('brick', 0.3, WALL, (s) => s.streak);
  assert(wall.max > 0.5 * W.kinds.brick.streak && wall.max <= W.kinds.brick.streak + 1e-9, 'streaks reach their strength');
  assert(wall.mean > 0 && wall.mean < 0.5 * W.kinds.brick.streak, 'only in lines, not everywhere');
  assert.equal(top.max, 0, 'none on a roof or coping top');
  assert.equal(damp.max, 0, 'none while only damp');
  assert.equal(scan('roof', 1, WALL, (s) => s.streak).max, 0, 'roofs / cars / benches have no run streaks');
  assert(scan('render', 1, WALL, (s) => s.streak).max > 0);
  // vertical: constant along y over a short step, varying along the wall
  const a = (x, y) => wetSurfaceState('render', 1, { x, y, z: 0 }, WALL).streak;
  let along = 0, up = 0; for (let i = 0; i < 40; i++) { along += Math.abs(a(i * 0.05, 3) - a(i * 0.05 + 0.2, 3)); up += Math.abs(a(i * 0.05, 3) - a(i * 0.05, 3.2)); }
  assert(up < along, 'the streaks are taller than wide');
});

test('dropwise gloss only on car paint, as beads', () => {
  const d = scan('car', 1, UP, (s) => s.drops);
  assert(d.max > 0 && d.mean > 0.1 * W.kinds.car.drops && d.mean < 0.8 * W.kinds.car.drops, `beads, not all over (${d.mean.toFixed(2)})`);
  assert.equal(scan('car', 0.3, UP, (s) => s.drops).max < d.max, true, 'fewer while damp');
  for (const k of ['brick', 'roof', 'wood', 'metal']) assert.equal(scan(k, 1, UP, (s) => s.drops).max, 0, k);
});

const compile = (m) => { const lib = THREE.ShaderLib.physical, sh = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} }; m.onBeforeCompile(sh, null); return sh; };

test('chain: one copy, unique key, after the snow cap and the material own steps, native vertex stage', () => {
  const base = new THREE.MeshStandardMaterial(); let own = 0; base.onBeforeCompile = (s) => { own++; s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n// own'); };
  const m = wetSurface(snowCap(base, false), 'brick', false); assert.equal(wetSurface(m, 'brick', false), m);
  const sh = compile(m);
  assert.equal(own, 1); assert.equal((sh.fragmentShader.match(/uniform vec3 uSurfWet/g) ?? []).length, 1);
  assert(sh.fragmentShader.includes('uniform float uSnowCap') && sh.fragmentShader.includes('// own'));
  assert(sh.uniforms.uSurfWet && sh.uniforms.uSnowCap, 'both uniforms are bound');
  assert(m.customProgramCacheKey().includes('wetsurf2175-brick') && m.customProgramCacheKey().includes('snowcap2123'));
  assert.equal(vertexCompileSlack(m), vertexCompileSlack(base), 'vertex stage as before');
  const plain = wetSurface(new THREE.MeshStandardMaterial(), 'car', false); assert.equal(vertexCompileSlack(plain), 0, 'a plain material keeps a native vertex stage');
  assert.notEqual(wetSurface(new THREE.MeshStandardMaterial(), 'roof', false).customProgramCacheKey(), plain.customProgramCacheKey(), 'a key per class');
  assert.throws(() => wetSurface(new THREE.MeshStandardMaterial(), 'nope', false));
});

test('phones: a plain material gets no new program, one with its own compile step still does', () => {
  const plain = new THREE.MeshStandardMaterial(), key = plain.customProgramCacheKey();
  assert.equal(wetSurface(plain, 'car', true), plain); assert.equal(plain.userData.wetSurface, undefined); assert.equal(plain.customProgramCacheKey(), key);
  const own = new THREE.MeshStandardMaterial(); own.onBeforeCompile = () => {};
  wetSurface(own, 'brick', true); assert.equal(own.userData.wetSurface, 'brick');
});

test('shader text: branches on the wetness, kind-specific parts only where used, no per-frame randomness', () => {
  const brick = wetSurfaceGLSL('brick'), car = wetSurfaceGLSL('car'), roof = wetSurfaceGLSL('roof');
  for (const g of [brick, car, roof]) assert(g.body.includes('if (uSurfWet.x > 0.0)'));
  assert(brick.body.includes('wetSWall') && !car.body.includes('wetSWall') && !roof.body.includes('wetSP'));
  assert(car.body.includes('wetSDrop') && !brick.body.includes('wetSDrop'));
  assert(!/Math\.random|performance\.now|Date\.now/.test(wetSurfaceGLSL('wood').head + brick.body));
});

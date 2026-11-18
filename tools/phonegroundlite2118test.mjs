// #2118: phones (lowMemory) compile the ground's wet (#2099) and leaf-litter (#2105) patches without the code they never run there
// (puddles and leaf shapes are off on phones), under their own `-lite` keys; desktop keeps its shaders and keys.
// node --test tools/phonegroundlite2118test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { wetGround, wetGLSL } from '../src/wetground.js';
import { leafLitter, litterGLSL } from '../src/leaflitter.js';
import { lowMemory } from '../src/lowmemory.js';
import { WET_GROUND as W, LEAF_LITTER as L } from '../src/config.js';

const run = (m) => { const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader }; m.onBeforeCompile(sh, null); return sh; };
const DETAIL = /wetNoise|wetHash|litterLeaf|litterHash|fwidth/;

test('phone ground shaders carry no puddle or leaf-shape code, keep every uniform and get unique -lite keys', () => {
  assert.equal(lowMemory, false, 'node runs the desktop default');
  const keys = new Set();
  for (const kind of Object.keys(W.kinds)) {
    const m = wetGround(new THREE.MeshStandardMaterial(), kind, true), sh = run(m);
    assert.doesNotMatch(sh.fragmentShader, DETAIL, `${kind}: no puddle noise or leaf grids on phones`);
    for (const u of ['uGroundWet', 'uWetHorizon', 'uLitter', 'uLitterMap', 'uLitterBox']) assert.ok(sh.uniforms[u], `${kind}: ${u} still bound`);
    assert.match(sh.fragmentShader, /if \(uGroundWet\.x > 0\.0\)/, 'the wet film stays (rain darkens phones too)');
    assert.match(sh.fragmentShader, /diffuseColor\.rgb = mix\(diffuseColor\.rgb, litMean, litAlpha\)/, 'the autumn tint stays');
    assert.match(m.customProgramCacheKey(), new RegExp(`wet2099-${kind}-lite\\|litter2105-${kind}-lite$`));
    keys.add(m.customProgramCacheKey());
    const desk = wetGround(new THREE.MeshStandardMaterial(), kind);
    assert.notEqual(desk.customProgramCacheKey(), m.customProgramCacheKey(), 'never shares a program with the full shader');
    assert.ok(run(desk).fragmentShader.length > sh.fragmentShader.length, 'smaller to compile');
  }
  assert.equal(keys.size, Object.keys(W.kinds).length, 'one key per kind');
  const bed = run(leafLitter(new THREE.MeshStandardMaterial(), 'grass', '1.0 - grassBed', true)).fragmentShader;
  assert.match(bed, /\* \(1\.0 - grassBed\)/, 'the river-bed mask survives');
  assert.doesNotMatch(bed, DETAIL);
});

test('desktop keeps the full shaders and the #2099/#2105 keys', () => {
  for (const kind of Object.keys(W.kinds)) {
    assert.deepEqual(wetGLSL(kind), wetGLSL(kind, W, false));
    assert.equal(wetGLSL(kind).surface.includes('wetNoise'), W.kinds[kind].puddles > 0);
    const m = wetGround(new THREE.MeshStandardMaterial(), kind);
    assert.match(m.customProgramCacheKey(), new RegExp(`\\|wet2099-${kind}\\|litter2105-${kind}$`));
    assert.match(run(m).fragmentShader, /litterLeaf\(litW\.xz, /);
  }
  for (const k of Object.keys(L.kinds)) assert.deepEqual(litterGLSL(k), litterGLSL(k, L, '', false));
});

test('the lite tint is the full step with the leaf shapes off (litDetail = 0)', () => {
  // the full surface with litDetail = 0: litLeaf = litMean, litAlpha = litFar · litFlat, same mulch and roughness
  const full = litterGLSL('asphalt').surface, lite = litterGLSL('asphalt', L, '', true).surface;
  for (const line of ['float litFar = ', 'float litMulch = ', 'roughnessFactor = mix(roughnessFactor, ', 'litC = texture2D(uLitterMap, litUV).r']) {
    const pick = (s) => s.split('\n').find((l) => l.includes(line))?.trim();
    assert.ok(pick(lite) && pick(lite) === pick(full), line);
  }
  assert.match(full, /float litAlpha = mix\(litFar, litNear, litDetail\) \* litFlat;/);
  assert.match(lite, /float litAlpha = litFar \* litFlat;/);
});

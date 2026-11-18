// #2090: a material that inherits an already lamp-washed onBeforeCompile (viewlod.js's car LOD clone, then its dither
// wrapper) is patched again by the same wash: its fragment shader must still get the wash declarations/light only once.
// node tools/lampwash2090test.mjs (three 0.170.0 resolvable as 'three').
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLampWashes } from '../src/lampwash.js';
import { patchDitherLod, lodRange } from '../src/lod.js';

const lamp = { pos: { x: 1, y: 1.5, z: 1 }, color: 0xffe2b8, intensity: 1, range: 4, level: 0, segs: [[0, 0, 3, 0]] };
const wash = (suffix) => buildLampWashes(null, null, [{ owner: null, lamp, k: 1 }], { suffix, boxes: [{ x0: 0, x1: 3, z0: 0, z1: 3, y0: 0, y1: 3 }] });
const fragment = THREE.ShaderLib.standard.fragmentShader;
const compile = (m) => { const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: fragment }; m.onBeforeCompile(shader, null); return shader; };
const count = (s, needle) => s.split(needle).length - 1;

test('a clone carrying an already patched callback (car LOD) gets each wash once', () => {
  const main = wash(''), visit = wash('V');
  const source = new THREE.MeshStandardMaterial();
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), source));
  main.patch(scene); visit.patch(scene);
  // viewlod.js addCarLod: clone, inherit the source's (patched) callback, wrap it in the dither fade, swap it in
  const mat = source.clone();
  mat.onBeforeCompile = source.onBeforeCompile; mat.customProgramCacheKey = source.customProgramCacheKey.bind(source);
  scene.children[0].material = patchDitherLod(mat, { range: lodRange(10, 20) });
  main.patch(scene); visit.patch(scene); // the periodic patch / WarmUp.prepare
  const fs = compile(mat).fragmentShader;
  for (const sfx of ['', 'V']) {
    assert.equal(count(fs, `uniform highp sampler2D uLampData${sfx};`), 1, `uLampData${sfx} declared once`);
    assert.equal(count(fs, `vec3 lampWash${sfx}(vec3`), 1, `lampWash${sfx} defined once`);
    assert.equal(count(fs, `+= lampWash${sfx}(-vViewPosition`), 1, `lampWash${sfx} light added once`);
  }
  // the untouched source still compiles exactly as before
  const plain = compile(source).fragmentShader;
  for (const sfx of ['', 'V']) assert.equal(count(plain, `vec3 lampWash${sfx}(vec3`), 1);
});

test('patching the same material twice stays a no-op', () => {
  const main = wash('');
  const m = new THREE.MeshLambertMaterial(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), m);
  main.patch(mesh); const cb = m.onBeforeCompile; main.patch(mesh);
  assert.equal(m.onBeforeCompile, cb);
  assert.equal(count(compile(m).fragmentShader, 'vec3 lampWash(vec3'), 1);
});

// #2123: a thin snow cap on narrow upward faces in the snow months (src/snowcap.js). node --test tools/snowcaptest.mjs
// Needs `three` resolvable (node_modules/three → 0.170.0). Function-level checks: only snow months, only upward faces (fading
// on steep ones), the chain onto railMetal / benchWood / moss (one copy, unique keys, snow after them), the phone policy.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { snowCap, snowCapAmount, snowCapOn, snowCapUniform, snowCapGLSL, snowCapColor } from '../src/snowcap.js';
import { applySeason } from '../src/seasons.js';
import { railMetal } from '../src/railmetal.js';
import { benchWood } from '../src/benchwood.js';
import { mossMaterial } from '../src/shademoss.js';
import { SNOW_CAP as C, SEASON } from '../src/config.js';
import { vertexCompileSlack } from '../src/vertexcompile.js';

const tilt = (deg) => ({ x: Math.sin(deg * Math.PI / 180), y: Math.cos(deg * Math.PI / 180), z: 0 });
function mean(n, on = 1) { let s = 0, k = 0, max = 0; for (let x = 0; x < 6; x += 0.03) for (let z = 0; z < 0.4; z += 0.03) { const a = snowCapAmount({ x: x + 0.37, y: 3, z: z + 1.1 }, n, on); s += a; k++; max = Math.max(max, a); } return { mean: s / k, max }; }

test('only the snow months switch it on', () => {
  for (let m = 1; m <= 12; m++) assert.equal(snowCapOn(m), SEASON.snowMonths.includes(m) ? 1 : 0, `month ${m}`);
  assert(SEASON.snowMonths.includes(1) && !SEASON.snowMonths.includes(7), 'January snowy, July not (months 1–12)');
  assert.equal(mean(tilt(0), 0).max, 0, 'off: nothing even on a flat top');
  snowCap(new THREE.MeshStandardMaterial(), false); // (registers the seasons hook)
  applySeason(1); assert.equal(snowCapUniform.value, 1, 'January: on');
  applySeason(7); assert.equal(snowCapUniform.value, 0, 'July: off');
});

test('only upward faces: full on tops, fading on steep faces, none on walls or soffits', () => {
  const top = mean(tilt(0)), gentle = mean(tilt(20)), steep = mean(tilt(52)), sixty = mean(tilt(60));
  assert(top.mean > 0.7 * C.strength && top.max <= C.strength + 1e-9, `a sill top is white (${top.mean.toFixed(2)})`);
  assert(gentle.mean > 0.8 * top.mean, 'a gentle fall keeps it');
  assert(steep.mean < 0.5 * top.mean, 'fades on steep faces');
  assert.equal(sixty.max, 0, 'none past ~57°');
  for (const n of [{ x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }]) assert.equal(mean(n).max, 0, JSON.stringify(n));
  assert(top.mean < 0.98 * C.strength, 'thinner in places, not a uniform paint');
  assert.deepEqual(mean(tilt(0)), top, 'deterministic');
  assert(!/Math\.random|performance\.now|Date\.now/.test(readFileSync(new URL('../src/snowcap.js', import.meta.url), 'utf8')));
  const [r, g, b] = snowCapColor(); assert(r > 0.85 && g > 0.85 && b > 0.85, 'white');
});

const compile = (m) => { const lib = THREE.ShaderLib.physical, sh = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} }; m.onBeforeCompile(sh, null); return sh; };

test('chains after railMetal, benchWood and moss: one copy, snow last, unique keys, shared uniform, fragment-only', () => {
  const bus = snowCap(benchWood(railMetal(new THREE.MeshStandardMaterial({ vertexColors: true }), null)), false);
  const sh = compile(bus), fs = sh.fragmentShader;
  assert(fs.includes('railStreak') && fs.includes('benchGrain'), 'the existing steps still run');
  assert.equal(fs.split('uniform float uSnowCap;').length, 2, 'one copy');
  assert(fs.indexOf('benchRgb') < fs.indexOf('snowA') && fs.indexOf('railRough') < fs.indexOf('snowA'), 'snow after the colour/roughness steps');
  assert(fs.indexOf('#include <normal_fragment_begin>') < fs.indexOf('snowUp') && fs.indexOf('snowA') < fs.indexOf('#include <lights_physical_fragment>'), 'before lighting uses the colour');
  assert.equal(sh.uniforms.uSnowCap, snowCapUniform, 'the one shared uniform object');
  assert.equal(sh.vertexShader, compile(benchWood(railMetal(new THREE.MeshStandardMaterial({ vertexColors: true }), null))).vertexShader, 'vertex shader as without the cap');
  assert.equal(bus.customProgramCacheKey(), 'rail-metal-2089|bench-wood-2098|snowcap2123');
  assert.equal(vertexCompileSlack(bus), 0, 'audited: vertex positions unchanged');
  snowCap(bus, false); assert.equal(compile(bus).fragmentShader.split('uniform float uSnowCap;').length, 2, 'a second call adds nothing');
  const mossy = mossMaterial(snowCap(new THREE.MeshStandardMaterial({ map: new THREE.Texture() }), false), 'map'), mf = compile(mossy).fragmentShader;
  assert(mf.indexOf('mossA') > 0 && mf.indexOf('mossA') < mf.indexOf('snowA'), 'moss hidden under the snow where they overlap');
  assert(/\|snowcap2123\|shademoss2122-map$/.test(mossy.customProgramCacheKey()), mossy.customProgramCacheKey());
  const rail = snowCap(railMetal(new THREE.MeshStandardMaterial()), false);
  assert.notEqual(rail.customProgramCacheKey(), railMetal(new THREE.MeshStandardMaterial()).customProgramCacheKey(), 'capped ≠ uncapped program');
  const plain = snowCap(new THREE.MeshStandardMaterial(), false);
  assert(plain.customProgramCacheKey().endsWith('|snowcap2123') && compile(plain).fragmentShader.includes('snowCapNoise'));
  assert(snowCapGLSL().body.includes('if (uSnowCap > 0.0)'), 'uniform-gated: off months skip the work');
});

test('phones: no new program for a plain material, rails and benches keep the cap', () => {
  const plain = new THREE.MeshStandardMaterial(), key = plain.customProgramCacheKey, cb = plain.onBeforeCompile;
  snowCap(plain, true);
  assert(plain.customProgramCacheKey === key && plain.onBeforeCompile === cb && !plain.userData.snowCap, 'lite plain: untouched');
  assert(snowCap(railMetal(new THREE.MeshStandardMaterial()), true).userData.snowCap, 'lite rail: capped (its own program anyway)');
  assert(snowCap(benchWood(new THREE.MeshStandardMaterial()), true).userData.snowCap, 'lite bench: capped');
  assert.equal(snowCap(new THREE.MeshBasicMaterial(), false).userData.snowCap, undefined, 'unlit materials skipped');
});

test('wired into Hus L, the Å-husen (A/B/C), the box walls, courtyard and bus stop', () => {
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  const count = (f) => (src(f).match(/snowCap\(/g) ?? []).length;
  assert(count('exterior.js') >= 6, 'Hus L: brick, render, pilasters, flashings/cappings, loftgång and terrace rails');
  assert(count('surroundings.js') >= 9, 'A/B/C façades, render, rails, signs, sheet metal; box walls/rails');
  assert(count('courtyard.js') >= 3 && count('busstop.js') >= 1, 'benches, metal, pergola; the bus stop bench');
  assert(/snowCap\(new THREE\.MeshStandardMaterial\(\{ color: Lf\.fascia/.test(src('exterior.js')), 'Hus L: sill flashings + rectRing capping + copings');
});

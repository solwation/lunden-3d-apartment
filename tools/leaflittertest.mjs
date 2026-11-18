// #2105: fallen autumn leaves: how much lies per month (none in summer, spring or the snow months, growing through the autumn),
// where (denser under crowns and along kerbs), deterministic, and a chained fragment patch that leaves the vertices alone.
// node --test tools/leaflittertest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { litterAmount, litterColors, bakeLitterDensity, LeafLitter, leafLitter, litterUniforms, litterGLSL } from '../src/leaflitter.js';
import { wetGround } from '../src/wetground.js';
import { LEAF_LITTER as L, SEASON } from '../src/config.js';
import { hasNativeVertexCompile } from '../src/vertexcompile.js';

test('amount per month: none in summer, winter/snow and spring; growing September → October → November', () => {
  for (const m of [3, 4, 5, 6, 7, 8]) assert.equal(litterAmount(m), 0, `month ${m}`);
  for (const m of SEASON.snowMonths) assert.equal(litterAmount(m), 0, `snow month ${m}`);
  assert.equal(litterAmount(12, { ...L, months: { ...L.months, 12: 1 } }), 0, 'snow wins over any autumn share');
  assert.ok(litterAmount(9) > 0 && litterAmount(9) < litterAmount(10) && litterAmount(10) < litterAmount(11) && litterAmount(11) <= 1);
  for (const m of [9, 10, 11]) assert.equal(litterColors(m).length, 2);
  assert.equal(litterColors(7), null); assert.equal(litterColors(1), null);
});

const box = { x0: -20, x1: 20, z0: -20, z1: 20 };
const at = (d, x, z) => d.data[Math.floor((z - box.z0) / L.cell) * d.nx + Math.floor((x - box.x0) / L.cell)] / 255;
const mean = (d, x0, x1, z0, z1) => { let s = 0, n = 0; for (let z = z0; z < z1; z += L.cell) for (let x = x0; x < x1; x += L.cell) { s += at(d, x + 0.01, z + 0.01); n++; } return s / n; };

test('density: sparse open ground, denser under a crown and along a kerb; deterministic', () => {
  const trees = [{ x: -10, z: -10, r: 4 }], road = [{ x: 0, z: 5, w: 6 }, { x: 19, z: 5, w: 6 }]; // edges at z 2 and 8
  const d = bakeLitterDensity({ trees, roads: [road], box });
  const open = mean(d, 5, 15, -15, -5);
  assert.ok(open > 0 && open < 0.25, `sparse open ground (${open})`);
  assert.ok(at(d, -10, -10) > 0.8 && at(d, -10, -10) > 4 * open, 'densest at the trunk');
  assert.ok(at(d, -10 + 2, -10) > open && at(d, -10 + 2, -10) < at(d, -10, -10), 'thinning towards the crown edge');
  assert.ok(at(d, 10, 2) > 3 * open && at(d, 10, 8) > 3 * open, 'a band along both kerbs');
  assert.ok(at(d, 10, 5) < 0.3, 'not across the middle of the road');
  const again = bakeLitterDensity({ trees, roads: [road], box });
  assert.deepEqual(again.data, d.data, 'same input, same map');
  assert.equal(d.nx, 40); assert.equal(d.nz, 40);
});

test('LeafLitter follows the months: amount and tones in the uniforms, map baked once on the first autumn month', () => {
  let reads = 0;
  const s = new LeafLitter({ trees: () => { reads++; return [{ x: 0, z: 0, r: 3 }]; } });
  s.apply(7); assert.equal(litterUniforms.uLitter.value.x, 0); assert.equal(s.texture, null, 'no bake out of season');
  const seen = [9, 10, 11].map((m) => s.apply(m));
  assert.deepEqual(seen, [9, 10, 11].map((m) => litterAmount(m)));
  assert.equal(reads, 1, 'baked once');
  assert.equal(litterUniforms.uLitterFresh.value.getHex(), new THREE.Color(L.colors[11][0]).getHex());
  s.apply(1); assert.equal(litterUniforms.uLitter.value.x, 0, 'gone under snow');
  s.apply(4); assert.equal(litterUniforms.uLitter.value.x, 0, 'gone in spring');
  s.detail = false; assert.equal(litterUniforms.uLitter.value.y, 0); s.detail = true;
});

test('patch: chained before the wet ground, unique program keys, fragment only', () => {
  const run = (m) => { const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }; m.onBeforeCompile(sh, null); return sh; };
  const asphalt = wetGround(new THREE.MeshStandardMaterial(), 'asphalt'), sh = run(asphalt);
  assert.equal(asphalt.userData.leafLitter, 'asphalt');
  assert.ok(sh.fragmentShader.indexOf('uLitterMap, litUV') > 0 && sh.fragmentShader.indexOf('uLitterMap, litUV') < sh.fragmentShader.indexOf('wetW = uGroundWet.x'), 'litter before the wet darkening');
  assert.equal(sh.vertexShader, THREE.ShaderLib.standard.vertexShader); assert.ok(hasNativeVertexCompile(asphalt));
  assert.equal(sh.uniforms.uLitterMap, litterUniforms.uLitterMap, 'shared uniform objects');
  const paving = wetGround(new THREE.MeshStandardMaterial(), 'paving');
  assert.notEqual(asphalt.customProgramCacheKey(), paving.customProgramCacheKey());
  assert.match(asphalt.customProgramCacheKey(), /wet2099-asphalt\|litter2105-asphalt$/);
  const once = leafLitter(asphalt, 'grass'); assert.equal(once.userData.leafLitter, 'asphalt', 'patched once');
  assert.equal(run(asphalt).fragmentShader.split('uniform sampler2D uLitterMap').length, 2, 'declared once');
  for (const k of Object.keys(L.kinds)) assert.match(litterGLSL(k).surface, /if \(uLitter\.x > 0\.0\)/, 'out of season skips the branch');
  assert.throws(() => leafLitter(new THREE.MeshStandardMaterial(), 'lava'));
  const bed = leafLitter(new THREE.MeshStandardMaterial(), 'grass', '1.0 - grassBed');
  assert.match(run(bed).fragmentShader, /\* \(1\.0 - grassBed\)/, 'the river bed masks its mud');
  assert.notEqual(bed.customProgramCacheKey(), leafLitter(new THREE.MeshStandardMaterial(), 'grass').customProgramCacheKey());
});

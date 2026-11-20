// #2122: moss low on shaded north-facing walls (src/shademoss.js). node --test tools/shademosstest.mjs
// Needs `three` resolvable (node_modules/three → 0.170.0). Function-level checks: only north-facing, low faces; deterministic;
// a façade's mean tone stays within 2 %; the material chain and the phone no-op.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { noise as mossNoiseJS, mossAmount, mossColor, mossMix, mossGLSL, mossHeights, mossMaterial, shadeMoss, mossHue } from '../src/shademoss.js';
import { SHADE_MOSS as M, COLORS } from '../src/config.js';
import { vertexCompileSlack } from '../src/vertexcompile.js';

const N = { north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 }, east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, down: { x: 0, y: -1, z: 0 } };
const at = (n, x, y, z0 = 0) => ({ x: n.z ? x : z0, y, z: n.z ? z0 : x });
/** Mean / max moss over a face `len` m long from height y0 to y1 (ground at 0), sampled on a 2 cm grid. */
function stats(n, len, y0, y1, joint = 0) {
  let s = 0, k = 0, max = 0;
  for (let x = 0; x < len; x += 0.02) for (let y = y0; y < y1; y += 0.02) { const a = mossAmount(at(n, x + 3.17, y), n, y, joint); s += a; k++; max = Math.max(max, a); }
  return { mean: s / k, max };
}

test('only north-facing, low faces: none on south/east/west faces, tops or high up', () => {
  for (const d of ['south', 'east', 'west', 'up', 'down']) assert.equal(stats(N[d], 12, 0, 1.5, 1).max, 0, d);
  const low = stats(N.north, 12, 0, 0.5), mid = stats(N.north, 12, 0.5, 1.0), high = stats(N.north, 12, 1.6, 6, 1);
  assert(low.mean > 0.08 && low.max > 0.3, `visible low on the north face (${low.mean.toFixed(3)})`);
  assert(mid.mean < low.mean * 0.5, 'fades upwards');
  assert.equal(high.max, 0, 'none above the joint band');
  assert(low.max <= M.strength + 1e-9, 'discreet: never more than `strength`');
  const patchy = stats(N.north, 12, 0, 0.12); assert(patchy.mean < 0.85 * M.strength, 'patches, not a solid strip');
  const nne = { x: 0.3, y: 0, z: -0.954 }, sse = { x: 0.3, y: 0, z: 0.954 };
  assert(stats(nne, 12, 0, 0.5).mean > 0.5 * low.mean && stats(sse, 12, 0, 0.5).max === 0, 'by the normal: a slightly turned north face keeps it');
  assert(stats(N.north, 12, 0, 1.2, 1).mean > stats(N.north, 12, 0, 1.2, 0).mean * 1.3, 'greener in the joints');
  assert.equal(mossAmount(at(N.north, 1, -0.5), N.north, -0.5), 0, 'nothing for a mesh without heights (offset reads as underground)');
});

test('deterministic: world position only, no clock or randomness', () => {
  const a = stats(N.north, 6, 0, 0.8), b = stats(N.north, 6, 0, 0.8);
  assert.deepEqual(a, b);
  assert(!/Math\.random|performance\.now|Date\.now/.test(readFileSync(new URL('../src/shademoss.js', import.meta.url), 'utf8')));
});

test("a façade's mean tone stays within 2 % (brick, render, plinth), and the moss is green", () => {
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }, lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  for (const [name, hex, H, joint] of [['Hus L brick, ground floor', COLORS.brick, 3.0, 0.35], ['Å-hus brick façade', COLORS.brick, 9, 0.35],
    ['white render', 0xf1eee6, 3.0, 0.05], ['plinth', 0x6e3326, 1.0, 0]]) {
    const c = lin(hex), base = lum(c); let s = 0, k = 0;
    for (let x = 0; x < 12; x += 0.02) for (let y = 0; y < H; y += 0.02) { const m = mossMix(at(N.north, x + 0.71, y), N.north, y, joint); s += lum(mossColor(c, m.a, M, m.dark)); k++; }
    const d = Math.abs(s / k / base - 1);
    if (H >= 3) assert(d < 0.02, `${name}: mean tone ±2 % (${(d * 100).toFixed(2)} %)`);
    else assert(d < 0.05, `${name}: a low plinth alone still within 5 % (${(d * 100).toFixed(2)} %)`);
  }
  const hue = mossHue(); assert(hue[1] > hue[0] && hue[1] > hue[2] && Math.abs(0.2126 * hue[0] + 0.7152 * hue[1] + 0.0722 * hue[2] - 1) < 1e-9, 'green, unit luminance');
  const brick = lin(COLORS.brick), m = mossColor(brick, M.strength); assert(m[1] > brick[1] && m[0] < brick[0], 'shifts brick towards green');
  const sat = (c) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
  assert(sat(hue) < 0.5, `muted olive/grey-green, not lime (saturation ${sat(hue).toFixed(2)})`);
  const mortar = lin(COLORS.mortar), mj = mossColor(mortar, M.strength, M, M.joints.dark);
  assert(lum(mj) < lum(mortar) * 0.8 && sat(mj) < 0.5, 'a mossy joint is darker than the mortar and muted');
  assert(M.joints.dark < M.dark, 'joints darker than the band');
});

test('heights: baked over the ground in front of the face, cached, positions untouched', () => {
  const g = new THREE.PlaneGeometry(4, 2).rotateY(Math.PI).translate(0, 1, -2); // a north-facing wall at z = −2, y 0…2
  const before = g.attributes.position.array.slice(); const seen = [];
  mossHeights(g, (x, z) => { seen.push(z); return z < -2 ? 0.25 : 5; });
  assert.deepEqual(g.attributes.position.array, before);
  assert(seen.every((z) => z < -2), 'sampled outside the face (north of it), not inside the house');
  const h = g.attributes.mossHeight.array; for (let i = 0; i < h.length; i++) assert(Math.abs(h[i] - M.offset - (g.attributes.position.getY(i) - 0.25)) < 1e-5);
  assert(seen.length <= 4, 'one lookup per grid cell');
});

test('material chain: delegates, one copy, unique key, fragment-only; phones: no-op', () => {
  let calls = 0; const m = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  m.onBeforeCompile = function (s) { calls++; s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n// prior'); };
  m.customProgramCacheKey = () => 'prior-key';
  mossMaterial(m, 'map'); mossMaterial(m, 'bump'); // second call: no second patch
  const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  m.onBeforeCompile(sh, null);
  assert.equal(calls, 1); assert(sh.fragmentShader.includes('// prior'));
  assert.equal(sh.fragmentShader.split('float mossNoise(').length, 2); assert.equal(sh.vertexShader.split('attribute float mossHeight').length, 2);
  assert(sh.fragmentShader.indexOf('#include <roughnessmap_fragment>') < sh.fragmentShader.indexOf('mossA'));
  assert(sh.fragmentShader.includes('sampledDiffuseColor') && !sh.fragmentShader.includes('bumpMap, vBumpMapUv).r'), "'map' joints read the map");
  assert.equal(m.customProgramCacheKey(), 'prior-key|shademoss2122-map');
  const again = { vertexShader: sh.vertexShader, fragmentShader: sh.fragmentShader }; m.onBeforeCompile(again, null);
  assert.equal(again.fragmentShader.split('float mossNoise(').length, 2, 'an inherited mossy callback adds nothing');
  assert.equal(vertexCompileSlack(new THREE.MeshStandardMaterial()), 0); const plain = mossMaterial(new THREE.MeshStandardMaterial());
  assert.equal(vertexCompileSlack(plain), 0, 'audited: vertex positions unchanged');
  assert(mossGLSL('bump').body.includes('texture2D(bumpMap, vBumpMapUv).r') && !/texture2D|sampledDiffuseColor/.test(mossGLSL(null).body), 'joint kinds');
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()), key = mesh.material.customProgramCacheKey;
  shadeMoss(mesh, () => 0, null, true);
  assert(!mesh.geometry.attributes.mossHeight && mesh.material.customProgramCacheKey === key && !mesh.material.userData.shadeMoss, 'lite: nothing');
  shadeMoss(mesh, () => 0, null, false); assert(mesh.geometry.attributes.mossHeight && mesh.material.userData.shadeMoss === 'plain');
  assert.equal(shadeMoss(undefined, () => 0, null, false), undefined, 'an empty batch is fine');
});

test('wired into the wall batches of Hus L and the Å-husen (A/B/C), retaining walls and park stairs', () => {
  const ex = readFileSync(new URL('../src/exterior.js', import.meta.url), 'utf8'), su = readFileSync(new URL('../src/surroundings.js', import.meta.url), 'utf8');
  const unwet = (t) => t.replace(/wetSurface\(((?:[^()]|\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))*), '\w+'\)/g, '$1'); // (#2175's wetSurface wrapper: read through it)
  assert(/shadeMoss\(add\(bricks, (snowCap\()?brickMat\(\)\)?\), groundY, 'bump'\)/.test(unwet(ex)), 'Hus L brick'); // (#2123 may wrap the material)
  assert(!/shadeMoss\(add\(renders/.test(ex), 'Hus L render: all upper storeys (≥ 6 m), no program spent on it');
  const flat = unwet(su).replace(/snowCap\(((?:[^()]|\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))*)\)/g, '$1'); // (#2123's snowCap wrapper: read through it)
  for (const s of ["map: facadeTexture(), roughness: 0.95 })), groundY, 'map')", "map: facadeTexture(true), roughness: 0.95 })), groundY, 'map')", 'white), groundY, \'bump\')',
    "color: 0x6e3326, roughness: 0.95 })), groundY)", "map: historicBrick, roughness: 0.95, side: THREE.DoubleSide })), groundY, 'map')", 'concrete, SEASON.snow.paving), groundY)']) assert(flat.includes(s), s);
});

test('JS noise twin equals the GLSL mossNoise bilinear formula and stays within 0..1 (#2134)', () => {
  const fract = (x) => x - Math.floor(x), hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
  const mix = (p, q, t) => p * (1 - t) + q * t;
  const ref = (x, y) => { // GLSL: mix(mix(h(i), h(i+(1,0)), u.x), mix(h(i+(0,1)), h(i+(1,1)), u.x), u.y), u smoothstepped
    const ix = Math.floor(x), iy = Math.floor(y); let ux = x - ix, uy = y - iy; ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy);
    return mix(mix(hash(ix, iy), hash(ix + 1, iy), ux), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy);
  };
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 5000; i++) {
    const x = (rnd() - 0.5) * 200, y = (rnd() - 0.5) * 200, v = mossNoiseJS(x, y);
    assert(Math.abs(v - ref(x, y)) < 1e-6, `noise(${x}, ${y}) = ${v} vs ${ref(x, y)}`);
    assert(v >= -1e-9 && v <= 1 + 1e-9, `range ${v}`);
  }
});

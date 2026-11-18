// #2097: the parked cars' finish (src/carfinish.js). Function-level checks: the paint/trim/far materials carry the shared
// outdoor reflection without an onBeforeCompile of their own (site instance batching keeps its native vertex stage), the
// trim parts read their own roughness/metalness texel (matte plastic, metallic chrome), the batch layout stays four
// geometries, the car LOD's clones follow the night, and a lamp-washed + dithered clone gets each patch once (#2090).
// node --test tools/carfinishtest.mjs (three 0.170.0 resolvable as 'three').
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// a canvas stub (carmodel.js draws its screen/logo maps; neighborglass.js its cubemap faces)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => ((t[p] = v), true) }) }) };
const { parkedCarMaterials, farCarMaterial, trimSurfaceMap, trimU, TRIM_PARTS, setCarFinishNight } = await import('../src/carfinish.js');
const { CAR_FINISH: C } = await import('../src/config.js');
const { outdoorReflection } = await import('../src/neighborglass.js');
const { carGeometry } = await import('../src/streetlife.js');
const { addCarLod } = await import('../src/viewlod.js');
const { buildLampWashes } = await import('../src/lampwash.js');
const { hasNativeVertexCompile } = await import('../src/vertexcompile.js');

const texel = (u) => { const m = trimSurfaceMap(), i = Math.floor(u * m.image.width); return { rough: m.image.data[i * 4 + 1] / 255, metal: m.image.data[i * 4 + 2] / 255 }; };

test('paint, trim and far materials: the shared outdoor reflection, calm roughness, no shader patch of their own', () => {
  const [paint, trim, glass, tyre] = parkedCarMaterials(), far = farCarMaterial();
  for (const m of [paint, trim, far]) {
    assert.equal(m.envMap, outdoorReflection(), 'one shared cubemap (no per-car maps)');
    assert.ok(m.envMapIntensity > 0 && m.envMapIntensity < 1, 'a mild reflection');
    assert.ok(hasNativeVertexCompile(m), 'no onBeforeCompile: lamp wash/dither chain as before');
  }
  assert.ok(paint.roughness <= 0.25 && paint.metalness < 0.35, 'clear coat: low roughness, less metal than the old 0.35');
  assert.ok(Math.abs(paint.color.r * (1 - paint.metalness) - 0.65) < 0.02, 'the diffuse tone of the old paint (1 − 0.35) is kept');
  assert.ok(far.roughness > paint.roughness && far.envMapIntensity < paint.envMapIntensity, 'far cars: rougher, dimmer');
  assert.ok(tyre.roughness >= 0.9 && tyre.metalness === 0 && !tyre.envMap, 'matte rubber');
  assert.equal(glass.roughness, 0.05); assert.equal(glass.metalness, 0.55);
  assert.equal(trim.roughnessMap, trimSurfaceMap()); assert.equal(trim.metalnessMap, trimSurfaceMap());
  assert.equal(trimSurfaceMap().generateMipmaps, false); assert.equal(trimSurfaceMap().minFilter, THREE.NearestFilter);
});

test('the trim batch: every part reads its own texel; plastic matte, chrome/rims metallic; still four geometries', () => {
  assert.deepEqual(TRIM_PARTS, ['black', 'roof', 'lens', 'led', 'blink', 'tail', 'chrome', 'rim']);
  const geos = carGeometry();
  assert.equal(geos.length, 4, '[paint, trim, glass, tyres]: no new batch');
  const trim = geos[1], uv = trim.attributes.uv, col = trim.attributes.color;
  assert.ok(uv && col && uv.count === trim.attributes.position.count);
  const seen = new Set();
  for (let i = 0; i < uv.count; i++) { assert.equal(uv.getY(i), 0.5); seen.add(uv.getX(i)); }
  for (const u of seen) assert.ok(TRIM_PARTS.some((k) => Math.abs(trimU(k) - u) < 1e-6), 'a part texel centre');
  assert.ok(seen.size >= 4, 'several parts present');
  const black = texel(trimU('black')), chrome = texel(trimU('chrome')), rim = texel(trimU('rim'));
  assert.ok(black.rough >= 0.6 && black.metal === 0, 'black plastic: matte, dielectric');
  assert.ok(chrome.metal >= 0.8 && chrome.rough <= 0.3, 'chrome');
  assert.ok(rim.metal >= 0.6 && rim.rough > chrome.rough, 'rims: metal, a little rougher');
  for (const g of [geos[0], geos[2], geos[3]]) assert.ok(!g.attributes.uv, 'paint/glass/tyres stay uv-less as before');
});

test('car LOD clones follow the night; a lamp-washed, dithered clone gets each patch once with a unique program key', () => {
  const mats = parkedCarMaterials(), parent = new THREE.Group();
  const batches = mats.map((m) => { const b = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 1.5, 1.7), m, 2); b.setMatrixAt(1, new THREE.Matrix4().makeTranslation(60, 0, 0)); parent.add(b); return b; });
  batches[0].setColorAt(0, new THREE.Color(1, 0, 0)); batches[0].setColorAt(1, new THREE.Color(0, 0, 1));
  const lamp = { pos: { x: 1, y: 1.5, z: 1 }, color: 0xffe2b8, intensity: 1, range: 4, level: 0, segs: [[0, 0, 3, 0]] };
  const wash = buildLampWashes(null, null, [{ owner: null, lamp, k: 1 }], { boxes: [{ x0: 0, x1: 3, z0: 0, z1: 3, y0: 0, y1: 3 }] });
  wash.patch(parent);
  const lo = addCarLod(batches);
  assert.ok(lo); wash.patch(parent); // the periodic patch reaches the clones too
  setCarFinishNight(0);
  const day = batches[0].material.envMapIntensity, farDay = lo.material.envMapIntensity;
  assert.ok(Math.abs(day - C.reflectionDay) < 1e-9 && farDay > 0);
  setCarFinishNight(1);
  assert.ok(Math.abs(batches[0].material.envMapIntensity - C.reflectionNight) < 1e-9, 'the LOD clone dims at night');
  assert.ok(lo.material.envMapIntensity < farDay * 0.2 && batches[1].material.envMapIntensity < day);
  setCarFinishNight(0);
  assert.equal(batches[0].material.envMapIntensity, day);
  const compile = (m) => { const s = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }; m.onBeforeCompile(s, null); return s.fragmentShader; };
  const keys = new Set();
  for (const m of [...batches.map((b) => b.material), lo.material]) {
    const fs = compile(m);
    assert.equal(fs.split('vec3 lampWash(vec3').length - 1, 1, 'the wash exactly once (#2090)');
    keys.add(m.customProgramCacheKey());
  }
  assert.equal(keys.size, 2, 'near (washed + near dither) and far (washed + far dither) keep distinct program keys');
});

test('a set without the outdoor finish (the underground garage) keeps its plain far paint: no sky reflection indoors', () => {
  const parent = new THREE.Group(), batches = [0, 1].map(() => { const b = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.3 }), 1); parent.add(b); return b; });
  const lo = addCarLod(batches);
  assert.ok(lo && !lo.material.envMap && !batches[0].material.envMap);
  assert.equal(lo.material.roughness, 0.3); assert.equal(lo.material.metalness, 0.3);
});

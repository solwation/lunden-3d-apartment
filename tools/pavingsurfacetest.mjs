// #2074: the authored half-bond layout, independent scalar channels and actual sheltered/exposed snow policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pavingSurfaceData, pavingSurfaceTexture, pavingMaterial } from '../src/pavingsurface.js';
import { PATIO, PAVING_SURFACE as S, SEASON } from '../src/config.js';
import { registerSnow, applySeason } from '../src/seasons.js';
const sample = (d, x, y) => [...d.data.slice(4 * (y * d.size + x), 4 * (y * d.size + x) + 2)];

test('existing rounded metre layout keeps half bond, periodic joints and a soft edge', () => {
  const d = pavingSurfaceData(), px = Math.round(PATIO.paving.slab * S.ppm);
  assert.equal(d.size, 384); assert.equal(d.data.byteLength, 589824);
  for (const x of [0, d.size - 1, px, px * 2]) assert.equal(sample(d, x, px / 2)[0], 0);
  assert.equal(sample(d, px / 2, px * 1.5)[0], 0, 'the next row shifts by half a slab');
  assert.equal(sample(d, px, px * 1.5)[0], 255);
  assert.equal(sample(d, px / 2, 0)[0], 0); assert.equal(sample(d, px / 2, d.size - 1)[0], 0);
  assert(sample(d, 1, px / 2)[0] > 0 && sample(d, 1, px / 2)[0] < 255);
  assert.equal(sample(d, 0, px / 2)[1], Math.round(S.groutRoughness * 255));
  assert.equal(sample(d, px / 2, px / 2)[1], Math.round(S.faceRoughness * 255));
});

test('structural height never follows colour speckle; the shared scalar texture is linear and registered', () => {
  assert.deepEqual(pavingSurfaceData(), pavingSurfaceData({ ...PATIO.paving, color: [255, 0, 0], jointColor: '#ffffff', seed: 999 }));
  const t = pavingSurfaceTexture(); assert.equal(t, pavingSurfaceTexture());
  assert.equal(t.colorSpace, THREE.NoColorSpace); assert.equal(t.flipY, true);
  assert.equal(t.repeat.x, 1 / (PATIO.paving.slab * 6)); assert.equal(t.repeat.y, t.repeat.x);
  assert.equal(t.wrapS, THREE.RepeatWrapping); assert.equal(t.wrapT, THREE.RepeatWrapping);
  assert.equal(t.minFilter, THREE.LinearMipmapLinearFilter); assert(t.generateMipmaps);
  assert(S.depth > 0 && S.depth < .003);
});

test('existing snow removes exposed auxiliary maps and restores cache; sheltered portik stays unchanged', () => {
  const map = new THREE.Texture(), m = pavingMaterial(map, { snow: true }), shelteredMap = new THREE.Texture();
  const sheltered = pavingMaterial(shelteredMap), packed = pavingSurfaceTexture();
  registerSnow(m, SEASON.snow.paving);
  const unrelated = new THREE.MeshStandardMaterial({ roughness: .43 }); registerSnow(unrelated, 0xffffff);
  for (const month of [6, 1, 7, 12, 6]) {
    applySeason(month); const snow = SEASON.snowMonths.includes(month);
    assert.equal(m.map, snow ? null : map); assert.equal(m.bumpMap, snow ? null : packed);
    assert.equal(m.roughnessMap, snow ? null : packed); assert.equal(m.roughness, snow ? .95 : 1);
    assert.equal(m.color.getHex(), snow ? SEASON.snow.paving : 0xffffff);
    assert.equal(sheltered.map, shelteredMap); assert.equal(sheltered.bumpMap, packed);
    assert.equal(sheltered.roughnessMap, packed); assert.equal(sheltered.roughness, 1);
    assert.equal(unrelated.roughness, .43); assert.equal(unrelated.bumpMap, null);
  }
});

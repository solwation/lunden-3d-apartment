// #2103: street wear: deterministic road frames from SITE.roads, positions untouched, the asphalt/paint chains keep #2072's
// aggregate and #2099's wet patch (unique program keys), extra patches on the street-level asphalt.
// node --test tools/streetweartest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { roadFrameAt, addRoadFrame, trackWeight, streetWear } from '../src/streetwear.js';
import { asphaltMaterial } from '../src/asphaltsurface.js';
import { wetGround } from '../src/wetground.js';
import { onRoad } from '../src/roads.js';
import { SITE, STREET_WEAR as SW } from '../src/config.js';
import { hasNativeVertexCompile } from '../src/vertexcompile.js';

const physical = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader });

test('road frame: signed metres across the nearest local centre line and its half width; null far away', () => {
  const c = roadFrameAt(-30, -27);
  assert.ok(Math.abs(c.across) < 1e-6 && Math.abs(c.half - 3) < 1e-6, `Sankt Lars väg's centre (${JSON.stringify(c)})`);
  const n = roadFrameAt(-30, -24.4), s = roadFrameAt(-30, -29.6);
  assert.ok(Math.abs(Math.abs(n.across) - 2.6) < 1e-6 && Math.abs(Math.abs(s.across) - 2.6) < 1e-6 && Math.sign(n.across) === -Math.sign(s.across), 'both edges, opposite signs');
  const k = roadFrameAt(-75.8, 5); assert.ok(Math.abs(k.across) < 1e-6 && Math.abs(k.half - 2.9) < 1e-6, 'Karpvägen');
  assert.equal(roadFrameAt(-30, 60), null, 'the courtyard: no road near');
  const sl = SITE.roads.find((r) => r.name === 'Sankt Lars väg'), j = roadFrameAt(-10.25, -24.3, sl);
  assert.ok(Math.abs(Math.abs(j.across) - 2.7) < 1e-6 && j.half === 3, "at the drive's mouth a strip keeps its own road's lanes");
  assert.ok(Math.abs(roadFrameAt(-10.25, -24.3).half - 2.75) < 1e-6, "(the nearest centre line there is the drive's)");
});

test('wheel tracks: two per lane at the gauge, none off the asphalt or without a frame', () => {
  const T = SW.tracks;
  for (const half of [3, 3.5]) { const lane = half / 2; for (const a of [lane - T.gauge, lane + T.gauge, -(lane - T.gauge), -(lane + T.gauge)]) assert.ok(Math.abs(trackWeight(a, half) - 1) < 1e-9); }
  assert.ok(trackWeight(1.5, 3) < 0.01, 'the lane centre between the wheels');
  assert.ok(Math.abs(trackWeight(T.gauge, 2.75) - 1) < 1e-9, 'a 5.5 m drive: one lane on the centre line');
  assert.equal(trackWeight(3.2, 3), 0); assert.equal(trackWeight(0.78, 0), 0);
});

test('addRoadFrame: deterministic, positions/index untouched, only roadFrame added', () => {
  const make = () => new THREE.PlaneGeometry(90, 8, 30, 4).rotateX(-Math.PI / 2).translate(-30, 0, -27);
  const a = make(), pos = a.attributes.position.array.slice(), idx = a.index.array.slice(), keys = Object.keys(a.attributes);
  addRoadFrame(a);
  assert.deepEqual(a.attributes.position.array, pos); assert.deepEqual(a.index.array, idx);
  assert.deepEqual(Object.keys(a.attributes).sort(), [...keys, 'roadFrame'].sort());
  assert.deepEqual(addRoadFrame(make()).attributes.roadFrame.array, a.attributes.roadFrame.array, 'same input, same frame');
});

test('asphalt: #2072 aggregate, wear, then #2099 wet; one copy, unique keys; vertex positions native', () => {
  const m = asphaltMaterial(), s = physical();
  m.onBeforeCompile(s, null);
  const f = s.fragmentShader;
  assert.ok(f.includes('asphaltTone') && f.includes('wearTrack') && f.includes('uGroundWet'), 'all three patches');
  assert.equal((f.match(/vec2 wearTrack/g) || []).length, 1);
  assert.ok(f.indexOf('float wearRough') < f.indexOf('asphaltTone'), 'wear sits in the map section, inside USE_MAP');
  assert.ok(f.indexOf('float wetW') < f.indexOf('roughnessFactor *= wearRough'), 'the wet film is computed with the same roughness pipeline');
  assert.match(m.customProgramCacheKey(), /^asphalt-surface-2072\|wear2103-asphalt\|wet2099-asphalt$/);
  assert.ok(hasNativeVertexCompile(m), 'audited: only varyings added');
  const stripped = s.vertexShader.replace(/\n\nattribute vec2 roadFrame;\nvarying vec2 vRoadFrame;\nvarying vec2 vWearXZ;/, '').replace(/\n\nvRoadFrame = roadFrame;\nvWearXZ = [^\n]*;/, '');
  assert.equal(stripped, THREE.ShaderLib.physical.vertexShader, 'nothing else in the vertex shader changes');
  assert.ok(/#ifdef USE_MAP\n\{[^]*wearTrack\(vRoadFrame[^]*\}\n#endif/.test(f), 'snow (no map) skips the wear');
});

test('paint: own key, chained under wet; the patches lie on street-level asphalt clear of the old ones and the crossing', () => {
  const p = wetGround(streetWear(new THREE.MeshStandardMaterial({ roughness: 0.7 }), 'paint'), 'paint');
  const s = physical(); p.onBeforeCompile(s, null);
  assert.ok(s.fragmentShader.includes('vec3(') && s.fragmentShader.includes('uGroundWet'));
  assert.match(p.customProgramCacheKey(), /\|wear2103-paint\|wet2099-paint$/);
  assert.notEqual(p.customProgramCacheKey(), asphaltMaterial().customProgramCacheKey());
  assert.throws(() => streetWear(new THREE.MeshStandardMaterial(), 'gravel'));
  const rects = [...SITE.street.patches, ...SW.patches].map(([x, z, w, d]) => [x - w / 2, x + w / 2, z - d / 2, z + d / 2]), cr = SITE.street.crossing;
  for (const [i, [x0, x1, z0, z1]] of SW.patches.map(([x, z, w, d]) => [x - w / 2, x + w / 2, z - d / 2, z + d / 2]).entries()) {
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) assert.ok(onRoad(x, z, -0.2), `patch ${i} corner (${x}, ${z}) on the asphalt`);
    assert.ok(z0 > -30 && z1 < 0 && x1 < 28, 'the y = 0 street level north of Hus L / the east leg');
    for (const [j, r] of rects.entries()) if (j !== SITE.street.patches.length + i) assert.ok(x1 < r[0] || x0 > r[1] || z1 < r[2] || z0 > r[3], `patch ${i} clear of patch ${j}`);
    assert.ok(x1 < cr.x0 || x0 > cr.x1 || z1 < cr.z0 || z0 > cr.z1, 'clear of the zebra');
  }
});

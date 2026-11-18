// #2104: street lamp halos — one quad per head at that head, no light objects, a single shader patch (fog fade + billboard)
// with its own program cache key, hidden by day and fading with the lamps' glow; the lamp wash leaves the basic material alone.
// node --test tools/lamphalotest.mjs (three 0.170.0 resolvable as 'three').
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { haloGeometry, haloMaterial, buildLampHalos, fadeHalos } from '../src/lamphalo.js';
import { buildLampWashes } from '../src/lampwash.js';
import { SITE } from '../src/config.js';

globalThis.document ??= { createElement: () => ({ getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
const count = (s, needle) => s.split(needle).length - 1;
const compile = (m) => { const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader }; m.onBeforeCompile(shader, null); return shader; };
const at = Float32Array.from([1, 6.47, 2, 7, -30, 4.9, 5, 5, 12, 6.5, -8, 7]);

test('one quad per head, centred under its glass, path lamps smaller', () => {
  const g = haloGeometry(at, { drop: 0.04, scale: (i) => (i === 1 ? 0.75 : 1) });
  assert.equal(g.index.count, 3 * 6);
  const p = g.attributes.position, c = g.attributes.haloCorner;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) {
    const v = i * 4 + k;
    assert.deepEqual([p.getX(v), p.getY(v), p.getZ(v)].map((x) => +x.toFixed(4)), [at[i * 4], +(at[i * 4 + 1] - 0.04).toFixed(4), at[i * 4 + 2]]);
    assert.equal(Math.abs(c.getX(v)), 1); assert.equal(Math.abs(c.getY(v)), 1);
    assert.equal(c.getZ(v), i === 1 ? 0.75 : 1);
  }
});

test('the material is patched once: billboard + fog fade, own cache key, additive and not lit', () => {
  const m = haloMaterial(0xffd9a0, SITE.street.lamps.halo), s = compile(m);
  assert.ok(m.isMeshBasicMaterial && m.blending === THREE.AdditiveBlending && !m.depthWrite && m.fog);
  assert.equal(count(s.vertexShader, 'attribute vec3 haloCorner;'), 1);
  assert.equal(count(s.vertexShader, 'mvPosition.xy += haloCorner.xy * haloS;'), 1);
  assert.equal(count(s.vertexShader, '#include <project_vertex>'), 0);
  assert.equal(count(s.fragmentShader, 'gl_FragColor.a *= vHaloFade;'), 1);
  assert.equal(count(s.fragmentShader, 'gl_FragColor.a *= 1.0 - fogFactor;'), 1);
  assert.ok(s.uniforms.uHalo && s.uniforms.uHaloViewH);
  assert.equal(m.customProgramCacheKey(), 'street-lamp-halo-v1');
  // the lamp wash only patches lit materials: the halo keeps its single patch
  const lamp = { pos: { x: 1, y: 1.5, z: 1 }, color: 0xffe2b8, intensity: 1, range: 4, level: 0, segs: [[0, 0, 3, 0]] };
  const wash = buildLampWashes(null, null, [{ owner: null, lamp, k: 1 }], { boxes: [{ x0: 0, x1: 3, z0: 0, z1: 3, y0: 0, y1: 3 }] });
  const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), m); scene.add(mesh);
  const before = m.onBeforeCompile; wash.patch(scene); wash.patch(scene);
  assert.equal(m.onBeforeCompile, before);
  assert.equal(count(compile(m).fragmentShader, 'lampWash'), 0);
});

test('no lights, one mesh, hidden by day and following the glow at night', () => {
  const halos = buildLampHalos(at, SITE.street.lamps.halo);
  let lights = 0; halos.traverse((o) => { if (o.isLight) lights++; });
  assert.equal(lights, 0);
  assert.equal(halos.children.length, 0);
  assert.equal(halos.visible, false);
  fadeHalos(halos, 0, 0.75); assert.equal(halos.visible, false); assert.equal(halos.material.opacity, 0);
  fadeHalos(halos, 0.5, 0.75); assert.equal(halos.visible, true); assert.equal(halos.material.opacity, 0.375);
  fadeHalos(halos, 1, 0.75); assert.equal(halos.material.opacity, 0.75);
  assert.equal(halos.name, 'streetLampHalos');
  assert.doesNotMatch(halos.name, /^streetLamp(Posts|Heads)$/); // siteinstancebatch.js leaves it native
});

test('the street pools get one core patch on top of the fog fade, with their own cache key and the shared wet uniform', async () => {
  const { glowMaterial, fadeGlowWithFog } = await import('../src/groundglow.js');
  const { poolCore } = await import('../src/lamphalo.js');
  const { wetUniforms } = await import('../src/wetground.js');
  const m = poolCore(fadeGlowWithFog(glowMaterial(0xffc887)), SITE.street.lamps.pool), s = compile(m);
  assert.equal(count(s.fragmentShader, 'uPoolCore.x'), 1);
  assert.equal(count(s.fragmentShader, 'uniform vec3 uGroundWet;'), 1);
  assert.equal(count(s.fragmentShader, 'gl_FragColor.a *= 1.0 - fogFactor;'), 1);
  assert.equal(s.uniforms.uGroundWet, wetUniforms.uGroundWet);
  assert.equal(m.customProgramCacheKey(), 'street-lamp-pool-core-v1');
  assert.notEqual(m.customProgramCacheKey(), fadeGlowWithFog(glowMaterial(0)).customProgramCacheKey());
});

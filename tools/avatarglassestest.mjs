// #2173: clear lenses, env reflection and the rounder frames: the lens coverage by angle (faint head-on, strong at grazing, glare where the room is
// bright), the uLight scaling of the reflection, the frame segment counts and the vertex collapse / shader hooks.
// node --test tools/avatarglassestest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { lensAlpha, grazing, fresnel, envReflect, superellipse, roundRim, squareRim, lensShape, bar } from '../src/avatarglasses.js';
import { envShade, envDecl, eyeEnv, envKey, curveLens } from '../src/avatarenv.js';
import { AVATAR_ENV as E } from '../src/config.js';
import * as THREE from 'three';

const FP = { rimRound: 8, specs: 10, studs: 21, drops: 23, chain: 30, pearls: 31, goldChain: 33, lensRound: 27, lensSquare: 28, aviator: 29 };

test('lens coverage: faint head-on, stronger at grazing angles, monotonic', () => {
  const head = lensAlpha(1), mid = lensAlpha(0.5), graze = lensAlpha(0.1);
  assert.ok(Math.abs(head - E.lens.head) < 1e-9);
  assert.ok(head > 0.05 && head < 0.3, 'faint but not invisible head-on');
  assert.ok(head < mid && mid < graze);
  assert.ok(graze > 0.6 && graze <= 1);
  assert.equal(grazing(1), 0);
  assert.equal(grazing(0), 1);
});

test('lens glare: a bright reflected room adds coverage, a dark room (uLight) removes it', () => {
  const dull = lensAlpha(0.8, 0.3, 1), bright = lensAlpha(0.8, 1.2, 1), dark = lensAlpha(0.8, 1.2, 0.2);
  assert.ok(bright > dull + 0.2);
  assert.ok(Math.abs(dark - dull) < 1e-9, 'night: no glare, only the faint glass');
  assert.ok(lensAlpha(0, 5, 1) <= 1);
});

test('reflection scales with uLight and rises with the angle (Fresnel)', () => {
  assert.equal(envReflect(1, 0.9, 0.8, 0.6, 0), 0);
  assert.ok(Math.abs(envReflect(1, 0.9, 0.8, 0.6, 0.5) * 2 - envReflect(1, 0.9, 0.8, 0.6, 1)) < 1e-9);
  assert.ok(fresnel(0.06, 0.1) > fresnel(0.06, 1) * 3);
  assert.ok(Math.abs(fresnel(0.06, 1) - 0.06) < 1e-9);
});

test('the frames are rounder than before (the old torus had 4 radial segments, the square rim four boxes)', () => {
  const ring = roundRim(0.0225, 0.0018), sq = squareRim(0.0225, 0.0165, 0.0012);
  assert.equal(E.frame.round[0] > 4, true);
  assert.equal(ring.parameters.radialSegments, E.frame.round[0]);
  assert.equal(ring.parameters.tubularSegments, E.frame.round[1]);
  assert.equal(sq.parameters.tubularSegments, E.frame.square[1]);
  assert.equal(sq.parameters.radialSegments, E.frame.square[0]);
  assert.ok(ring.index.count / 3 <= 2 * 5 * 24 && sq.index.count / 3 <= 2 * 4 * 32, 'triangle budget per rim');
  const bb = new THREE.Box3().setFromBufferAttribute(sq.attributes.position), size = bb.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 0.045 - 0.0024) < 0.0008 && Math.abs(size.y - 0.033 - 0.0024) < 0.0008, 'the old rectangle size is kept');
});

test('square rim is a rounded rectangle: corners cut in, edges at the old half sizes', () => {
  const pts = superellipse(0.0225, 0.0165, E.frame.n, 40);
  const corner = pts.reduce((m, [x, y]) => Math.max(m, Math.abs(x) / 0.0225 + Math.abs(y) / 0.0165), 0);
  assert.ok(corner < 2 - 0.05 && corner > 1.2, 'inside the sharp rectangle, outside the ellipse');
  assert.ok(Math.abs(Math.max(...pts.map((p) => p[0])) - 0.0225) < 1e-6);
});

test('lenses and bars: a lens covers its rim, normals curve outwards, a bar spans a to b', () => {
  for (const k of [1, 2]) {
    const g = curveLens(lensShape(k, 0.0225, 0.0165));
    const n = g.attributes.normal, p = g.attributes.position;
    for (let i = 0; i < n.count; i++) assert.ok(n.getZ(i) > 0.5 && Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5);
    let tilted = false;
    for (let i = 0; i < n.count; i++) if (p.getX(i) > 0.01 && n.getX(i) > 0.1) tilted = true;
    assert.ok(tilted, 'a rim vertex tilts outward');
  }
  const b = bar(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.1), 0.001);
  const bb = new THREE.Box3().setFromBufferAttribute(b.attributes.position);
  assert.ok(Math.abs(bb.max.z - 0.1) < 1e-6 && Math.abs(bb.min.z) < 1e-6);
});

test('shader hooks: lens alpha-to-coverage with a no-MSAA fallback, env before the light level, class masks, key', () => {
  const sh = envShade(FP);
  assert.match(sh, /avLens/); assert.match(sh, /diffuseColor\.a/); assert.match(sh, /uFly\.y < 0\.5/);
  assert.match(sh, /outgoingLight \+= avEnvAt/);
  assert.match(sh, new RegExp(`step\\(${FP.lensRound}\\.0 - 0\\.5`));
  assert.match(envDecl(), /textureLod\(uAvEnv/);
  assert.match(eyeEnv(), /eG \+= avEnvAt/);
  assert.equal(envKey(), '-env2173');
});

test('glassesExtraTriangles is the real delta over the old 388-triangle frames', async () => {
  const { glassesExtraTriangles } = await import('../src/avatarglasses.js');
  const d = glassesExtraTriangles();
  assert.ok(d > 0 && d < 900, `+${d} triangles per avatar`);
});

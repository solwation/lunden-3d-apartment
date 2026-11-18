// #2107: the garments' seams, ribs, hems and pockets: placed on the body's own landmarks in bind-pose coordinates, deterministic, mirrored
// between the sides, following the look's garments, and spliced into the avatar's one material. Function-level checks (no frozen file diffs).
// node --test tools/avatarseamtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_SEAM as M, AVATAR_SURFACE as SURFACE } from '../src/config.js';
import { seamFrame, seamLook, seamAt, seamUniforms, setSeamLook, seamDecl, seamKey, SEAM_DETAIL } from '../src/avatarseam.js';
import { Avatar } from '../src/avatar.js';
import { decodeAvatarLook } from '../src/config.js';

const TEE = { cut: 0, sleeves: 0, legs: 0 }, SWEATER = { cut: 0, sleeves: 1, legs: 0 }, HOODIE = { cut: 2, sleeves: 1, legs: 2 }, VEST = { cut: 1, sleeves: 0, legs: 1 };
const near = (p, region, torso, lk, kind) => seamAt(p, region, torso, lk).find((s) => s.kind === kind);
const on = (p, region, torso, lk, kind, eps = 0.002) => { const s = near(p, region, torso, lk, kind); return !!s && Math.abs(s.d) < eps; };

test('the garment kinds and edges follow the look', () => {
  const F = seamFrame();
  assert.deepEqual([TEE, SWEATER, HOODIE, VEST].map((l) => seamLook(l).top), ['tshirt', 'sweater', 'hoodie', 'vest']);
  assert.deepEqual([TEE, SWEATER, HOODIE, VEST].map((l) => seamLook(l).rib), [false, true, true, false]);
  assert.equal(seamLook(TEE).sleeveY, F.sleeve.short); assert.equal(seamLook(SWEATER).sleeveY, F.sleeve.long); assert.equal(seamLook(VEST).sleeveY, 0);
  assert.ok(seamLook(HOODIE).hemY < seamLook(TEE).hemY, 'the hoodie hangs lower');
  assert.equal(seamLook(VEST).legY, F.leg.shorts); assert.equal(seamLook(TEE).legY, F.leg.long);
  assert.equal(seamLook(HOODIE).jeans, false); assert.equal(seamLook(TEE).jeans, true);
  // the landmarks come from the skeleton and #2001's tables: the armhole between its rows, the collar at the top ring, edges ordered
  assert.ok(F.hole.bottom < F.hole.centre && F.hole.centre < F.hole.top && F.hole.top < F.neck.y);
  assert.ok(F.sleeve.long < F.sleeve.short && F.sleeve.short < F.hole.bottom && F.leg.long < F.leg.shorts && F.leg.shorts < M.crotch);
  assert.ok(M.waist[0] + M.waist[1] > F.hem.tee - 0.02 && M.waist[0] < F.hem.tee, 'the waistband shows just under a T-shirt');
  assert.ok(M.back[1] + M.back[3] < M.yoke[0] + M.yoke[1] * (M.back[0] - M.back[2]) && M.yoke[0] + M.yoke[1] * 0.16 < M.waist[0], 'pockets under the yoke under the band');
});

test('seams sit on their landmarks and nowhere near the plain panels', () => {
  const F = seamFrame();
  // the top: side seam at the waist's side, shoulder seam over the shoulder, underarm seam on the sleeve's inside
  assert.ok(on({ x: 0.17, y: 1.1, z: M.sideZ }, 1, 1, TEE, 'side'));
  assert.ok(on({ x: 0.12, y: F.neck.y - 0.03, z: M.shoulderZ }, 1, 1, TEE, 'shoulder'));
  assert.ok(on({ x: F.shoulderX - 0.03, y: 1.2, z: 0 }, 1, 0, TEE, 'underarm'));
  assert.ok(on({ x: 0.17, y: F.hole.top, z: 0 }, 1, 0, SWEATER, 'armhole') && on({ x: 0.17, y: F.hole.centre, z: M.armhole[1] }, 1, 1, SWEATER, 'armhole'));
  // the front of the chest carries none of them
  const chest = seamAt({ x: 0.05, y: 1.2, z: 0.12 }, 1, 1, TEE).filter((s) => Math.abs(s.d) < 0.01);
  assert.deepEqual(chest, []);
  // the trousers: outseam on the outside of the knee, inseam between the legs, the back seam at the middle of the seat
  assert.ok(on({ x: F.kneeX + 0.05, y: 0.46, z: M.sideZ }, 2, 0, TEE, 'outseam'));
  assert.ok(on({ x: F.kneeX - 0.05, y: 0.46, z: 0 }, 2, 0, TEE, 'inseam'));
  assert.ok(on({ x: 0, y: 0.81, z: -0.1 }, 2, 0, TEE, 'backSeam'));
  assert.ok(on({ x: F.kneeX + 0.05, y: 0.46, z: M.sideZ }, 2, 0, TEE, 'outseam'));
  assert.equal(near({ x: 0.05, y: 0.46, z: 0.06 }, 2, 0, TEE, 'outseam'), undefined, 'the shin front is no outseam');
  // the front pocket's opening runs from the waistband down to the side, the back pockets on the seat
  assert.ok(on({ x: M.pocket[0] - M.pocket[2] * Math.cos(0.5), y: M.pocket[1] - M.pocket[3] * Math.sin(0.5), z: 0.1 }, 2, 0, TEE, 'pocket'));
  assert.ok(on({ x: M.pocket[0] - M.pocket[2] * Math.cos(1.3), y: M.pocket[1] - M.pocket[3] * Math.sin(1.3), z: 0.1 }, 2, 0, TEE, 'pocket'));
  assert.ok(on({ x: M.back[0], y: M.back[1] - M.back[3], z: -0.1 }, 2, 0, TEE, 'backPocket'));
  assert.ok(near({ x: M.back[0], y: M.back[1], z: -0.1 }, 2, 0, TEE, 'backPocket').d < -0.03, 'inside the pocket');
  // the jeans have a yoke, the wide trousers none
  assert.ok(near({ x: 0.05, y: 0.81, z: -0.1 }, 2, 0, TEE, 'yoke')); assert.equal(near({ x: 0.05, y: 0.81, z: -0.1 }, 2, 0, HOODIE, 'yoke'), undefined);
});

test('ribs, hems and bindings follow the garment', () => {
  const F = seamFrame();
  const hem = (lk, p, t) => seamAt(p, 1, t, lk).map((s) => s.kind);
  assert.ok(hem(SWEATER, { x: 0.1, y: F.hem.tee + 0.02, z: 0.1 }, 1).includes('hemRib'));
  assert.ok(hem(TEE, { x: 0.1, y: F.hem.tee + 0.02, z: 0.1 }, 1).includes('hem'));
  assert.ok(hem(SWEATER, { x: 0.2, y: F.sleeve.long + 0.02, z: 0.03 }, 0).includes('cuff'));
  assert.ok(hem(TEE, { x: 0.2, y: F.sleeve.short + 0.01, z: 0.04 }, 0).includes('sleeveHem'));
  assert.ok(hem(TEE, { x: 0, y: F.neck.y, z: F.neck.rz }, 1).includes('neckRib') && hem(VEST, { x: 0, y: F.neck.y, z: F.neck.rz }, 1).includes('neckBind'));
  assert.ok(!hem(HOODIE, { x: 0, y: F.neck.y, z: F.neck.rz }, 1).some((k) => /^neck/.test(k)), 'the hood covers the collar');
  // the vest: the armhole is a bound edge on the body, no sleeve seams at all
  assert.ok(hem(VEST, { x: 0.17, y: F.hole.top + 0.003, z: 0 }, 1).includes('armBind'));
  assert.ok(!hem(VEST, { x: 0.2, y: 1.2, z: 0 }, 0).length);
  // the neck rib's edge is at its ring
  assert.ok(Math.abs(near({ x: F.neck.rx, y: F.neck.y, z: 0 }, 1, 1, TEE, 'neckRib').d) < 1e-9);
  // the rib columns close round each band
  for (const k of ['neck', 'body', 'cuff']) assert.ok(Number.isInteger(F[k].n) && Math.abs(Math.PI * 2 * F[k].r / F[k].n - M.rib.pitch) < 0.0005, k);
});

test('deterministic and mirrored in x', () => {
  const pts = [[0.17, 1.1, -0.004], [0.12, 1.48, -0.01], [0.17, 1.42, 0.02], [0.15, 1.2, 0.002], [0.12, 0.8, 0.1], [0.07, 0.72, -0.1], [0.13, 0.46, -0.004], [0.04, 0.5, 0.001]];
  for (const lk of [TEE, SWEATER, HOODIE, VEST]) for (const [x, y, z] of pts) for (const [r, t] of [[1, 1], [1, 0], [2, 0]]) {
    const a = seamAt({ x, y, z }, r, t, lk), b = seamAt({ x, y, z }, r, t, lk), m = seamAt({ x: -x, y, z }, r, t, lk);
    assert.deepEqual(a, b);
    // (the centre back seam's d is x itself: it flips sign)
    assert.deepEqual(a.map((s) => [s.kind, s.kind === 'backSeam' ? Math.abs(s.d) : s.d]), m.map((s) => [s.kind, s.kind === 'backSeam' ? Math.abs(s.d) : s.d]));
  }
});

test('uniforms from the look and the splice into the real physical shader', () => {
  const u = seamUniforms();
  assert.deepEqual(u.uSeam.value.toArray(), [0, 0, 0, 0], 'off until a look is set');
  setSeamLook(u, HOODIE);
  assert.deepEqual(u.uSeamKind.value.toArray(), [3, 0, 0, 1]); assert.equal(u.uSeam.value.w, M.scale);
  const code = '210000100c5e8o2w0l8j0n0b0r8t8y8', a = new Avatar({ ...decodeAvatarLook(code, 'seam'), tall: 1, build: 1, ...SWEATER });
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  a.material.onBeforeCompile(sh);
  assert.equal(sh.fragmentShader.split('vec2 seamDetail(').length, 2);
  assert.ok(sh.fragmentShader.includes('cSeam = seamDetail(vSuitAt'));
  assert.deepEqual(sh.uniforms.uSeamKind.value.toArray(), [2, 1, 0, 1]);
  assert.ok(a.material.customProgramCacheKey().includes(seamKey()) && seamKey() === '-seam2107');
  assert.equal(SURFACE.sleeve.long < SURFACE.sleeve.short, true);
  SEAM_DETAIL.on = false; try { assert.equal(seamDecl(), ''); assert.equal(seamKey(), '-seamoff'); } finally { SEAM_DETAIL.on = true; }
});

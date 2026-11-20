// #2269: a seated player's head clears our car's roof in its front seats. The seat fit from the height (remote-pose.js
// closedSeatFit) and, on the shared skeleton posed by applyRestPose as a peer (ghosts.js) or the own body sees it, the crown under
// the roof's inner surface for every chosen height; the first-person eye (rest.js eyeAt) stays at the figure's eyes; other seats
// are untouched.   node --test tools/passengerroof2269test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { REST, AVATAR_HEIGHT, PVP_RIFLE_HEAD, avatarProportions, avatarBody } from '../src/config.js';
import { attachSkeleton } from '../src/olof.js';
import { applyRestPose, closedSeatFit, closedSeatFitLook, restState } from '../src/remote-pose.js';
import { Rest } from '../src/rest.js';

const F = REST.closed, S = PVP_RIFLE_HEAD.skull, HAIR = 0.015;
const SEAT = { x: -0.02, y: 0.54, z: 0.37 }; // carmodel.js: the passenger seat point (car frame, +x forward, the road at 0)
const ROOF = SEAT.y + F.roof; // the roof's inner surface over the passenger's head (#2265 browser run: 1.411 m)

/** A bones-only figure placed by restState on the car's passenger spot (car frame; car.spot yaw: looking along +x). */
function figure(cm) {
  const p = avatarProportions(cm), car = new THREE.Group(), object = new THREE.Group(), mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  object.add(mesh); car.add(object);
  const bones = attachSkeleton(mesh);
  bones.head.scale.setScalar(p.head); // (as Avatar: a child's larger head)
  const spot = { kind: 'sit', pos: new THREE.Vector3(SEAT.x, SEAT.y + REST.sitEye, SEAT.z), yaw: -Math.PI / 2, closed: true, car: true };
  const st = restState({ active: true, kind: 'sit', spot, camera: { rotation: { x: 0, y: spot.yaw } } }, null, 'x');
  object.position.set(st.p[0], SEAT.y - REST.avatarSeat * p.body, st.p[2]); // (restState's root for this scale: the seed's `tall` is not the chosen height)
  object.rotation.y = spot.yaw + Math.PI; object.scale.setScalar(p.body);
  return { car, object, mesh, bones, head: new THREE.Vector3(), spot, p };
}
const v = new THREE.Vector3();
function crown(fig) {
  fig.car.updateMatrixWorld(true);
  const best = new THREE.Vector3(0, -Infinity, 0);
  for (let i = 0; i <= 12; i++) for (let j = 0; j < 24; j++) {
    const th = Math.PI / 2 * i / 12, ph = 2 * Math.PI * j / 24, r = S.radius;
    v.set(S.centre[0] + Math.sin(th) * Math.cos(ph) * (r * S.scale[0] + HAIR), S.centre[1] + Math.cos(th) * (r * S.scale[1] + HAIR), S.centre[2] + Math.sin(th) * Math.sin(ph) * (r * S.scale[2] + HAIR)).applyMatrix4(fig.bones.head.matrixWorld);
    if (v.y > best.y) best.copy(v);
  }
  return best;
}
const fitFor = (cm) => { const p = avatarProportions(cm); return closedSeatFit(p.body, p.head); };
const pose = (fig, fit, pitch = 0) => { applyRestPose(fig, 1, [0, pitch], null, null, fit); fig.car.updateMatrixWorld(true); return crown(fig); };
const HEIGHTS = []; for (let cm = AVATAR_HEIGHT.min; cm <= AVATAR_HEIGHT.max; cm += 5) HEIGHTS.push(cm);
HEIGHTS.push(186);

test('the fit grows with the height: nothing for a child, lower then reclined for a tall adult, within its caps', () => {
  let prev = null;
  for (const cm of [...HEIGHTS].sort((a, b) => a - b)) {
    const f = fitFor(cm);
    assert.ok(f.drop >= 0 && f.drop <= F.maxDrop + 1e-9 && f.recline >= 0 && f.recline <= F.maxRecline + 1e-9, `${cm}: ${JSON.stringify(f)}`);
    if (prev) assert.ok(f.drop >= prev.drop - 1e-9 && f.recline >= prev.recline - 1e-9, `${cm} not monotonic`);
    if (f.recline > 0) assert.equal(f.drop, F.maxDrop, `${cm}: reclines only once lowered fully`);
    prev = f;
  }
  for (const cm of [100, 140]) assert.deepEqual([fitFor(cm).drop, fitFor(cm).recline], [0, 0], `${cm} fits as it sits`);
  assert.ok(fitFor(200).recline < F.maxRecline, 'the tallest still within the cap (the crown clears)');
  // a look without a chosen height: the seed's tall with an adult head (restState's scale)
  assert.deepEqual(closedSeatFitLook({ tall: 1 }), closedSeatFit(1, 1));
  assert.deepEqual(closedSeatFitLook({ height: 186 }), fitFor(186));
});

test('every height 100–200 cm: the crown under the roof (headroom looking ahead, still under it looking up or down)', () => {
  const out = {};
  for (const cm of HEIGHTS) {
    const fig = figure(cm), fit = fitFor(cm), c = pose(fig, fit);
    const clear = ROOF - c.y;
    assert.ok(clear >= F.headroom - 0.01, `${cm} cm: crown ${c.y.toFixed(3)} vs roof ${ROOF.toFixed(3)} (clearance ${clear.toFixed(3)})`);
    const ext = Math.min(...[-1.1, -0.6, 0.6, 0.8].map((pitch) => ROOF - pose(fig, fit, pitch).y));
    assert.ok(ext >= 0, `${cm} cm looking up/down: clearance ${ext.toFixed(3)}`);
    // the head stays in front of the headrest: at most REST.closed.back m further back than unfitted (the hips slide forward instead)
    pose(fig, fit); const hx = fig.bones.head.getWorldPosition(new THREE.Vector3()).x; pose(fig, null); const hx0 = fig.bones.head.getWorldPosition(new THREE.Vector3()).x;
    assert.ok(hx0 - hx <= F.back + 0.005, `${cm} cm: head ${(hx0 - hx).toFixed(3)} m back`);
    assert.ok(fit.slide <= F.maxSlide + 1e-9 && fit.slide < F.maxSlide, `${cm}: slide ${fit.slide} at its cap`);
    out[cm] = { clear: +clear.toFixed(3), lookUpDown: +ext.toFixed(3), drop: +fit.drop.toFixed(3), recline: +fit.recline.toFixed(3), slide: +fit.slide.toFixed(3), headBack: +(hx0 - hx).toFixed(3) };
  }
  console.log('crown clearance per height (m):', JSON.stringify(out));
});

test('without the fit (the regression): 175 and 186 cm crowns go through the roof', () => {
  for (const [cm, min] of [[175, 0.05], [186, 0.1]]) {
    const c = pose(figure(cm), null);
    assert.ok(c.y - ROOF > min, `${cm}: crown ${c.y.toFixed(3)} over roof ${ROOF.toFixed(3)}`);
  }
});

test('the first-person eye follows the fitted head (rest.js eyeAt with main.js closedFit) and stays under the roof', () => {
  for (const cm of [160, 175, 186, 200]) {
    const fig = figure(cm), fit = fitFor(cm); pose(fig, fit);
    const rest = new Rest(new THREE.PerspectiveCamera()); rest.scale = avatarBody({ height: cm }).scale; rest.closedFit = closedSeatFitLook({ height: cm });
    const eye = rest.eyeAt(fig.spot), head = fig.bones.head.getWorldPosition(new THREE.Vector3());
    const figEye = head.clone(); figEye.y += AVATAR_HEIGHT.eye * fig.p.head * fig.p.body;
    rest.closedFit = null; const was = rest.eyeAt(fig.spot);
    pose(fig, null); const head0 = fig.bones.head.getWorldPosition(new THREE.Vector3()); head0.y += AVATAR_HEIGHT.eye * fig.p.head * fig.p.body;
    const off = eye.distanceTo(figEye), off0 = was.distanceTo(head0);
    assert.ok(off <= off0 + 0.01, `${cm}: camera ${off.toFixed(3)} m from the eyes (unfitted: ${off0.toFixed(3)})`);
    assert.ok(ROOF - eye.y > 0.1, `${cm}: camera ${eye.y.toFixed(3)} under the roof ${ROOF.toFixed(3)}`);
  }
});

test('other seats are untouched: no fit without a closed spot / vehicle seat', () => {
  // the pose without a fit (a sofa, chair, bench: ghosts.js passes none off a vehicle cabin) is the pre-#2269 pose
  const a = figure(186), b = figure(186);
  applyRestPose(a, 1, [0.2, 0.1]); applyRestPose(b, 1, [0.2, 0.1], null, null, null);
  for (const n of ['hips', 'torso', 'head']) { assert.deepEqual(a.bones[n].position.toArray(), b.bones[n].position.toArray()); assert.deepEqual(a.bones[n].quaternion.toArray(), b.bones[n].quaternion.toArray()); }
  // a zero fit changes nothing either
  const c = figure(150); applyRestPose(c, 1, [0.2, 0.1], null, null, fitFor(150));
  assert.deepEqual(c.bones.hips.position.toArray(), b.bones.hips.position.toArray());
  // the camera on an open seat ignores the fit
  const rest = new Rest(new THREE.PerspectiveCamera()); rest.scale = 1.1; rest.closedFit = fitFor(200);
  const sofa = { kind: 'sit', pos: new THREE.Vector3(1, 1.2, 2), yaw: 0.4 }, eye = rest.eyeAt(sofa);
  assert.deepEqual(eye.toArray(), [1, 1.2 - REST.sitEye * (1 - 1.1), 2]);
  assert.ok(rest.eyeAt({ ...sofa, closed: true }).y < eye.y, 'a closed spot lowers it');
});

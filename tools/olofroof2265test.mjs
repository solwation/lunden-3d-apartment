// #2265: the 186 cm Olof fits under the car's roof. The seat fit from his height (driverFit) and, on the shared skeleton posed by
// drivingPose / poseOlof in every driving state, his crown under the roof's inner surface, the hands on the wheel and the feet at
// the pedals.   node --test tools/olofroof2265test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OLOF, OLOF_DRIVE as OD, PVP_RIFLE_HEAD, avatarProportions, avatarHeightCm } from '../src/config.js';
import { MEGANE, lerpTable } from '../src/carmodel.js';
import { driverFit, drivingPose, poseOlof, attachSkeleton, olofLook } from '../src/olof.js';
import { wheelHands, bodyMotion } from '../src/olofdrive.js';

const D = OLOF.car, F = D.fit, S = PVP_RIFLE_HEAD.skull, HAIR = 0.015;

/** A bones-only figure placed like OlofDriver's (car frame: his +z along the car's +x, the foot well's floor at D.floor). */
function figure(cm) {
  const car = new THREE.Group(), object = new THREE.Group(), mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  object.add(mesh); car.add(object);
  const bones = attachSkeleton(mesh);
  object.position.set(D.at[0], D.floor, D.at[1]); object.rotation.y = Math.PI / 2;
  object.scale.setScalar(avatarProportions(cm).body);
  return { car, object, mesh, bones, head: new THREE.Vector3() };
}
const v = new THREE.Vector3();
/** The crown (car frame): the skull ellipsoid's highest point plus short hair, through the head bone (as the browser check). */
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
const at = (fig, name) => fig.bones[name].getWorldPosition(new THREE.Vector3());
const big = 100; // m/s²: past every cap
const STATES = { parked: {}, braking: { accel: -big }, starting: { accel: big }, bendLeft: { lat: big }, bendRight: { lat: -big },
  brakeInBend: { accel: -big, lat: big }, reversing: { accel: -big, shoulder: 1 }, steerFull: { steer: OD.maxWheel }, waving: { wave: 1 } };
function pose(fig, fit, st) {
  const bm = bodyMotion(st.accel ?? 0, st.lat ?? 0);
  poseOlof(fig, drivingPose({ seat: D.seat, wheel: D.wheel, pedals: D.pedals, wave: st.wave ?? 0, steer: st.steer ?? 0,
    turn: -OD.shoulderHead * (st.shoulder ?? 0), leanExtra: bm.lean, torsoYaw: -OD.shoulderTorso * (st.shoulder ?? 0), torsoRoll: bm.roll, adjust: fit }));
  fig.car.updateMatrixWorld(true);
}

test('the seat fit grows with his height: none needed by a short driver, lower / reclined for a tall one, capped', () => {
  const f160 = driverFit(160), f175 = driverFit(175), f186 = driverFit(186), f200 = driverFit(200);
  assert.equal(f160.drop, 0); assert.equal(f160.recline, 0);
  assert.ok(f175.s === 1 && f175.drop < f186.drop, `175 ${JSON.stringify(f175)} 186 ${JSON.stringify(f186)}`);
  assert.ok(f186.drop > 0.03 && f186.drop <= F.maxDrop, `186 drop ${f186.drop}`);
  assert.ok(f186.recline >= 0 && f186.recline <= F.maxRecline && f200.recline >= f186.recline);
  for (const f of [f160, f175, f186, f200]) assert.ok(Math.abs(f.slide) <= F.maxSlide + 1e-9);
  assert.equal(f200.drop, F.maxDrop, 'capped');
  assert.equal(avatarHeightCm(olofLook()), 186, 'Olof stays 186 cm');
});

test('the fit\'s roof is the lower one: the GLB\'s measured inner roof, under the procedural body\'s (carmodel.js MEGANE, its 5 cm roof)', () => {
  for (const x of [-0.3, -0.2, -0.1, 0]) assert.ok(F.roof <= lerpTable(MEGANE.top, x) - 0.05, `x ${x}: procedural ${lerpTable(MEGANE.top, x) - 0.05}`);
});

test('186 cm: the crown clears the roof in every driving state; hands on the wheel and feet at the pedals as well as the 175 cm pose', () => {
  const fit = driverFit(186), fig = figure(186), ref = figure(175), out = {};
  const [gL, gR] = wheelHands([D.wheel[0], D.wheel[1] - 0.04, D.wheel[2]], 0.15, 0.42, 0).map((p) => new THREE.Vector3(...p));
  // hands / feet back in car-fixed places (the figure's frame times its scale), off the grips / the pedals
  const off = (f, k) => {
    const h = ['handL', 'handR'].map((n) => f.object.worldToLocal(at(f, n)).multiplyScalar(k));
    return { hands: Math.max(h[0].distanceTo(gL), h[1].distanceTo(gR)), feet: Math.abs(f.object.worldToLocal(at(f, 'footL')).multiplyScalar(k).z - D.pedals) };
  };
  for (const [name, st] of Object.entries(STATES)) {
    pose(fig, fit, st);
    const c = crown(fig), clear = F.roof - c.y;
    assert.ok(clear >= F.headroom / 2, `${name}: crown ${c.y.toFixed(3)} vs roof ${F.roof} (clearance ${clear.toFixed(3)})`);
    const o = off(fig, fit.s);
    pose(ref, { s: 1, drop: 0, recline: 0, slide: 0 }, st);
    const r = off(ref, 1);
    out[name] = { clear: +clear.toFixed(3), hands: +o.hands.toFixed(3), hands175: +r.hands.toFixed(3) };
    if (st.steer || st.wave) continue; // (the hands follow the wheel round / one waves)
    assert.ok(o.hands <= Math.max(0.02, r.hands + 0.01), `${name}: hands ${o.hands.toFixed(3)} m off the grips (175 cm pose: ${r.hands.toFixed(3)})`);
    assert.ok(o.feet < 0.03, `${name}: feet ${o.feet.toFixed(3)} m off the pedals`);
  }
  console.log('186 cm per state (m):', JSON.stringify(out), 'fit', JSON.stringify(fit));
});

test('without the fit (the regression): the 186 cm crown reaches the roof', () => {
  const fig = figure(186);
  pose(fig, { s: 1, drop: 0, recline: 0, slide: 0 }, { accel: -big });
  assert.ok(crown(fig).y > F.roof, `crown ${crown(fig).y.toFixed(3)}`);
});

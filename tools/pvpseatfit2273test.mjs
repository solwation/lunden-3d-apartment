// #2273: the PVP boxes (rifleBoxPose: the three head boxes and the body capsule, shared by the clients and the Worker) follow the
// car-seat fit the drawn figure takes (#2269 closedSeatFit). On the shared skeleton posed by applyRestPose as a peer draws it, the
// head boxes are probed with real rays (rifleBoxHeadContact) and compared with the drawn skull, for 140/175/186/200 cm in the
// passenger and the driver's seat: the offset between box and skull stays what it is on an open seat (the boxes' own *guess*), within
// 1.5 cm. Open seats and standing keep their boxes; the wire flag `cs` is validated in the Worker.   node --test tools/pvpseatfit2273test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { REST, PVP_RIFLE_HEAD, avatarProportions, closedSeatFit, decodeAvatarLook, encodeAvatarWireLook, splitAvatarCode,
  rifleBoxHeadContact, rifleHeadBaseY, playerBodySegment } from '../src/config.js';
import { attachSkeleton, NECK, seatedPose } from '../src/olof.js';
import { applyRestPose, closedSeatFitLook, restState } from '../src/remote-pose.js';
import { cleanState } from '../cloudflare/players.js';

const S = PVP_RIFLE_HEAD.skull, HAIR = 0.015, TOL = 0.015;
const SEATS = { // carmodel.js seat points (car frame); the car turned so the two seats face different world headings
  passenger: { x: -0.02, y: 0.54, z: 0.37, yaw: -Math.PI / 2 },
  driver: { x: 3.1, y: 0.54, z: -1.2, yaw: 0.7 },
};
const codeFor = (cm) => encodeAvatarWireLook({ ...decodeAvatarLook(null, 'seed'), height: cm });

/** A bones-only figure on `seat` as restState sends it and a peer (ghosts.js applyRestPose) draws it. */
function figure(cm, seat, closed) {
  const code = codeFor(cm), look = decodeAvatarLook(code, 'seed'), p = avatarProportions(cm);
  const object = new THREE.Group(), mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  object.add(mesh);
  const bones = attachSkeleton(mesh);
  bones.head.scale.setScalar(p.head);
  const spot = { kind: 'sit', pos: new THREE.Vector3(seat.x, seat.y + REST.sitEye, seat.z), yaw: seat.yaw, ...(closed ? { closed: true, car: true } : {}) };
  const st = restState({ active: true, kind: 'sit', spot, camera: { rotation: { x: 0, y: spot.yaw } } }, code, 'seed');
  object.position.set(...st.p); object.rotation.y = st.r + Math.PI; object.scale.setScalar(p.body);
  const fit = closed ? closedSeatFitLook(look) : null; // (ghosts.js seatFit: a vehicle seat)
  applyRestPose({ bones, object, mesh, head: new THREE.Vector3() }, 1, [0, 0], null, null, fit);
  object.updateMatrixWorld(true);
  return { bones, object, st: { ...st, ...splitAvatarCode(code) }, fit, p };
}
const v = new THREE.Vector3();
function drawn(fig) {
  const m = fig.bones.head.matrixWorld, centre = new THREE.Vector3(...S.centre).applyMatrix4(m);
  let top = -Infinity;
  for (let i = 0; i <= 12; i++) for (let j = 0; j < 24; j++) {
    const th = Math.PI / 2 * i / 12, ph = 2 * Math.PI * j / 24;
    v.set(S.centre[0] + Math.sin(th) * Math.cos(ph) * (S.radius * S.scale[0] + HAIR), S.centre[1] + Math.cos(th) * (S.radius * S.scale[1] + HAIR), S.centre[2] + Math.sin(th) * Math.sin(ph) * (S.radius * S.scale[2] + HAIR)).applyMatrix4(m);
    top = Math.max(top, v.y);
  }
  return { centre, top, bone: fig.bones.head.getWorldPosition(new THREE.Vector3()), hips: fig.bones.hips.getWorldPosition(new THREE.Vector3()) };
}
/** The head boxes probed with rays at the drawn skull centre: their top (down from above) and their mid along the facing. */
function boxes(state, c) {
  const fwd = [-Math.sin(state.r), 0, -Math.cos(state.r)]; // the seat's facing (spot.yaw: looking along −z rotated)
  const down = rifleBoxHeadContact('seed', state, [c.x, c.y + 2, c.z], [0, -1, 0], 4);
  const front = rifleBoxHeadContact('seed', state, [c.x + 2 * fwd[0], c.y, c.z + 2 * fwd[2]], fwd.map((x) => -x), 4);
  const back = rifleBoxHeadContact('seed', state, [c.x - 2 * fwd[0], c.y, c.z - 2 * fwd[2]], fwd, 4);
  if (!down || !front || !back) return null;
  const along = (pt) => (pt[0] - c.x) * fwd[0] + (pt[2] - c.z) * fwd[2];
  return { top: down.point[1], mid: (along(front.point) + along(back.point)) / 2, depth: along(front.point) - along(back.point) };
}
const offsets = (fig, state) => { const d = drawn(fig), b = boxes(state, d.centre); return b && { top: b.top - d.top, mid: b.mid, depth: b.depth, crown: d.top }; };

test('the seat-fit constants in config.js are the skeleton the drawn pose uses', () => {
  assert.equal(NECK, 0.64); assert.equal(seatedPose(REST.avatarSeat).lean, 0.1);
  assert.equal(seatedPose(REST.avatarSeat).hip[0], REST.avatarSeat + 0.075);
  for (const cm of [140, 175, 186, 200]) { const p = avatarProportions(cm); assert.deepEqual(closedSeatFitLook({ height: cm }), closedSeatFit(p.body, p.head)); }
});

test('140/175/186/200 cm in both front seats: the head boxes follow the drawn head as on an open seat (within 1.5 cm)', () => {
  const out = {};
  for (const [name, seat] of Object.entries(SEATS)) for (const cm of [140, 175, 186, 200]) {
    const open = figure(cm, seat, false), car = figure(cm, seat, true);
    assert.equal(open.st.cs, undefined); assert.equal(car.st.cs, 1, 'restState marks a car front seat');
    const base = offsets(open, open.st), now = offsets(car, car.st), old = offsets(car, { ...car.st, cs: undefined });
    assert.ok(base && now, `${name} ${cm}: the probes hit the boxes`);
    const dTop = now.top - base.top, dMid = now.mid - base.mid;
    assert.ok(Math.abs(dTop) <= TOL && Math.abs(dMid) <= TOL, `${name} ${cm}: box top ${dTop.toFixed(3)} / mid ${dMid.toFixed(3)} m off the open-seat offset`);
    // the drawn head bone stays on the body capsule's axis as on an open seat (hips and torso follow the recline)
    const axisOff = (fig, state) => { const [a, b] = playerBodySegment('seed', state).map((x) => new THREE.Vector3(...x)), h = drawn(fig).bone;
      return new THREE.Line3(a, b).closestPointToPoint(h, false, new THREE.Vector3()).distanceTo(h); };
    const capsule = axisOff(car, car.st) - axisOff(open, open.st);
    assert.ok(Math.abs(capsule) <= TOL, `${name} ${cm}: head bone ${capsule.toFixed(3)} m further off the body axis`);
    // the head's lowest box edge sinks with the head
    const sink = (rifleHeadBaseY('seed', car.st) - rifleHeadBaseY('seed', { ...car.st, cs: undefined })) - (drawn(car).bone.y - drawn(open).bone.y);
    assert.ok(Math.abs(sink) <= TOL, `${name} ${cm}: head base ${sink.toFixed(3)} m off the drawn drop`);
    out[`${name} ${cm}`] = { drop: +car.fit.drop.toFixed(3), recline: +car.fit.recline.toFixed(3), slide: +car.fit.slide.toFixed(3),
      openTop: +base.top.toFixed(3), carTop: +now.top.toFixed(3), carMid: +(now.mid - base.mid).toFixed(3), capsule: +capsule.toFixed(3),
      before: old ? { top: +(old.top - base.top).toFixed(3), mid: +(old.mid - base.mid).toFixed(3) } : 'miss',
      beforeHigh: +((rifleHeadBaseY('seed', { ...car.st, cs: undefined }) - rifleHeadBaseY('seed', open.st)) - (drawn(car).bone.y - drawn(open).bone.y)).toFixed(3),
      beforeAhead: +(drawn(open).bone.clone().sub(drawn(car).bone).dot(new THREE.Vector3(-Math.sin(seat.yaw), 0, -Math.cos(seat.yaw)))).toFixed(3) };
  }
  console.log('box − drawn head (m; top: box top − crown, carMid: box mid shift vs the open seat; before/beforeHigh/beforeAhead: the unfitted boxes, how far over and in front of the drawn head):', JSON.stringify(out));
  // the regression: without the fit the boxes of a 200 cm passenger float over and behind the drawn head
  assert.ok(out['passenger 200'].before === 'miss' || Math.abs(out['passenger 200'].before.top) > 0.05 || Math.abs(out['passenger 200'].before.mid) > 0.05);
});

test('open seats, standing, other poses and old clients keep their boxes', () => {
  const code = splitAvatarCode(codeFor(186)), st = { p: [1, 0.3, 2], r: 0.4, c: false, pose: 1, look: [0, 0], ...code };
  const ray = (s) => rifleBoxHeadContact('seed', s, [1, 1.9, 4], [0, -0.3, -1], 6);
  assert.deepEqual(ray({ ...st, cs: 1 }) === null, false);
  for (const s of [{ ...st, pose: 0, cs: 1 }, { ...st, pose: 2, cs: 1 }, { ...st, pose: 3, cs: 1 }, { ...st, cs: true }, { ...st, cs: 2 }]) {
    const plain = { ...s }; delete plain.cs;
    assert.deepEqual(ray(s), ray(plain), JSON.stringify(s)); assert.deepEqual(playerBodySegment('seed', s), playerBodySegment('seed', plain));
    assert.equal(rifleHeadBaseY('seed', s), rifleHeadBaseY('seed', plain));
  }
  // a figure that fits as it sits (a child) gets the same boxes in the car
  const kid = { ...st, ...splitAvatarCode(codeFor(110)) };
  assert.deepEqual(playerBodySegment('seed', { ...kid, cs: 1 }), playerBodySegment('seed', kid));
});

test('the Worker keeps cs only as the literal 1 on a seated state', () => {
  const base = { p: [1, 0, 2], r: 0.4, h: 'rifle' };
  assert.equal(cleanState(JSON.stringify({ ...base, pose: 1, cs: 1 })).cs, 1);
  for (const bad of [{ pose: 1, cs: true }, { pose: 1, cs: '1' }, { pose: 1, cs: 2 }, { pose: 2, cs: 1 }, { pose: 3, cs: 1 }, { cs: 1 }, { pose: 1 }])
    assert.equal(cleanState(JSON.stringify({ ...base, ...bad })).cs, undefined, JSON.stringify(bad));
});

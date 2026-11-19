import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { restBodyReady, standBodyReady, standRoot, installSelfView } from '../src/avatarselfview.js';
import { Rest, restTarget } from '../src/rest.js';
import { restState } from '../src/remote-pose.js';
import { decodeAvatarLook, encodeAvatarLook, REST, avatarBody } from '../src/config.js';

test('only settled ordinary Rest while playing enables the own body', () => {
  for (const kind of ['sit', 'lie']) {
    const r = { active: true, t: 1, spot: { kind } };
    assert.equal(restBodyReady(r), true);
    for (const patch of [{ active: false }, { t: .99 }, { spot: null }]) assert.equal(restBodyReady({ ...r, ...patch }), false);
    assert.equal(restBodyReady(r, false), false);
    for (const key of ['gymPose', 'gymWirePose']) assert.equal(restBodyReady({ ...r, spot: { kind, [key]: 1 } }), false);
  }
});

test('real transformed seats retain their anchor, three poses and chosen-height support despite independent gaze', () => {
  const obj = new T.Group(); obj.rotation.y = .73;
  obj.userData.rest = { kind: 'sit', spots: [{ x: .2, y: .43, z: -.08 }, { x: .9, y: .43, z: -.08, legsUp: true }, { x: 0, y: .52, z: -.7, kind: 'lie', body: .48 }] };
  const target = restTarget(obj, { x: 4, z: 7, level: 1 }, 3.25);
  for (const cm of [120, 180]) for (const [index, sp] of target.spots.entries()) {
    const camera = new T.PerspectiveCamera(), rest = new Rest(camera);
    const look = { ...decodeAvatarLook('241302112', 'body2080'), height: cm }, code = encodeAvatarLook(look);
    rest.scale = avatarBody(look).scale; rest.begin(target, sp, { x: 1, z: 2 }); rest.update(REST.move);
    const before = restState(rest, code, 'body2080');
    assert.equal(before.pose, [1, 3, 2][index]); assert.equal(before.r, sp.yaw);
    camera.rotation.y += .7; camera.rotation.x = -.7;
    const after = restState(rest, code, 'body2080');
    assert.deepEqual(after.p, before.p); assert.equal(after.r, before.r);
    if (index !== 2) { assert.ok(Math.abs(after.look[0] - .7) < 1e-12); assert.equal(after.look[1], -.7); }
    assert.equal(camera.position.distanceTo(rest.eyeAt(sp)), 0);
    rest.end(); assert.deepEqual(restState(rest, code, 'body2080'), {}); assert.equal(restBodyReady(rest), false);
  }
});

test('mask composes with the established shader and defaults to complete remote/mirror appearance', () => {
  const material = new T.MeshStandardMaterial(); material.userData.u = {}; let compiled = false;
  material.onBeforeCompile = shader => { compiled = true; shader.uniforms.existing = { value: 4 }; };
  material.customProgramCacheKey = () => 'existing'; installSelfView(material);
  const shader = { vertexShader: T.ShaderLib.standard.vertexShader, fragmentShader: T.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader); assert.equal(compiled, true); assert.equal(shader.uniforms.existing.value, 4);
  assert.deepEqual(shader.uniforms.uSelfView.value.toArray(), [0, 0]);
  assert.match(shader.vertexShader, /skinIndex - vec4\(2\.0\)/); // head, including neck/hair/accessories
  assert.match(shader.vertexShader, /vec4\(3\.0 - 0\.5\)/); assert.match(shader.vertexShader, /vec4\(8\.0 \+ 0\.5\)/);
  assert.match(shader.vertexShader, /abs\(armPump.x\)/); // torso-weighted first sewn row belongs to the sleeve too
  assert.match(shader.fragmentShader, /uSelfView.y > 0.5 && vSelfPart.y > 0.00001/);
  assert.match(shader.fragmentShader, /uSelfView.x > 0.5 && vViewPosition.z < selfNear/); assert.match(shader.fragmentShader, /: 0\.30;/);
  assert.equal(material.customProgramCacheKey(), 'existing-selfview2080');
  assert.equal(material.depthTest, true); assert.equal(material.depthWrite, true); assert.equal(material.transparent, false);
  assert.equal((shader.vertexShader.match(/attribute /g) ?? []).length, (T.ShaderLib.standard.vertexShader.match(/attribute /g) ?? []).length);
});

test('#2145: the standing body shows only where it fits (stand, walk, crouch), never in vehicles, water, air, gym or seats', () => {
  const mine = { pose: 0, gx: 0, bk: null, jp: 0, am: 0, c: true }, ok = { playing: true };
  assert.equal(standBodyReady(mine, ok), true); // crouching is still a standing-family state
  assert.equal(standBodyReady({ ...mine, c: false }, ok), true);
  assert.equal(standBodyReady(null, ok), false);
  assert.equal(standBodyReady(mine, { ...ok, playing: false }), false);
  assert.equal(standBodyReady(mine, { ...ok, on: false }), false);
  for (const k of ['rest', 'reaction', 'swim', 'riding', 'flying', 'climbing', 'swinging', 'falling', 'gym']) assert.equal(standBodyReady(mine, { ...ok, [k]: true }), false, k);
  for (const patch of [{ pose: 1 }, { gx: 3 }, { bk: 0 }, { bk: 1.2 }, { jp: 1 }, { jp: 2 }, { am: 1 }, { am: 3 }]) assert.equal(standBodyReady({ ...mine, ...patch }, ok), false, JSON.stringify(patch));
});

test('#2145: the standing body is rooted behind the eye along its heading', () => {
  const p = { x: 3, z: -2 };
  const a = standRoot(p, 0, 0); assert.ok(Math.abs(a.x - 3) < 1e-12 && a.z > -2); // facing north (-z): back is +z
  const b = standRoot(p, Math.PI / 2, 0); assert.ok(b.x > 3 && Math.abs(b.z + 2) < 1e-9); // facing west (-x): back is +x
  assert.ok(Math.hypot(standRoot(p, .7, 1).x - 3, standRoot(p, .7, 1).z + 2) >= Math.hypot(standRoot(p, .7, 0).x - 3, standRoot(p, .7, 0).z + 2) - 1e-12);
});

// #2034: the cloth folds' pose signal and shader splice, headless. node --test tools/avatarclothtest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Avatar } from '../src/avatar.js';
import { clothKinds, clothDecl, clothNormal } from '../src/avatarcloth.js';
import { decodeAvatarLook } from '../src/config.js';

const code = '210000100c5e8o2w0l8j0n0b0r8t8y8';
const make = (o = {}) => new Avatar({ ...decodeAvatarLook(code, 'cloth'), tall: 1, build: 1, ...o });
const settle = (a, opts = {}, n = 90) => { for (let i = 0; i < n; i++) a.update(1 / 60, opts); a.object.updateMatrixWorld(true); a.mesh.skeleton.update(); return a.material.userData.u; };

test('#2034 garment kinds: T-shirt / vest jersey, long sleeves knit, hoodie fleece; wide legs trousers, others jeans', () => {
  assert.deepEqual(clothKinds({ cut: 0, sleeves: 0, legs: 0 }), { top: 'tshirt', pants: 'jeans' });
  assert.deepEqual(clothKinds({ cut: 0, sleeves: 1, legs: 1 }), { top: 'sweater', pants: 'jeans' });
  assert.deepEqual(clothKinds({ cut: 2, sleeves: 0, legs: 2 }), { top: 'hoodie', pants: 'trousers' });
  assert.equal(clothKinds({ cut: 1, sleeves: 1 }).top, 'tshirt');
});

test('#2034 standing straight: no joint folds; crouching: knees and hips full, crease behind the knee', () => {
  const a = make({ sleeves: 1 });
  let u = settle(a);
  const B = u.uClothBend.value, H = u.uClothHip.value;
  assert(Math.max(B.x, B.y, B.z, B.w) < 0.05, `standing bends ${B.toArray()}`);
  assert(Math.max(H.x, H.y) < 0.05, `standing hips ${H.x} ${H.y}`);
  assert(u.uClothTop.value.x > 0 && u.uClothPants.value.x > 0, 'garment amplitudes set');
  u = settle(a, { crouch: 1 }, 240);
  assert(B.z > 0.8 && B.w > 0.8, `crouched knees ${B.z} ${B.w}`);
  assert(H.x > 0.8 && H.y > 0.8, `crouched hips ${H.x} ${H.y}`);
  assert(u.uClothLeg.value.y < -0.7 && u.uClothLeg.value.w < -0.7, `knee crease behind ${u.uClothLeg.value.toArray()}`);
});

test('#2034 a bent elbow folds its sleeve on the inside (front), the other arm stays straight', () => {
  const a = make({ sleeves: 1 });
  settle(a);
  a.bones.elbowL.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.7); // forearm forward
  a.object.updateMatrixWorld(true); a.mesh.skeleton.update();
  const u = a.material.userData.u;
  assert(u.uClothBend.value.x > 0.95, `left elbow ${u.uClothBend.value.x}`);
  assert(u.uClothBend.value.y < 0.1, `right elbow ${u.uClothBend.value.y}`);
  assert(u.uClothArm.value.y > 0.9, `crease in front ${u.uClothArm.value.toArray()}`);
});

test('#2034 the chunks splice into the real physical shader once each', () => {
  const a = make();
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  a.material.onBeforeCompile(sh);
  assert(sh.fragmentShader.includes('#2034 cloth folds and weave'));
  assert.equal(sh.fragmentShader.split('float clothFolds(').length, 2);
  assert(sh.uniforms.uClothBend && sh.uniforms.uClothPants);
  assert(clothDecl().length > 0 && clothNormal().length > 0);
});

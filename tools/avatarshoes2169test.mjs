// #2169: shoe models and socks. Functional checks: node --test tools/avatarshoes2169test.mjs
// (1) the look code: models / socks round-trip in the headphones' tag `f`, a missing value is today's look, bad values fall back.
// (2) shoe model x foot IK (#2015): the lowest skinned vertex of each foot (the sole) rests on the ground / its own tread for every model, unchanged from the trainer.
// (3) the geometry: every model keeps the trainer's sole height; socks / boots / sandals add only the expected parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Avatar, avatarTriangles } from '../src/avatar.js';
import { decodeAvatarLook, encodeAvatarLook, encodeAvatarWireLook, avatarLook, shoeModelOf, socksOf, AVATAR_SHOES as S } from '../src/config.js';

const base = { ...avatarLook('shoes2169'), legs: 1, tall: 1, build: 1, gender: 0 };
const ext = (code) => code.replace(/^[0-9]+/, '');

test('look code: shoe model and socks ride the headphones tag, round-trip, default is silent', () => {
  assert.equal(ext(encodeAvatarLook(base)).includes('f'), false, 'an untouched look has no f tag');
  for (const phones of [0, 1, 2]) for (let model = 0; model < S.models.length; model++) for (let socks = 0; socks < S.socks.length; socks++) {
    const lk = { ...base, phones, shoeModel: model, socks }, code = encodeAvatarWireLook(lk), back = decodeAvatarLook(code, 'x');
    assert.ok(/^(?:[a-z][0-9]{1,3})*$/.test(ext(code)), 'tag form stays within the Worker check ' + ext(code));
    assert.equal(back.phones | 0, phones); assert.equal(shoeModelOf(back), model); assert.equal(socksOf(back), socks);
  }
  const f = (n) => decodeAvatarLook(encodeAvatarLook(base) + 'f' + n, 'x');
  assert.equal(shoeModelOf(f(0)), 0); assert.equal(socksOf(f(0)), 0);
  assert.equal(f(1).phones, 1);
  const bad = f(999); assert.equal(shoeModelOf(bad), 0); assert.equal(socksOf(bad), 0); assert.ok(!(bad.phones > 0), 'out-of-range value: skipped');
  // an older client reads only f0-f2: the new values are >= 10, so it skips them and keeps the trainer (the old rule `v < names.length`)
  const wire = ext(encodeAvatarLook({ ...base, shoeModel: 3, socks: 2 })), v = Number(/f(\d+)/.exec(wire)[1]);
  assert.ok(v >= 10, 'new values never collide with an old headphone value');
  for (const junk of [undefined, null, -1, 1.5, 9, '2', NaN]) assert.equal(shoeModelOf({ shoeModel: junk }), 0);
});

const SOLE_TOP = 0.05; // the sole's bottom under the ankle bone (config AVATAR_GAIT.shoe.sole)
function lowest(av) { // lowest world y of the skinned vertices on each side (x < / > the figure's centre)
  av.object.updateMatrixWorld(true); av.mesh.skeleton.update();
  const p = av.mesh.geometry.attributes.position, v = new THREE.Vector3(), low = [Infinity, Infinity];
  for (let i = 0; i < p.count; i++) { av.mesh.getVertexPosition(i, v); v.applyMatrix4(av.mesh.matrixWorld); const k = v.x > 0 ? 1 : 0; if (v.y < low[k]) low[k] = v.y; }
  return low;
}
const settle = (av, ground, n = 90) => { av.object.rotation.y = Math.PI; for (let i = 0; i < n; i++) av.update(1 / 60, { motionFrame: [0, 0, Math.PI], groundEnabled: true, ground, floorY: 0 }); };

const looks = [];
for (let model = 0; model < S.models.length; model++) looks.push([`model ${S.models[model]}`, { ...base, shoeModel: model }]);
looks.push(['trainer + white socks', { ...base, socks: 1 }], ['sandal + dark socks', { ...base, shoeModel: 3, socks: 2 }]);

test('sole on the ground for every shoe model: flat floor and a kerb under one foot', () => {
  const ref = (() => { const a = new Avatar({ ...base }); settle(a, () => 0); return lowest(a); })();
  for (const [name, lk] of looks) {
    const flat = new Avatar(lk); settle(flat, () => 0);
    const l = lowest(flat);
    assert.ok(l.every((y, k) => Math.abs(y - ref[k]) < 1e-3), `${name}: sole height ${l.map((y) => y.toFixed(4))} equals the trainer's ${ref.map((y) => y.toFixed(4))}`);
    assert.ok(l.every((y) => Math.abs(y) < 0.02), `${name}: sole on the floor ${l.map((y) => y.toFixed(4))}`);
    const kerb = new Avatar(lk), g = (x) => (x > 0 ? 0.18 : 0); settle(kerb, g);
    const k = lowest(kerb);
    assert.ok(Math.abs(k[1] - 0.18) < 0.03 && Math.abs(k[0]) < 0.03, `${name}: each foot on its own tread ${k.map((y) => y.toFixed(3))}`);
  }
});

test('geometry: sole height kept, parts added as designed, no NaN', () => {
  const t0 = avatarTriangles(0, 1, 0, 0), t = (model, socks, legs = 1) => avatarTriangles(0, legs, 0, model + 4 * socks);
  const delta = { boot: t(1, 0) - t0, leather: t(2, 0) - t0, sandal: t(3, 0) - t0, socks: t(0, 1) - t0, sockNoShorts: t(0, 1, 0) - avatarTriangles(0, 0, 0, 0), bootSocks: t(1, 1) - t(1, 0) };
  if (process.env.PRINT) console.log(delta);
  assert.ok(delta.boot > 0 && delta.sandal > 0 && delta.socks > 0);
  assert.equal(delta.sockNoShorts, 0, 'long trousers hide socks: none built');
  assert.equal(delta.bootSocks, 0, 'a boot hides the socks: none built');
  for (const [name, lk] of looks) {
    const a = new Avatar(lk), p = a.mesh.geometry.attributes.position;
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]), name);
  }
});

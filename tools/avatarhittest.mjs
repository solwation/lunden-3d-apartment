// #2036: the directional flinch on a hit, headless. node --test tools/avatarhittest.mjs (needs `three` resolvable, e.g. a node_modules/three
// link to the pinned 0.170.0 package). The spring's shape, distinct front / side / back reactions on the real Avatar's bones (head and body
// hits), the return to exactly the unhit pose, and the head boxes / skeleton root unchanged by it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Avatar } from '../src/avatar.js';
import { HitFx, hitResponse, hitDir, hitKick, flinchGhost } from '../src/avatarhit.js';
import { AVATAR_HIT as H, rifleBoxHeadContact } from '../src/config.js';

const V = new THREE.Vector3();
/** A standing ghost-like figure (the real Avatar under a root turned `yaw`, as Ghost builds it) at the origin, posed at virtual time `now` ms. */
function figure(yaw = 0) {
  const avatar = new Avatar('hit-2036'), root = new THREE.Group();
  root.add(avatar.object); root.rotation.y = yaw;
  const clock = { t: 0 };
  avatar.hitFx = new HitFx(() => clock.t);
  const pose = (t) => { clock.t = t; avatar.time = 0; avatar.update(1 / 60, {}); root.updateMatrixWorld(true); };
  return { avatar, root, clock, pose };
}
const top = (f) => f.avatar.bones.head.localToWorld(V.set(0, 0.2, 0.02)).clone(); // a point on the crown / brow, world
const quats = (f) => ['torso', 'head', 'hips', 'shoulderL', 'shoulderR'].map((n) => f.avatar.bones[n].quaternion.toArray());

test('#2036 the response snaps to its peak, overshoots once and is exactly 0 after the fade', () => {
  let peak = 0, at = 0, low = 0;
  for (let s = 0; s <= 1.2; s += 0.001) { const r = hitResponse(s); if (r > peak) { peak = r; at = s; } low = Math.min(low, r); }
  assert(Math.abs(peak - 1) < 0.01 && at > 0.06 && at < 0.14, `peak ${peak} at ${at}`);
  assert(low < -0.2 && low > -0.5, `overshoot ${low}`);
  assert.equal(hitResponse(H.fade[1]), 0); assert.equal(hitResponse(0), 0); assert.equal(hitResponse(-1), 0);
  assert(Math.abs(hitResponse(H.fade[1] - 0.01)) < 0.01);
});

test('#2036 front, side and back give different kicks; head and body hits differ', () => {
  const dirs = { front: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] }; // travel direction in the figure frame (from the front: towards -z)
  for (const head of [true, false]) {
    const k = Object.fromEntries(Object.entries(dirs).map(([n, d]) => [n, hitKick(d, head).amp]));
    const names = Object.keys(k);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const d = Math.hypot(...k[names[i]].map((v, n) => v - k[names[j]][n]));
      assert(d > 0.2, `${head ? 'head' : 'body'} ${names[i]} vs ${names[j]}: ${d}`);
    }
    if (head) { assert(k.front[3] < -0.3, 'a head hit from the front snaps the head back'); assert(k.back[3] > 0.3, 'from behind: forward'); assert(Math.abs(k.left[4]) > 0.2 && Math.abs(k.left[5]) > 0.2, 'from the side: tilts and turns'); }
    else { assert(k.front[0] > 0.2, 'a body hit from the front folds the torso'); assert(k.back[0] > 0.1 && k.back[3] < -0.25, 'from behind: shoved forward, the head whips back'); assert(Math.abs(k.left[1]) > 0.15 && Math.abs(k.left[2]) > 0.15, 'from the side: bends and twists'); }
  }
  // the figure frame: a ghost at yaw 0 faces world -z (Avatar.object turned π); a shooter at world -z is in front of it
  const fwd = hitDir({ x: 0, z: -3 }, { x: 0, z: 0 }, Math.PI);
  assert(fwd[1] < -0.99, `front ${fwd}`);
  const side = hitDir({ x: -3, z: 0 }, { x: 0, z: 0 }, Math.PI); // at skeleton yaw π its local +x (its left) is world -x
  assert(Math.abs(side[0]) > 0.99, `side ${side}`);
});

test('#2036 the real Avatar flinches differently from front / side / back and returns to the unhit pose', () => {
  const shooters = { front: [0, -4], back: [0, 4], left: [-4, 0], right: [4, 0] }; // world [x, z]; the figure (yaw 0) faces -z
  for (const head of [true, false]) {
    const moves = {};
    for (const [name, [x, z]] of Object.entries(shooters)) {
      const f = figure(0);
      f.pose(0); const rest = top(f), restQ = quats(f), rootM = f.avatar.bones.hips.parent.matrixWorld.clone();
      const boxRay = [[0, 1.7, -3], [0, 0, 1]], boxes = rifleBoxHeadContact('hit-2036', { p: [0, 0, 0], r: 0, c: false }, ...boxRay, 20);
      flinchGhost(f, new THREE.Vector3(x, 1.6, z), head); // uses its own clock: re-kick on the virtual one
      f.avatar.hitFx.kicks.length = 0; f.avatar.hitFx.kick(hitDir({ x, z }, { x: 0, z: 0 }, f.root.rotation.y + f.avatar.object.rotation.y), head, 1000);
      let max = 0, at = null;
      for (let t = 1000; t <= 1000 + (H.fade[1] + H.lag) * 1000; t += 1000 / 60) { f.pose(t); const d = top(f).sub(rest); if (d.length() > max) { max = d.length(); at = d; } }
      moves[name] = at;
      assert(max > 0.04, `${head ? 'head' : 'body'} ${name}: the head moves ${max.toFixed(3)} m`);
      // the hit boxes and the skeleton's root follow the state only
      assert.deepEqual(rifleBoxHeadContact('hit-2036', { p: [0, 0, 0], r: 0, c: false }, ...boxRay, 20), boxes, 'head boxes unchanged');
      assert(f.avatar.bones.hips.parent.matrixWorld.equals(rootM), 'skeleton root unchanged');
      f.pose(1000 + (H.fade[1] + H.lag) * 1000 + 20);
      assert.equal(f.avatar.hitFx.active, false, 'the kick is over');
      quats(f).forEach((q, i) => q.forEach((v, j) => assert(Math.abs(v - restQ[i][j]) < 1e-9, `${name} bone ${i} back to rest`)));
      assert(top(f).distanceTo(rest) < 1e-9, `${name}: back to the unhit pose`);
      if (head) { // pushed away from the shooter
        const away = new THREE.Vector3(-x, 0, -z).normalize();
        assert(at.dot(away) > 0.02, `head hit ${name}: the head goes away from the shooter (${at.toArray().map((v) => v.toFixed(3))})`);
      }
    }
    const n = Object.keys(moves);
    for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) assert(moves[n[i]].distanceTo(moves[n[j]]) > 0.04, `${head ? 'head' : 'body'} ${n[i]} vs ${n[j]}`);
    console.log(head ? 'head' : 'body', Object.fromEntries(Object.entries(moves).map(([k, v]) => [k, v.toArray().map((x) => +x.toFixed(3))])));
  }
});

test('#2036 overlapping hits stay bounded; no kick, no change', () => {
  const fx = new HitFx(() => 0), B = { torso: { quaternion: new THREE.Quaternion() }, head: { quaternion: new THREE.Quaternion() } };
  fx.apply(B, 0); assert.deepEqual(B.torso.quaternion.toArray(), [0, 0, 0, 1]);
  for (let i = 0; i < 10; i++) fx.kick([0, -1], true, i * 10);
  assert(fx.kicks.length <= H.kicks);
  for (let t = 0; t < 1500; t += 5) assert(fx.offsets(t).every((v) => Math.abs(v) <= H.max + 1e-12));
});

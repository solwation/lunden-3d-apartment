import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SQUIRRELS as C, PADDOCK, SITE } from './config.js';
import { Holdable, heldItem, setHeld } from './holdable.js';
import { Hearts } from './pingping.js';
import { registerSeasonal } from './seasons.js';
import { SquirrelBrain, NutField, linkTrees, winterMonth } from './squirrelbrain.js';

// Squirrels and the nuts they look for (#1672). The brains live in squirrelbrain.js (no three.js); this file draws them and ties them to
// the game: the crowns and ground come from the trees built in surroundings.js (river park patches and the paddock's shade trees, read
// from `treeFeet`/`aoTrees` so new trees there are used without a change here), the nuts are ordinary holdables (E takes one, E on a surface
// puts it down), crouching still with a nut in the hand lures a squirrel, and the feeding scores through `onFeed`.
// Cost: one merged mesh per squirrel (3 draw calls, shared material, no extra light or shadow caster), a nut mesh only while it lies out,
// a hidden squirrel/nut in winter costs nothing; the AI thinks every frame only within `simDist` m of the eye, every `farStep` s up to
// `farDist`, and not at all beyond.

const V = new THREE.Vector3(), tint = new THREE.Color();
const paint = (geo, hex) => {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3); tint.setHex(hex);
  for (let i = 0; i < n; i++) tint.toArray(c, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
};
/** A unit sphere squashed to radii (rx, ry, rz) at (x, y, z), in one colour; `belly`: lighter underneath (vertex colours blended by the normal). */
const blob = (rx, ry, rz, x, y, z, hex, belly = null) => {
  const g = new THREE.SphereGeometry(1, 9, 7); g.deleteAttribute('uv');
  const nrm = g.attributes.normal, a = new THREE.Color(hex), b = belly === null ? a : new THREE.Color(belly), col = new Float32Array(nrm.count * 3), m = new THREE.Color();
  for (let i = 0; i < nrm.count; i++) { m.copy(b).lerp(a, THREE.MathUtils.smoothstep(nrm.getY(i), -0.45, 0.25)); m.toArray(col, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(rx, ry, rz); g.translate(x, y, z); return g;
};

/** One squirrel, metres, feet at y 0, nose +z, body about 22 cm and a 20 cm tail curled over the back. Tail tip coloured per animal. */
function squirrelGeometry(s) {
  const w = s.width, parts = [
    blob(0.044 * w, 0.05, 0.1, 0, 0.085, -0.005, s.color, s.belly),   // body
    blob(0.05 * w, 0.055, 0.06, 0, 0.075, -0.065, s.color, s.belly),   // haunch
    blob(0.036 * w, 0.037, 0.04, 0, 0.128, 0.095, s.color, s.belly),   // head
    blob(0.016 * w, 0.015, 0.02, 0, 0.118, 0.13, s.belly, s.belly),    // muzzle
    blob(0.009, 0.014, 0.006, 0.023 * w, 0.168, 0.085, s.color),       // ears
    blob(0.009, 0.014, 0.006, -0.023 * w, 0.168, 0.085, s.color),
    blob(0.006, 0.006, 0.006, 0.027 * w, 0.138, 0.12, 0x151210),        // eyes
    blob(0.006, 0.006, 0.006, -0.027 * w, 0.138, 0.12, 0x151210),
    blob(0.012, 0.012, 0.03, 0.026 * w, 0.025, 0.06, s.color),          // fore paws
    blob(0.012, 0.012, 0.03, -0.026 * w, 0.025, 0.06, s.color),
    blob(0.015, 0.014, 0.045, 0.034 * w, 0.02, -0.07, s.color),         // hind feet
    blob(0.015, 0.014, 0.045, -0.034 * w, 0.02, -0.07, s.color),
  ];
  const tail = [[0.14, -0.13, 0.033], [0.2, -0.17, 0.042], [0.26, -0.17, 0.048], [0.31, -0.13, 0.05], [0.34, -0.07, 0.046], [0.35, -0.01, 0.04]]; // y, z, radius
  tail.forEach(([y, z, r], i) => parts.push(blob(r * 0.85 * w, r * 1.05, r * 1.15, 0, y, z, s.tip && i >= tail.length - 2 ? s.tip : s.tail)));
  const g = mergeGeometries(parts, false); for (const p of parts) p.dispose();
  return g;
}

/** An acorn (0) or a hazelnut (1) of real size 3 cm; the mesh is scaled by SQUIRRELS.nutSize. */
const nutGeos = [
  mergeGeometries([blob(0.011, 0.016, 0.011, 0, 0.012, 0, 0xb98a4a), blob(0.0125, 0.008, 0.0125, 0, 0.024, 0, 0x6b5030), blob(0.002, 0.004, 0.002, 0, 0.033, 0, 0x4a3820)]),
  mergeGeometries([blob(0.0145, 0.0155, 0.0145, 0, 0.0145, 0, 0xc19a5b), blob(0.012, 0.007, 0.012, 0, 0.004, 0, 0x7d6038)]),
];

/** A nut on the ground you can take (E), carry and put down like anything else. Its slot (NutField) says whether it lies out. */
class Nut extends Holdable {
  constructor(scene, camera, slot, material) {
    const mesh = new THREE.Mesh(nutGeos[0], material);
    mesh.scale.setScalar(C.nutSize); mesh.visible = false; mesh.userData.noDetail = true;
    const sphere = new THREE.Sphere(), hit = new THREE.Vector3();
    mesh.raycast = function (rc, out) { // a generous 8 cm ball to aim at: the nut itself is 3 cm
      sphere.set(this.getWorldPosition(V), 0.08);
      if (rc.ray.intersectSphere(sphere, hit)) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this });
    };
    super(scene, camera, { name: 'en nöt', verb: 'ta', backName: 'marken', backVerb: 'lägga', model: mesh, home: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(0.14, -0.15, -0.36), rot: new THREE.Euler(0.5, 0.7, 0.3) }, pick: { pos: new THREE.Vector3(), size: [0.1, 0.1, 0.1] } });
    Object.assign(this, { slot, isSquirrelNut: true, broken: true });
    this.pickMesh = this.holder.children[this.holder.children.length - 1];
  }
  onTake() { this.slot.held = true; this.slot.age = 0; }
  onPut() { this.slot.held = false; this.slot.age = 0; }
  /** Out of the world (eaten, fed, expired, winter): no target, no mesh. */
  vanish() {
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    this.model.removeFromParent(); this.model.visible = false; this.broken = true; this.placed = false;
  }
  appear() {
    const s = this.slot;
    this.broken = false; this.model.geometry = nutGeos[s.kind]; this.rest = null;
    this.home.pos.set(s.x, s.y + 0.004, s.z); this.home.rot.set(0, Math.random() * 6.28, s.kind ? 0 : 1.2);
    this.pickMesh.position.copy(this.home.pos); this.goHome(); this.model.visible = true;
  }
  sync() {
    const s = this.slot;
    if (s.alive === this.broken) { s.alive ? this.appear() : this.vanish(); }
    if (s.alive && !this.held && !this.broken) s.x = this.model.position.x, s.y = this.model.position.y, s.z = this.model.position.z;
  }
}

export class Squirrels {
  /** `feet`: surroundings.js treeFeet, `crowns`: its aoTrees, `ground(x, z)`: the walkable surface, `walkable(x, z)` / `nutOk(x, z)`: where it may run / a nut may lie,
   * `onFeed(brain)`: scoring. `rnd`: injectable for tests. */
  constructor({ scene, camera, player, feet, crowns, ground, walkable, nutOk, onFeed, rnd = Math.random }) {
    Object.assign(this, { scene, camera, player, ground, onFeed, rnd, winter: true, time: 0, speed: 0, acc: [], lastX: NaN, lastZ: NaN, lure: false });
    const parkPatches = new Set([...(SITE.riverPark.patches ?? []).map((q) => q.name), 'bridge-west']), // (the other `patch` names in treeFeet belong to the street/backdrop areas)
      paddock = PADDOCK.trees ?? [], same = (a, b) => Math.abs(a.x - b[0]) < 0.01 && Math.abs(a.z - b[1]) < 0.01;
    this.trees = linkTrees(feet.filter((f) => parkPatches.has(f.patch) || paddock.some(([x, z]) => same(f, [x, z]))).map((f) => {
      let best = null, bd = 0.05; for (const c of crowns) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < bd) { bd = d; best = c; } }
      return { x: f.x, z: f.z, y: f.y, cy: best ? best.y : f.y + 5, r: best ? best.r : 3 };
    }));
    this.player_ = { x: 0, z: 0, lure: false, hx: 0, hz: 0 };
    this.nuts = new NutField(this.trees, ground, nutOk, rnd);
    const env = { trees: this.trees, ground, walkable, nuts: this.nuts, player: this.player_, rnd, onTake: (b) => this.take(b) };
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.nutMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    this.hearts = new Hearts(scene, C.hearts, C.heartScale);
    this.nutItems = this.nuts.slots.map((s) => new Nut(scene, camera, s, this.nutMaterial));
    const taken = new Set();
    this.animals = this.trees.length ? C.animals.map((spec, i) => {
      const [sx, sz] = C.starts[i % C.starts.length]; let best = 0, bd = Infinity;
      this.trees.forEach((t, j) => { const d = Math.hypot(t.x - sx, t.z - sz) + (taken.has(j) ? 1e6 : 0); if (d < bd) { bd = d; best = j; } });
      taken.add(best);
      const brain = new SquirrelBrain(spec, env, best), group = new THREE.Group(), body = new THREE.Mesh(squirrelGeometry(spec), this.material);
      body.scale.setScalar(spec.scale); body.userData.noDetail = true; body.raycast = () => {}; body.name = `squirrel-${i}`;
      const mouth = new THREE.Mesh(nutGeos[0], this.nutMaterial); mouth.scale.setScalar(C.nutSize * spec.scale); mouth.position.set(0, 0.112 * spec.scale, 0.15 * spec.scale);
      mouth.rotation.x = Math.PI / 2; mouth.visible = false; mouth.raycast = () => {}; mouth.userData.noDetail = true;
      group.rotation.order = 'YXZ'; group.add(body, mouth); group.visible = false; scene.add(group);
      this.acc.push(0);
      return { brain, group, mouth, body, spec };
    }) : [];
    registerSeasonal((month) => { this.winter = winterMonth(month); });
    this.hide();
  }
  hide() { for (const a of this.animals) a.group.visible = false; }
  /** The visitor's hand: a nut held, crouched all the way down, hardly moving. */
  watchPlayer(dt) {
    const pos = this.camera.getWorldPosition(V), p = this.player_;
    if (Number.isFinite(this.lastX) && dt > 0) this.speed += (Math.hypot(pos.x - this.lastX, pos.z - this.lastZ) / dt - this.speed) * Math.min(1, dt * 6);
    this.lastX = pos.x; this.lastZ = pos.z;
    const it = heldItem();
    p.x = pos.x; p.z = pos.z; p.lure = !!(this.player.crouched && it?.isSquirrelNut && this.speed < C.still);
    const d = this.camera.getWorldDirection(new THREE.Vector3()), l = Math.hypot(d.x, d.z) || 1;
    p.hx = pos.x + d.x / l * C.handAhead; p.hz = pos.z + d.z / l * C.handAhead;
  }
  /** A squirrel reaches the hand: the nut in it is theirs; points and hearts for the visitor. */
  take(brain) {
    const it = heldItem();
    if (!it?.isSquirrelNut) return false;
    const a = this.animals.find((q) => q.brain === brain);
    this.nuts.remove(it.slot); it.sync(); // gone from the hand
    V.set(brain.x, brain.y + 0.2 * brain.spec.scale, brain.z); this.hearts.burst(V);
    this.onFeed?.(brain, a);
    return true;
  }
  /** Per frame. `hidden`: underground (nothing runs). */
  update(dt, hidden = false) {
    this.hearts.update(dt);
    const on = !this.winter && !hidden && this.animals.length > 0;
    this.nuts.setActive(!this.winter && this.animals.length > 0);
    if (!on) { if (this.animals.some((a) => a.group.visible)) this.hide(); }
    if (this.nuts.active) { this.nuts.update(dt); }
    for (const n of this.nutItems) if (this.nuts.active || !n.broken) n.sync();
    if (!on) return;
    this.time += dt;
    this.watchPlayer(dt);
    const cam = this.camera.position;
    this.animals.forEach((a, i) => {
      const b = a.brain, d = Math.hypot(cam.x - b.x, cam.z - b.z);
      if (d > C.farDist) { a.group.visible = false; return; }
      if (d > C.simDist) { this.acc[i] += dt; if (this.acc[i] < C.farStep) return; b.update(this.acc[i]); this.acc[i] = 0; } else { b.update(this.acc[i] + dt); this.acc[i] = 0; }
      this.pose(a, d);
    });
  }
  pose(a, d) {
    const b = a.brain, g = a.group, run = b.run, hop = run > 0.05 && !['down', 'up', 'leap'].includes(b.state) ? Math.abs(Math.sin(this.time * 14 + b.spec.scale * 9)) * 0.035 * run : 0;
    g.visible = d < C.drawDist;
    g.position.set(b.x, b.y + hop * b.spec.scale, b.z);
    const sway = b.state === 'perch' ? Math.sin(this.time * 0.9 + b.spec.scale * 7) * 0.5 : 0;
    g.rotation.y = b.yaw + sway;
    g.rotation.x = -(b.pitch + b.rise * 1.05 - (hop > 0 ? Math.sin(this.time * 14) * 0.12 : 0));
    a.mouth.visible = b.hasNut;
  }
  /** For tests: where each squirrel is and what it does. */
  state() { return this.animals.map((a) => ({ name: a.spec.name, state: a.brain.state, x: a.brain.x, y: a.brain.y, z: a.brain.z, hasNut: a.brain.hasNut, visible: a.group.visible })); }
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SQUIRRELS as C, PADDOCK, SITE } from './config.js';
import { Holdable, heldItem, setHeld } from './holdable.js';
import { Hearts } from './pingping.js';
import { registerSeasonal } from './seasons.js';
import { SquirrelBrain, NutField, linkTrees, winterMonth } from './squirrelbrain.js';
import { SquirrelSync } from './squirrelsync.js';

// Squirrels and the nuts they look for (#1672). The brains live in squirrelbrain.js (no three.js); this file draws them and ties them to
// the game: the crowns and ground come from the trees built in surroundings.js (river park patches and the paddock's shade trees, read
// from `treeFeet`/`aoTrees` so new trees there are used without a change here), the nuts are ordinary holdables (E takes one, E on a surface
// puts it down), crouching still with a nut in the hand lures a squirrel, and the feeding scores through `onFeed`.
// Cost: one merged mesh per squirrel (3 draw calls, shared material, no extra light or shadow caster), a nut mesh only while it lies out,
// a hidden squirrel/nut in winter costs nothing; the AI thinks every frame only within `simDist` m of the eye, every `farStep` s up to
// `farDist`, and not at all beyond.
// #1686: 18 nuts (not 6), bigger, each lying under an additive glint (a flat ring + a thin beam: ONE instanced mesh for all of them, so no draw
// call per nut; the nut's own mesh is drawn only within `nutNear` m), and the squirrels + nuts are shared between the players near them through
// squirrelsync.js (`net`: { send(m), remotes(), me() }, set by main.js): the leader simulates, the others adopt its snapshots.

const V = new THREE.Vector3(), tint = new THREE.Color(), MAT = new THREE.Matrix4();
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

/** #1697: how strong the glint is at a daylight level (0 night … 1 day): dark at night and dusk, full by day, eased in between. */
export function markStrength(daylight) {
  const [a, b] = C.markDay, t = Math.min(1, Math.max(0, (daylight - a) / (b - a)));
  return C.markNight + (1 - C.markNight) * t * t * (3 - 2 * t);
}

/** #1686: the glint under every nut lying out: a flat ring and a thin crossed beam, vertex colours fading the beam to black (additive), one geometry. */
function markGeometry() {
  const parts = [], paintFade = (g, top) => {
    const pos = g.attributes.position, c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = top ? Math.max(0, 1 - pos.getY(i) / C.markBeam) : 1; c[i * 3] = 1 * k * 0.8; c[i * 3 + 1] = 0.82 * k * 0.8; c[i * 3 + 2] = 0.45 * k * 0.8; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  };
  const ring = new THREE.RingGeometry(C.markRing * 0.7, C.markRing, 20); ring.rotateX(-Math.PI / 2); ring.translate(0, 0.03, 0); ring.deleteAttribute('uv'); parts.push(paintFade(ring, false));
  for (const a of [0, Math.PI / 2]) { const q = new THREE.PlaneGeometry(0.05, C.markBeam, 1, 4); q.translate(0, C.markBeam / 2 + 0.02, 0); q.rotateY(a); q.deleteAttribute('uv'); parts.push(paintFade(q, true)); }
  const g = mergeGeometries(parts); for (const p of parts) p.dispose(); return g;
}

/** A nut on the ground you can take (E), carry and put down like anything else. Its slot (NutField) says whether it lies out. */
class Nut extends Holdable {
  constructor(scene, camera, slot, material, host) {
    const mesh = new THREE.Mesh(nutGeos[0], material);
    mesh.scale.setScalar(C.nutSize); mesh.visible = false; mesh.userData.noDetail = true;
    const sphere = new THREE.Sphere(), hit = new THREE.Vector3();
    mesh.raycast = function (rc, out) { // a generous 12 cm ball to aim at: the nut itself is 3 cm (7 cm drawn)
      sphere.set(this.getWorldPosition(V), 0.12);
      if (rc.ray.intersectSphere(sphere, hit)) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this });
    };
    super(scene, camera, { name: 'en nöt', verb: 'ta', backName: 'marken', backVerb: 'lägga', model: mesh, home: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(0.14, -0.15, -0.36), rot: new THREE.Euler(0.5, 0.7, 0.3) }, pick: { pos: new THREE.Vector3(), size: [0.1, 0.1, 0.1] } });
    Object.assign(this, { slot, host, isSquirrelNut: true, broken: true });
    this.pickMesh = this.holder.children[this.holder.children.length - 1];
  }
  onTake() { this.slot.held = true; this.slot.by = null; this.slot.age = 0; this.host.sync.take(this.slot); }
  onPut() { this.slot.held = false; this.slot.age = 0; this.putPending = true; } // (where it lies is known once placeAt / goHome has moved the model: sync())
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
  /** Out of play for everybody else: another player holds it (the leader keeps the slot, #1686). */
  get away() { return this.slot.held && !!this.slot.by; }
  sync() {
    const s = this.slot, want = s.alive && !this.away;
    if (want === this.broken) { want ? this.appear() : this.vanish(); }
    if (want && !this.held && !this.broken) {
      s.x = this.model.position.x; s.y = this.model.position.y; s.z = this.model.position.z;
      if (this.putPending) { this.putPending = false; this.host.sync.put(s, s.x, s.z); }
      const cam = this.camera.position; this.model.visible = Math.hypot(cam.x - s.x, cam.z - s.z) < C.nutNear; // far away only the glint is drawn
    }
  }
}

export class Squirrels {
  /** `feet`: surroundings.js treeFeet, `crowns`: its aoTrees, `ground(x, z)`: the walkable surface, `walkable(x, z)` / `nutOk(x, z)`: where it may run / a nut may lie,
   * `onFeed(brain)`: scoring. `rnd`: injectable for tests. */
  constructor({ scene, camera, player, feet, crowns, ground, walkable, nutOk, onFeed, rnd = Math.random }) {
    Object.assign(this, { scene, camera, player, ground, onFeed, rnd, winter: true, time: 0, speed: 0, acc: [], lastX: NaN, lastZ: NaN, lure: false, net: null, cand: [], remoteSpeed: new Map(), markT: 0, daylight: 1 });
    const parkPatches = new Set([...(SITE.riverPark.patches ?? []).map((q) => q.name), 'bridge-west']), // (the other `patch` names in treeFeet belong to the street/backdrop areas)
      paddock = PADDOCK.trees ?? [], same = (a, b) => Math.abs(a.x - b[0]) < 0.01 && Math.abs(a.z - b[1]) < 0.01;
    this.trees = linkTrees(feet.filter((f) => parkPatches.has(f.patch) || paddock.some(([x, z]) => same(f, [x, z]))).map((f) => {
      let best = null, bd = 0.05; for (const c of crowns) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < bd) { bd = d; best = c; } }
      return { x: f.x, z: f.z, y: f.y, cy: best ? best.y : f.y + 5, r: best ? best.r : 3 };
    }));
    this.player_ = { x: 0, z: 0, lure: false, hx: 0, hz: 0, id: '' };
    this.nuts = new NutField(this.trees, ground, nutOk, rnd);
    this.nuts.anchors = () => [{ x: camera.position.x, z: camera.position.z }, ...(this.net?.remotes?.() ?? []).map((r) => ({ x: r.x, z: r.z }))];
    const env = { trees: this.trees, ground, walkable, nuts: this.nuts, player: this.player_, rnd, onTake: (b) => this.take(b) };
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.nutMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    this.hearts = new Hearts(scene, C.hearts, C.heartScale);
    this.sync = new SquirrelSync({ field: this.nuts, brains: [], send: (m) => this.net?.send(m) ?? false, hooks: { fed: (an, who) => this.fedBy(an, who), dropHeld: (slot) => this.dropHeld(slot) } });
    this.nutItems = this.nuts.slots.map((s) => new Nut(scene, camera, s, this.nutMaterial, this));
    this.marks = new THREE.InstancedMesh(markGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }), C.maxNuts);
    Object.assign(this.marks, { frustumCulled: false, raycast: () => {}, visible: false, count: 0 }); this.marks.userData.noDetail = true; this.marks.userData.warmDraw = true; this.marks.name = 'squirrel-nut-marks'; scene.add(this.marks);
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
    this.sync.brains.push(...this.animals.map((a) => a.brain));
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
    p.id = this.net?.me?.() ?? '';
    // #1686: the leader also lets the other players' lures count (what it knows of their ghosts), but only for a nut the room says they hold
    this.cand.length = 0; this.cand.push({ id: p.id, x: p.x, z: p.z, lure: p.lure, hx: p.hx, hz: p.hz });
    if (this.sync.lead && this.sync.sharing) for (const r of this.net?.remotes?.() ?? []) {
      const lure = r.hi === 'nut' && r.crouch > 0.85 && r.vh < C.still && this.sync.remoteHeld.has(r.id);
      this.cand.push({ id: r.id, x: r.x, z: r.z, lure, hx: r.x - Math.sin(r.yaw) * C.handAhead, hz: r.z - Math.cos(r.yaw) * C.handAhead });
    }
  }
  /** The visitor a squirrel pays attention to: the nearest one holding a lure within its range, else the nearest of all. Copied into the brains' `player`. */
  focus(b) {
    let best = null, bd = Infinity;
    for (const c of this.cand) { const d = Math.hypot(c.x - b.x, c.z - b.z) - (c.lure && Math.hypot(c.x - b.x, c.z - b.z) < b.spec.lure ? 1e4 : 0); if (d < bd) { bd = d; best = c; } }
    Object.assign(this.player_, best ?? { x: 1e5, z: 1e5, lure: false, hx: 1e5, hz: 1e5, id: '' }); b.who = this.player_.id;
  }
  /** A squirrel reaches a hand: the nut in it is theirs; points and hearts for whoever fed it (#1686: the leader may be feeding another player's nut). */
  take(brain) {
    const a = this.animals.find((q) => q.brain === brain), an = this.animals.indexOf(a), me = this.net?.me?.() ?? '', who = brain.who ?? me;
    if (who === me) {
      const it = heldItem();
      if (!it?.isSquirrelNut) return false;
      this.sync.feed(it.slot, me, an);
      this.nuts.remove(it.slot); it.sync(); // gone from the hand
      this.onFeed?.(brain, a);
    } else { // another player's hand (we lead): their nut is claimed in the room
      const i = this.sync.remoteHeld.get(who), slot = this.nuts.slots[i];
      if (!slot || !slot.held) return false;
      this.sync.feed(slot, who, an); this.nuts.remove(slot); this.nutItems[i].sync();
    }
    V.set(brain.x, brain.y + 0.2 * brain.spec.scale, brain.z); this.hearts.burst(V);
    return true;
  }
  /** Follower: the leader's squirrel `an` took `who`'s nut: hearts for everybody, the nut and the points for the feeder. */
  fedBy(an, who) {
    const a = this.animals[an]; if (!a) return;
    V.set(a.brain.x, a.brain.y + 0.2 * a.brain.spec.scale, a.brain.z); this.hearts.burst(V);
    if (who !== (this.net?.me?.() ?? '')) return;
    const it = heldItem(); if (!it?.isSquirrelNut) return;
    it.slot.alive = false; it.slot.held = false; it.sync(); this.onFeed?.(a.brain, a);
  }
  /** The room refused our take (somebody was first): the nut leaves the hand again. */
  dropHeld(slot) { const it = this.nutItems[this.nuts.slots.indexOf(slot)]; if (!it?.held) return; slot.alive = false; slot.held = false; it.sync(); }
  /** Per frame: the glint under each nut lying out within `markDist` m (one instanced mesh). */
  updateMarks() {
    const m = this.marks, cam = this.camera.position; let n = 0;
    const str = markStrength(this.daylight); m.material.opacity = str; // (additive: opacity 0 = no light at all; nothing is drawn below 2 %)
    for (const s of this.nuts.slots) {
      if (!s.alive || s.held) continue;
      const d = Math.hypot(cam.x - s.x, cam.z - s.z); if (d > C.markDist) continue;
      const k = (1 + Math.max(0, d - 5) * 0.07) * (1 + 0.1 * Math.sin(this.time * 3 + n));
      m.setMatrixAt(n++, MAT.makeScale(k, k, k).setPosition(s.x, s.y, s.z));
    }
    m.count = n; m.visible = n > 0 && str > 0.02; m.instanceMatrix.needsUpdate = true;
  }
  /** Per frame. `hidden`: underground (nothing runs). */
  update(dt, hidden = false, daylight = 1) {
    this.daylight = daylight;
    this.hearts.update(dt);
    const on = !this.winter && !hidden && this.animals.length > 0;
    this.nuts.setActive(!this.winter && this.animals.length > 0);
    if (!on) { if (this.animals.some((a) => a.group.visible)) this.hide(); }
    const cam = this.camera.position, follow = this.sync.follow;
    if (on) { // near the squirrels (hysteresis): join the shared group (#1686)
      const near = this.animals.reduce((m, a) => Math.min(m, Math.hypot(cam.x - a.brain.x, cam.z - a.brain.z)), Infinity);
      this.sync.setNear(!!this.net?.ready() && near < (this.sync.near ? C.sync.leave : C.sync.enter));
    } else this.sync.setNear(false);
    if (this.nuts.active && !follow) { this.nuts.update(dt); }
    for (const n of this.nutItems) if (this.nuts.active || !n.broken) n.sync();
    if (this.nuts.active) this.updateMarks(); else if (this.marks.visible) this.marks.visible = false;
    if (!on) return;
    this.time += dt;
    this.watchPlayer(dt);
    this.sync.tick(dt);
    this.animals.forEach((a, i) => {
      const b = a.brain, d = Math.hypot(cam.x - b.x, cam.z - b.z);
      // #1686: the leader simulates for everybody: a squirrel is awake when ANY player near the squirrels is within range of it
      let ds = d; if (!follow) for (const c of this.cand) ds = Math.min(ds, Math.hypot(c.x - b.x, c.z - b.z));
      if (d > C.farDist && (follow || ds > C.farDist)) { a.group.visible = false; return; }
      if (!follow) {
        this.focus(b);
        if (ds > C.simDist) { this.acc[i] += dt; if (this.acc[i] < C.farStep) return; b.update(this.acc[i]); this.acc[i] = 0; } else { b.update(this.acc[i] + dt); this.acc[i] = 0; }
      }
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

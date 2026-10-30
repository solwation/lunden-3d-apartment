import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SQUIRRELS as C, PADDOCK, SITE, WALK } from './config.js';
import { Holdable, heldItem, setHeld } from './holdable.js';
import { Hearts } from './pingping.js';
import { sfx } from './audio.js';
import { registerSeasonal } from './seasons.js';
import { SquirrelBrain, NutField, linkTrees, riverFrame, winterMonth } from './squirrelbrain.js';
import { SquirrelSync } from './squirrelsync.js';

// Squirrels and the nuts they look for (#1672). The brains live in squirrelbrain.js (no three.js); this file draws them and ties them to
// the game: the crowns and ground come from the trees built in surroundings.js (river park patches and the paddock's shade trees, read
// from `treeFeet`/`aoTrees` so new trees there are used without a change here), the nuts are ordinary holdables (E takes one, E on a surface
// puts it down), crouching still with a nut in the hand lures a squirrel, and the feeding scores through `onFeed`.
// Cost: one merged mesh per squirrel (3 draw calls, shared material, no extra light or shadow caster), a nut mesh only while it lies out,
// a hidden squirrel/nut in winter costs nothing; the AI thinks every frame only within `simDist` m of the eye, every `farStep` s up to
// `farDist`, and beyond it only the coarse tree-graph step (#1716: the squirrels roam the whole Höje å valley).
// #1686: 18 nuts (not 6), bigger, each lying under an additive glint (a flat ring + a thin beam: ONE instanced mesh for all of them, so no draw
// call per nut; the nut's own mesh is drawn only within `nutNear` m), and the squirrels + nuts are shared between the players near them through
// squirrelsync.js (`net`: { send(m), remotes(), me() }, set by main.js): the leader simulates, the others adopt its snapshots.

const V = new THREE.Vector3(), tint = new THREE.Color(), MAT = new THREE.Matrix4();
const paint = (geo, hex) => {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3); tint.setHex(hex);
  for (let i = 0; i < n; i++) tint.toArray(c, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
};
/** A unit sphere squashed to radii (rx, ry, rz) at (x, y, z), in one colour; `belly`: lighter underneath (vertex colours blended by the normal).
 * #1716: `seg` [width, height] segments, `fur`: ± that much brightness noise per vertex (a mottled coat), from `rnd`. */
const blob = (rx, ry, rz, x, y, z, hex, belly = null, seg = [9, 7], fur = 0, rnd = Math.random) => {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]); g.deleteAttribute('uv');
  const nrm = g.attributes.normal, a = new THREE.Color(hex), b = belly === null ? a : new THREE.Color(belly), col = new Float32Array(nrm.count * 3), m = new THREE.Color();
  for (let i = 0; i < nrm.count; i++) { m.copy(b).lerp(a, THREE.MathUtils.smoothstep(nrm.getY(i), -0.45, 0.25)); if (fur) m.multiplyScalar(1 + (rnd() - 0.5) * 2 * fur); m.toArray(col, i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(rx, ry, rz); g.translate(x, y, z); return g;
};
const seeded = (seed) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
const mixHex = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
const UP = new THREE.Vector3(0, 1, 0), QT = new THREE.Quaternion(), HAUNCH = 0.065; // m behind the body centre: where it sits (#1716)
/** #1716: a hair tuft: an open cone `len` long from `at` along `dir`, `root` colour at the base fading to `tip` at the point. */
function tuft(at, dir, len, r, root, tip, segs) {
  const g = new THREE.ConeGeometry(r, len, segs, 1, true); g.deleteAttribute('uv');
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c0 = new THREE.Color(root), c1 = new THREE.Color(tip), m = new THREE.Color();
  for (let i = 0; i < pos.count; i++) m.copy(c0).lerp(c1, pos.getY(i) / len + 0.5).toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, len / 2, 0); g.applyQuaternion(QT.setFromUnitVectors(UP, dir.clone().normalize())); g.translate(at.x, at.y, at.z); return g;
}
/** #1716: a soft hair lock: a small ellipsoid `len` long from `at` along `dir` (rounded, not a spike), `root` colour fading to `tip`. */
function lock(at, dir, len, r, root, tip, seg) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]); g.deleteAttribute('uv');
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c0 = new THREE.Color(root), c1 = new THREE.Color(tip), m = new THREE.Color();
  for (let i = 0; i < pos.count; i++) m.copy(c0).lerp(c1, pos.getY(i) * 0.5 + 0.5).toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(r, len / 2, r * 0.75); g.translate(0, len * 0.35, 0); g.applyQuaternion(QT.setFromUnitVectors(UP, dir.clone().normalize())); g.translate(at.x, at.y, at.z); return g;
}
/** #1716: the tail's centre line (y, z) at rest (curled up over the back, as before) and flicked (raised, the tip snapped forward). */
const TAIL = {
  rest: [[0.075, -0.1], [0.14, -0.15], [0.2, -0.18], [0.26, -0.175], [0.31, -0.135], [0.34, -0.075], [0.35, -0.015]],
  flick: [[0.075, -0.1], [0.15, -0.13], [0.22, -0.13], [0.28, -0.1], [0.32, -0.05], [0.33, 0.01], [0.31, 0.055]],
};

/** One squirrel's parts, metres, feet at y 0, nose +z, body about 22 cm and a 20 cm bushy tail curled over the back. #1716: a head with cheeks,
 * muzzle, nose, shining eyes and tufted ears, fore legs with paws, hind legs with long feet, a mottled coat and a fluffy tail (a core of soft
 * blobs and many hair tufts frosted at the tips; the tail tip coloured per animal). `far`: the cheaper distant version. `pose`: { flick } the tail
 * flicked, { head: ±1 } the head turned left / right (the morph targets; every pose has the same vertices). */
function squirrelParts(s, far, pose = {}) {
  const rnd = seeded(1716 + (far ? 7 : 0)), w = s.width, big = far ? [7, 5] : [12, 9], small = far ? [6, 4] : [7, 5], fur = far ? 0 : 0.07, head = [], body = [];
  const B = (rx, ry, rz, x, y, z, hex, belly = null, seg = small, list = body) => list.push(blob(rx, ry, rz, x, y, z, hex, belly, seg, fur, rnd));
  const paw = shade(s.color, 0.72), dark = shade(s.color, 0.55);
  // body: chest, torso, haunch
  B(0.044 * w, 0.05, 0.1, 0, 0.085, -0.005, s.color, s.belly, big);
  B(0.038 * w, 0.045, 0.048, 0, 0.097, 0.055, s.color, s.belly, small);
  B(0.05 * w, 0.055, 0.058, 0, 0.075, -0.065, s.color, s.belly, big);
  // head: skull, cheeks, muzzle, nose, eyes (+ a glint), ears with tufts
  B(0.035 * w, 0.034, 0.042, 0, 0.128, 0.093, s.color, s.belly, big, head);
  for (const k of [1, -1]) B(0.018 * w, 0.017, 0.02, k * 0.018 * w, 0.117, 0.11, s.color, s.belly, small, head);
  B(0.016 * w, 0.014, 0.021, 0, 0.118, 0.13, s.color, s.belly, small, head);
  B(0.006, 0.005, 0.005, 0, 0.122, 0.149, 0x2a1d18, null, small, head);
  for (const k of [1, -1]) {
    B(0.0075, 0.0078, 0.0068, k * 0.026 * w, 0.137, 0.117, 0x120e0c, null, small, head);
    if (!far) B(0.0022, 0.0022, 0.0018, k * 0.0285 * w, 0.141, 0.1225, 0xffffff, null, [5, 3], head);
    const ear = new THREE.Vector3(k * 0.021 * w, 0.155, 0.084), up = new THREE.Vector3(k * 0.28, 1, -0.22).normalize();
    head.push(tuft(ear, up, 0.03, 0.011, s.color, s.color, far ? 5 : 7));
    const top = ear.clone().addScaledVector(up, 0.026);
    for (let i = 0; i < (far ? 1 : 4); i++) head.push(tuft(top, up.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.7, 0.2, (rnd() - 0.5) * 0.7)), 0.02 + rnd() * 0.008, far ? 0.004 : 0.0024, dark, shade(s.color, 0.42), 3));
  }
  // legs: fore (upper arm, forearm, paw) and hind (thigh, long foot)
  for (const k of [1, -1]) {
    B(0.011, 0.024, 0.012, k * 0.026 * w, 0.062, 0.07, s.color, s.belly);
    B(0.008, 0.022, 0.009, k * 0.024 * w, 0.032, 0.083, s.color);
    B(0.009, 0.006, 0.013, k * 0.023 * w, 0.008, 0.092, paw);
    B(0.022 * w, 0.04, 0.04, k * 0.04 * w, 0.06, -0.06, s.color, s.belly);
    B(0.013, 0.009, 0.046, k * 0.036 * w, 0.009, -0.045, paw);
  }
  if (pose.head) { const m = new THREE.Matrix4().makeTranslation(0, 0.115, 0.065).multiply(new THREE.Matrix4().makeRotationY(pose.head * 0.65)).multiply(new THREE.Matrix4().makeTranslation(0, -0.115, -0.065)); for (const g of head) g.applyMatrix4(m); }
  // tail: soft core blobs along the centre line, then the hair tufts round it (mostly to the sides: a red squirrel's tail is flat and bushy)
  const curve = new THREE.CatmullRomCurve3((pose.flick ? TAIL.flick : TAIL.rest).map(([y, z]) => new THREE.Vector3(0, y, z))), side = new THREE.Vector3(1, 0, 0);
  const rad = (u) => 0.013 + 0.027 * Math.sin(Math.PI * (0.15 + 0.8 * u)), tipCol = (u) => (s.tip && u > 0.8 ? s.tip : s.tail), tail = [];
  const cores = far ? 6 : 9;
  for (let i = 0; i < cores; i++) { const u = 0.06 + 0.9 * i / (cores - 1), c = curve.getPointAt(u); tail.push(blob(rad(u) * 1.45 * w, rad(u) * 0.95, rad(u) * 1.15, c.x, c.y, c.z, shade(tipCol(u), 0.92), null, far ? [6, 4] : [8, 6], fur, rnd)); } // (wider than deep: flat and bushy)
  const n = far ? 24 : 66;
  for (let i = 0; i < n; i++) {
    const u = 0.05 + 0.93 * (i + rnd() * 0.8) / n, c = curve.getPointAt(Math.min(1, u)), tan = curve.getTangentAt(Math.min(1, u)), nrm = new THREE.Vector3().crossVectors(tan, side).normalize();
    const phi = rnd() * Math.PI * 2, lateral = Math.abs(Math.cos(phi)), radial = side.clone().multiplyScalar(Math.cos(phi)).addScaledVector(nrm, Math.sin(phi));
    const len = (0.03 + 0.024 * Math.sin(Math.PI * (0.12 + 0.82 * u))) * (0.8 + 0.4 * rnd()) * (0.7 + 0.45 * lateral);
    const at = c.clone().addScaledVector(radial, rad(u) * (0.45 + 0.55 * lateral)), dir = radial.multiplyScalar(0.32).addScaledVector(tan, 0.95); // (the hair lies flat towards the tip)
    const col = tipCol(u); tail.push(lock(at, dir, len, (0.011 + 0.008 * lateral) * (far ? 1.3 : 1) * (0.85 + 0.3 * rnd()), shade(col, 0.9), s.tip && u > 0.8 ? s.tip : mixHex(col, 0xf2e6cf, 0.15), [4, 3]));
  }
  return [...body, ...head, ...tail];
}
/** #1716: the merged squirrel (one draw call) with three morph targets: 0 the tail flicked, 1 / 2 the head turned left / right. */
function squirrelGeometry(s, far = false) {
  const build = (pose) => { const parts = squirrelParts(s, far, pose), g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); return g; };
  const g = build({}), poses = [{ flick: 1 }, { head: 1 }, { head: -1 }].map(build);
  g.morphAttributes.position = poses.map((q) => q.attributes.position); g.morphAttributes.normal = poses.map((q) => q.attributes.normal);
  for (const q of poses) { q.deleteAttribute('position'); q.deleteAttribute('normal'); q.dispose(); }
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
    Object.assign(this, { sfx, scene, camera, player, ground, onFeed, rnd, winter: true, time: 0, speed: 0, acc: [], lastX: NaN, lastZ: NaN, lure: false, net: null, cand: [], track: new Map(), markT: 0, daylight: 1, hour: 12, wasFollow: false });
    const parkPatches = new Set([...(SITE.riverPark.patches ?? []).map((q) => q.name), 'bridge-west']), // (the other `patch` names in treeFeet belong to the street/backdrop areas)
      paddock = PADDOCK.trees ?? [], same = (a, b) => Math.abs(a.x - b[0]) < 0.01 && Math.abs(a.z - b[1]) < 0.01, river = riverFrame(SITE.river.path), q = {};
    // #1716: and every other tree along Höje å inside the walkable area (within roam.valley m of the river's centre line)
    const valley = (f) => f.x > WALK.x0 && f.x < WALK.x1 && f.z > WALK.z0 && f.z < WALK.z1 && river(f.x, f.z, q).d <= C.roam.valley;
    const wood = SITE.riverPark.woodBridge, gc = SITE.bridges?.gc, crossings = [wood?.ends, gc?.ends].filter(Boolean); // (the timber footbridge and the foot/cycle bridge)
    this.trees = linkTrees(feet.filter((f) => parkPatches.has(f.patch) || paddock.some(([x, z]) => same(f, [x, z])) || valley(f)).map((f) => {
      let best = null, bd = 0.05; for (const c of crowns) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < bd) { bd = d; best = c; } }
      return { x: f.x, z: f.z, y: f.y, cy: best ? best.y : f.y + 5, r: best ? best.r : 3 };
    }), { path: SITE.river.path, walkable, crossings });
    this.player_ = { x: 0, z: 0, lure: false, hx: 0, hz: 0, id: '' };
    this.nuts = new NutField(this.trees, ground, nutOk, rnd);
    this.nuts.anchors = () => [{ x: camera.position.x, z: camera.position.z }, ...(this.net?.remotes?.() ?? []).map((r) => ({ x: r.x, z: r.z }))];
    // #1716: the home ranges drift with the wall clock (the same for every player), the day comes from the game's clock (update's `hour`)
    const env = { trees: this.trees, ground, walkable, nuts: this.nuts, player: this.player_, scares: this.cand, rnd, onTake: (b) => this.take(b), now: () => Date.now() / 1000, hour: () => this.hour, others: [] };
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
      const brain = new SquirrelBrain(spec, env, best); brain.enterPerch(brain.homeTree(brain.homeS(), true), rnd() * Math.PI * 2); // (#1716: where its range is now)
      const geos = [squirrelGeometry(spec), squirrelGeometry(spec, true)], group = new THREE.Group(), body = new THREE.Mesh(geos[1], this.material); // #1716: near / far detail
      body.scale.setScalar(spec.scale); body.userData.noDetail = true; body.raycast = () => {}; body.name = `squirrel-${i}`;
      const mouth = new THREE.Mesh(nutGeos[0], this.nutMaterial); mouth.scale.setScalar(C.nutSize * spec.scale); mouth.position.set(0, 0.112 * spec.scale, (0.15 + HAUNCH) * spec.scale); body.position.z = HAUNCH * spec.scale; // (the group's origin at the haunch: it sits up round it)
      mouth.rotation.x = Math.PI / 2; mouth.visible = false; mouth.raycast = () => {}; mouth.userData.noDetail = true;
      group.rotation.order = 'YXZ'; group.add(body, mouth); group.visible = false; scene.add(group);
      this.acc.push(0);
      return { brain, group, mouth, body, spec, geos, flickT: 9, flickAt: 2 + rnd() * 4, head: 0, headTo: 0, headT: 0 };
    }) : [];
    this.sync.brains.push(...this.animals.map((a) => a.brain)); env.others.push(...this.sync.brains);
    registerSeasonal((month) => { this.winter = winterMonth(month); });
    this.hide();
  }
  hide() { for (const a of this.animals) a.group.visible = false; }
  /** #1698: what a visitor (this one, or a ghost the leader sees) does: speed, how long still, and whether they just rose from a crouch. `crouch`: 0 … 1. */
  trackVisitor(id, dt, speed, crouch) {
    let t = this.track.get(id); if (!t) this.track.set(id, t = { still: 0, crouch, rose: 0 });
    t.still = speed < C.still ? t.still + dt : 0;
    t.rose = crouch < 0.6 && t.crouch > 0.85 ? C.roseFor : Math.max(0, t.rose - dt);
    t.crouch = crouch; t.seen = this.time; return t;
  }
  /** The visitor's hand: a nut held, crouched all the way down, and still (under `still` m/s for `stillFor` s). Everybody near is also a possible scare (`cand`: v, rose). */
  watchPlayer(dt) {
    const pos = this.camera.getWorldPosition(V), p = this.player_;
    if (Number.isFinite(this.lastX) && dt > 0) this.speed += (Math.hypot(pos.x - this.lastX, pos.z - this.lastZ) / dt - this.speed) * Math.min(1, dt * 12);
    this.lastX = pos.x; this.lastZ = pos.z;
    const it = heldItem(), me = this.net?.me?.() ?? '', mt = this.trackVisitor(me, dt, this.speed, this.player.crouched ? 1 : 0);
    p.x = pos.x; p.z = pos.z; p.lure = !!(this.player.crouched && it?.isSquirrelNut && mt.still >= C.stillFor);
    const d = this.camera.getWorldDirection(new THREE.Vector3()), l = Math.hypot(d.x, d.z) || 1;
    p.hx = pos.x + d.x / l * C.handAhead; p.hz = pos.z + d.z / l * C.handAhead;
    p.id = me;
    // #1686: the leader also lets the other players' lures count (what it knows of their ghosts), but only for a nut the room says they hold.
    // #1698: and their speed (the ghosts' own estimate from position snapshots, no extra traffic) can scare.
    this.cand.length = 0; this.cand.push({ id: p.id, x: p.x, z: p.z, lure: p.lure, hx: p.hx, hz: p.hz, v: this.speed, rose: mt.rose > 0 });
    if (this.sync.lead && this.sync.sharing) for (const r of this.net?.remotes?.() ?? []) {
      const rt = this.trackVisitor(r.id, dt, r.vh, r.crouch), lure = r.hi === 'nut' && r.crouch > 0.85 && rt.still >= C.stillFor && this.sync.remoteHeld.has(r.id);
      this.cand.push({ id: r.id, x: r.x, z: r.z, lure, hx: r.x - Math.sin(r.yaw) * C.handAhead, hz: r.z - Math.cos(r.yaw) * C.handAhead, v: r.vh, rose: rt.rose > 0 });
    }
    if (this.track.size > 8) for (const [k, t] of this.track) if (this.time - t.seen > 5) this.track.delete(k);
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
    V.set(brain.x, brain.y + 0.2 * brain.spec.scale, brain.z); this.hearts.burst(V); this.chirp(brain);
    return true;
  }
  /** #1699: the happy chirp from the squirrel's position, once per feeding (leader: where it takes; follower: where the 'F' is applied). Pitch varies per squirrel. */
  chirp(brain) {
    const k = Math.max(0, this.animals.findIndex((q) => q.brain === brain)) - 1;
    this.sfx?.chirp({ x: brain.x, y: brain.y + 0.2 * brain.spec.scale, z: brain.z }, 1 + k * C.chirp.pitchJitter);
  }
  /** Follower: the leader's squirrel `an` took `who`'s nut: hearts for everybody, the nut and the points for the feeder. */
  fedBy(an, who) {
    const a = this.animals[an]; if (!a) return;
    V.set(a.brain.x, a.brain.y + 0.2 * a.brain.spec.scale, a.brain.z); this.hearts.burst(V); this.chirp(a.brain);
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
  update(dt, hidden = false, daylight = 1, hour = 12) {
    this.daylight = daylight; this.hour = hour;
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
    if (this.wasFollow && !follow) for (const a of this.animals) a.brain.resync(); // #1716: simulating again after following: settle on a real tree
    this.wasFollow = follow;
    this.animals.forEach((a, i) => {
      const b = a.brain, d = Math.hypot(cam.x - b.x, cam.z - b.z);
      // #1686: the leader simulates for everybody: a squirrel is awake when ANY player near the squirrels is within range of it
      let ds = d; if (!follow) for (const c of this.cand) ds = Math.min(ds, Math.hypot(c.x - b.x, c.z - b.z));
      if (d > C.farDist && (follow || ds > C.farDist)) { // #1716: nobody near: the coarse brain steps through the tree graph every roam.coarse s
        a.group.visible = false;
        if (!follow && (this.acc[i] += dt) >= C.roam.coarse) { b.coarse(this.acc[i]); this.acc[i] = 0; }
        return;
      }
      if (!follow) {
        this.focus(b);
        if (ds > C.simDist) { this.acc[i] += dt; if (this.acc[i] < C.farStep) return; b.update(this.acc[i]); this.acc[i] = 0; } else { b.update(this.acc[i] + dt); this.acc[i] = 0; }
      }
      this.pose(a, d, dt);
    });
  }
  pose(a, d, dt = 0) {
    const b = a.brain, g = a.group, run = b.run, hop = run > 0.05 && !['down', 'up', 'leap'].includes(b.state) ? Math.abs(Math.sin(this.time * 14 + b.spec.scale * 9)) * 0.035 * run : 0;
    g.visible = d < C.drawDist && b.state !== 'nest'; // (#1716: asleep in the drey, inside the crown)
    const geo = a.geos[d < C.look.near ? 0 : 1]; if (a.body.geometry !== geo) a.body.geometry = geo;
    // #1716: sitting still it flicks its tail now and then and turns its head in quick jerks (the morph targets; the leader's brain adds a flick at each wary stop)
    const still = run < 0.05 && !['down', 'up', 'leap', 'eat', 'take', 'bury', 'dig', 'nest'].includes(b.state), inf = a.body.morphTargetInfluences;
    if (still && (a.flickAt -= dt) <= 0) { a.flickAt = 2 + this.rnd() * 5; a.flickT = 0; }
    if (b.flick > 0.95 && a.flickT > 0.6) a.flickT = 0;
    a.flickT += dt; inf[0] = a.flickT < 0.6 ? Math.sin(Math.PI * a.flickT / 0.3) ** 2 : 0;
    if ((a.headT -= dt) <= 0) { a.headT = 0.25 + this.rnd() * 0.7; a.headTo = still ? (this.rnd() - 0.5) * 2 : 0; }
    a.head += (a.headTo - a.head) * Math.min(1, dt * 18); const hk = 1 - 0.75 * Math.min(1, b.rise); inf[1] = Math.max(0, a.head) * hk; inf[2] = Math.max(0, -a.head) * hk; // (sitting up: small turns only)
    const sway = b.state === 'perch' ? Math.sin(this.time * 0.9 + b.spec.scale * 7) * 0.5 : 0, yaw = b.yaw + sway, back = HAUNCH * b.spec.scale;
    g.position.set(b.x - Math.sin(yaw) * back, b.y + hop * b.spec.scale, b.z - Math.cos(yaw) * back); // (the body centre stays at the brain's point)
    g.rotation.y = yaw;
    g.rotation.x = -(b.pitch + b.rise * 1.05 - (hop > 0 ? Math.sin(this.time * 14) * 0.12 : 0));
    a.mouth.visible = b.hasNut;
  }
  /** For tests: where each squirrel is and what it does. */
  state() { return this.animals.map((a) => ({ name: a.spec.name, state: a.brain.state, x: a.brain.x, y: a.brain.y, z: a.brain.z, hasNut: a.brain.hasNut, visible: a.group.visible })); }
}

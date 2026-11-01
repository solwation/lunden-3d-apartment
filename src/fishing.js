import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FISHING as F, RIVER_FISH } from './config.js';
import { Holdable, heldItem, setHeld, stowedItem } from './holdable.js';
import { fishGeometry } from './riverfish.js';
import { riverProject, riverPoint, waterAt, catchCm } from './riverfishswim.js';
import { ROD_PROXY_TIP } from './ghostprops.js';
import { sfx } from './audio.js';

// #1753 (part 2 of #1751): the fishing rod under the road bridge, casting, bites and the fish you catch.
// - The rod (FishingRod) is an ordinary Holdable lying on the north shore flat under the deck (FISHING.home): take, hold, put down on the bank
//   (`outdoorPlace`), put back; keep.js saves it with the other things. It is no weapon (no clickIsUse / shoots / hitsTarget).
// - Held, a click / E / the touch button (`useLabel`) casts where the eye's ray meets the river (FISHING.cast: within min…max m, off the
//   bank); the float flies there on an arc, lands with a ring and bobs. While the line is out or the eye aims at the water, the rod is not put
//   down (`noPlace`, main.js updateFocus), so the click is the rod's.
// - A bite comes after a random wait: a hazard per second from the fish within `wait.radius` m of the float (RiverFish.near, the same fish
//   for everybody), each weighted by its species' appetite and closeness. The float dips with a ring and a splash; a strike within
//   `wait.window` s asks the room for that fish (RiverFish.catchFish: arbitrated, it disappears from the river for everybody); a miss
//   lets it swim off (that fish stays shy for `wait.shy` s) and the float waits for the next. No room answer within `wait.answer` s = lost.
// - A caught fish (CaughtFish) is a Holdable with species and length ("en abborre, 23 cm", catchCm: pure of seed / id / life); the rod is
//   laid on the bank at your feet and the fish goes into the hand. It may be put down anywhere (outdoors on the ground, indoors on floors
//   and tables), is kept across reloads by keep.js's `fishing` part (`saveState` / `loadState`) and carries `species`, `cm`, `raw` for
//   the cooking of #1754.
// - The others see it through the player state: the held category ('rod' / 'fish', heldcategory.js) and `fb` = [x, y, z, bite] while the
//   float is out; `updateRemote` draws their floats and lines within FISHING.remoteDist m.
// Cost: nothing at the start. The rod is one mesh; while fishing one float, one line and one ring; one float + line per other angler near.

const paint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const BUTT = 0.12; // m behind the grip (the origin) the handle ends
/** The rod along −z, the grip (the hand) at the origin: cork handle, reel under it, the tapering blank, a red tip. */
export function rodGeometry() {
  const { length: L, butt, tip, handle, reel } = F.rod, along = (g, z) => g.rotateX(Math.PI / 2).translate(0, 0, z);
  const blank = L - handle;
  return mergeGeometries([
    paint(along(new THREE.CylinderGeometry(0.016, 0.017, handle, 8), BUTT - handle / 2), 0xb98a55),          // the cork handle
    paint(along(new THREE.CylinderGeometry(butt * 1.3, butt * 1.3, 0.05, 8), BUTT - handle - 0.02), 0x2a2d30), // the reel seat
    paint(along(new THREE.CylinderGeometry(tip, butt, blank, 6), BUTT - handle - blank / 2), 0x1f3d2c),       // the blank (radiusTop = the tip end, rotated to −z)
    paint(along(new THREE.CylinderGeometry(tip * 1.6, tip * 1.6, 0.04, 5), BUTT - L + 0.02), 0xc8321f),     // the red tip
    paint(new THREE.BoxGeometry(0.008, 0.035, 0.012).translate(0, -0.03, -0.02), 0x2a2d30),               // the reel's foot
    paint(along(new THREE.CylinderGeometry(reel, reel, 0.04, 10), -0.02).translate(0, -0.03 - reel, 0), 0x3a3f44), // the spinning reel
  ]);
}
const ROD_TIP = new THREE.Vector3(0, 0, BUTT - F.rod.length);

/** The float: a red cap over a white body with a short antenna, its waterline at y = 0. */
function floatGeometry() {
  const r = F.float.r;
  return mergeGeometries([
    paint(new THREE.SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8261c),
    paint(new THREE.SphereGeometry(r, 8, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xf4f1ea),
    paint(new THREE.CylinderGeometry(r * 0.15, r * 0.15, r * 1.6, 4).translate(0, r * 1.6, 0), 0xd8261c),
  ]);
}

const NONE = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };
const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
const V = new THREE.Vector3(), W = new THREE.Vector3(), DIR = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const r2 = (v) => Math.round(v * 100) / 100;

export class FishingRod extends Holdable {
  constructor(scene, camera, host, groundY) {
    const model = new THREE.Group(), body = new THREE.Mesh(rodGeometry(), vmat);
    body.castShadow = true; body.userData.noDetail = true; model.add(body);
    const { x, z, yaw } = F.home, y = groundY(x, z) + 0.018; // (on its side: the handle's radius above the ground)
    const along = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const mid = new THREE.Vector3(x, y + 0.05, z).addScaledVector(along, -(BUTT - F.rod.length / 2));
    super(scene, camera, {
      name: 'fiskespöet', verb: 'ta', backName: 'platsen under bron', backVerb: 'lägga tillbaka spöet på', model,
      home: { pos: new THREE.Vector3(x, y, z), rot: new THREE.Euler(0, yaw, Math.PI / 2) },
      heldPose: { pos: new THREE.Vector3(F.held.x, F.held.y, F.held.z), rot: new THREE.Euler(F.held.pitch, F.held.yaw, 0) },
      pick: { pos: mid, size: [Math.abs(along.x) * F.rod.length + 0.3, 0.3, Math.abs(along.z) * F.rod.length + 0.3] },
      cooldown: 0.2, grip: F.grip,
    });
    Object.assign(this, { host, isFishingRod: true, outdoorPlace: true });
    model.visible = false; // (idle() shows it within FISHING.drawDist m)
    body.raycast = function (rc, out) { // a generous box round the thin rod to aim at
      const box = new THREE.Box3().setFromObject(this).expandByScalar(0.06), hit = new THREE.Vector3();
      if (rc.ray.intersectBox(box, hit)) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this });
    };
  }
  /** The E target: not through the road bridge's deck (nothing in the focus pick list stops a ray, so a rod lying under the deck would be in
   *  reach from the road above): only within `HOLD`-like 2.4 m of height. */
  get target() { return !this.held && Math.abs(this.camera.position.y - this.model.position.y) > 2.4 ? NONE : super.target; }
  /** The touch button's text (main.js: shown while nothing else is in focus). */
  get useLabel() { return { idle: 'Kasta', flight: 'Kastar …', wait: 'Veva in', bite: 'Haka!', reel: 'Vevar in …' }[this.host.state]; }
  /** main.js updateFocus: not put down on the bank while the line is out or the eye aims at the water (the click casts). */
  get noPlace() { return this.held && (this.host.state !== 'idle' || !!this.host.aim()); }
  /** The rod's tip in the world (the line starts there). */
  tip(out = new THREE.Vector3()) { this.model.updateWorldMatrix(true, false); return out.copy(ROD_TIP).applyMatrix4(this.model.matrixWorld); }
  onUse() { this.host.press(); }
  onTake() { sfx.click?.(this.where()); this.model.visible = true; }
  onPut() { this.host.reelIn(); }
  /** Not held: drawn only within FISHING.drawDist m (nothing new at the start: the phone budget, #1720). */
  idle() { const p = this.model.position, c = this.camera.position; this.model.visible = Math.hypot(p.x - c.x, p.z - c.z) < F.drawDist; }
}

const fishMats = new Map();
const fishMat = (hex) => { if (!fishMats.has(hex)) fishMats.set(hex, new THREE.MeshStandardMaterial({ vertexColors: true, color: hex, roughness: 0.45, metalness: 0.1 })); return fishMats.get(hex); };
let fishGeo = null;

export class CaughtFish extends Holdable {
  /** host: the Fishing; info: { species, cm, raw }; at: where it starts (a Vector3, the catcher's feet). */
  constructor(scene, camera, host, info, at) {
    const spec = RIVER_FISH.species.find((s) => s.name === info.species) ?? RIVER_FISH.species[0], L = info.cm / 100;
    fishGeo ??= fishGeometry();
    const mesh = new THREE.Mesh(fishGeo, fishMat(spec.color));
    mesh.scale.set(L * spec.w / spec.len * 1.4, L * spec.h / spec.len, L); // (a little plumper than the shape seen through the water)
    mesh.castShadow = true; mesh.userData.noDetail = true;
    const model = new THREE.Group(); model.add(mesh);
    const sphere = new THREE.Sphere(), hit = new THREE.Vector3(), reach = Math.max(0.14, L * 0.5);
    mesh.raycast = function (rc, out) { sphere.set(this.getWorldPosition(V), reach); if (rc.ray.intersectSphere(sphere, hit)) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this }); };
    super(scene, camera, { name: `en ${spec.name}, ${info.cm} cm`, verb: 'ta', backName: '', backVerb: 'lägga ned', model,
      home: { pos: at.clone(), rot: new THREE.Euler(0, 0, Math.PI / 2) },
      heldPose: { pos: new THREE.Vector3(0.06, -0.2, -0.42 - L * 0.15), rot: new THREE.Euler(0.25, Math.PI / 2 - 0.15, 0) },
      pick: { pos: at.clone(), size: [0.01, 0.01, 0.01] } });
    Object.assign(this, { host, isCaughtFish: true, outdoorPlace: true, species: spec.name, cm: info.cm, raw: info.raw !== false, caughtAt: info.t ?? Date.now() });
  }
  /** #1754: what it is (species, length in cm) and whether it is still raw. */
  get info() { return { species: this.species, cm: this.cm, raw: this.raw }; }
  /** No home to go back to: it is taken or lies where it was put down. */
  get target() { return this.broken || this.held ? NONE : this.takeTarget; }
  /** Something else taken into the hand: the fish is laid on the ground at your feet (it has no home). */
  putBack() { if (!this.held) return; this.placeAt(this.host.dropSpot(0.5), Math.random() * 6.28); }
  onTake() { sfx.splash?.(this.where()); }
  /** Out of the world (the oldest lying fish when there are too many, #1754's cooking). */
  remove() {
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    this.broken = true; this.placed = false; this.model.removeFromParent(); this.model.visible = false;
  }
}

export class Fishing {
  /** scene, camera; riverFish: RiverFish or null (&nofish); player: Player (pos, groundAt); onMessage(text): the badge; onItem(fish): a new
   *  Holdable (main.js adds it to the holdables); touch(): touch controls on; rnd: injectable for tests. */
  constructor({ scene, camera, riverFish, player, groundY, onMessage = () => {}, onItem = () => {}, touch = () => false, rnd = Math.random }) {
    Object.assign(this, { scene, camera, riverFish, player, onMessage, onItem, touch, rnd, state: 'idle', t: 0, fish: [], shy: new Map(), at: new THREE.Vector3(), from: new THREE.Vector3(), bite: null, pending: null, waitT: 0, hinted: false, peers: null, remote: [], aimAt: null, aimFrame: -1, frame: 0, catches: 0, misses: 0 });
    this.rod = new FishingRod(scene, camera, this, groundY);
    const fgeo = floatGeometry();
    this.floatGeo = fgeo;
    this.float = new THREE.Mesh(fgeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.line = this.makeLine();
    const ringGeo = new THREE.RingGeometry(0.85, 1, 24, 1).rotateX(-Math.PI / 2); ringGeo.deleteAttribute('uv');
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    for (const [m, n] of [[this.float, 'fishing-float'], [this.line, 'fishing-line'], [this.ring, 'fishing-ring']]) {
      m.name = n; m.visible = false; m.raycast = () => {}; m.userData.noDetail = true; m.frustumCulled = false; scene.add(m);
    }
    this.ringT = Infinity;
    if (riverFish) riverFish.onCaught = (id, ok) => this.caught(id, ok);
  }
  makeLine() {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.75 }));
  }
  /** The line from `a` to `b` sagging `sag` m in the middle. */
  drawLine(line, a, b, sag) {
    const p = line.geometry.attributes.position, n = p.count;
    for (let i = 0; i < n; i++) { const u = i / (n - 1); p.setXYZ(i, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - sag * 4 * u * (1 - u), a.z + (b.z - a.z) * u); }
    p.needsUpdate = true; line.geometry.computeBoundingSphere(); line.visible = true;
  }
  /** Where a cast would land now: the eye's ray on the river's surface (within cast.min…max m, off the banks), or null. Once per frame. */
  aim() {
    if (this.aimFrame === this.frame) return this.aimAt;
    this.aimFrame = this.frame; this.aimAt = null;
    if (!this.rod.held || !this.player?.outdoors) return null;
    const cam = this.camera.position, q = riverProject(cam.x, cam.z), wy = waterAt(q.s);
    this.camera.getWorldDirection(DIR);
    if (DIR.y > -0.01 || cam.y <= wy) return null;
    const t = (wy - cam.y) / DIR.y; let x = cam.x + DIR.x * t, z = cam.z + DIR.z * t, h = Math.hypot(x - cam.x, z - cam.z);
    if (h < F.cast.min) return null;
    if (h > F.cast.max) { x = cam.x + (x - cam.x) * F.cast.max / h; z = cam.z + (z - cam.z) * F.cast.max / h; h = F.cast.max; }
    const p = riverProject(x, z), hw = riverPoint(p.s).hw;
    if (p.abs > hw - F.cast.edge) return null;
    this.aimAt = new THREE.Vector3(x, waterAt(p.s), z);
    return this.aimAt;
  }
  /** A click / E / the touch button with the rod in the hand. */
  press() {
    switch (this.state) {
      case 'idle': this.cast(); break;
      case 'wait': this.reelIn(); break;
      case 'bite': this.strike(); break;
      default: break;
    }
  }
  cast() {
    const p = this.aim();
    if (!p) { this.onMessage('Sikta mot vattnet i ån för att kasta'); return false; }
    this.rod.tip(this.from); this.at.copy(p); this.state = 'flight'; this.t = 0; this.bite = null; this.hinted = false;
    sfx.thwip?.(this.from);
    return true;
  }
  reelIn() {
    if (this.state === 'idle') return;
    if (this.state === 'reel' && this.pending) this.riverFish?.sync?.giveUp?.(this.pending.id);
    this.state = 'idle'; this.bite = null; this.pending = null;
    this.float.visible = this.line.visible = false;
  }
  strike() {
    const b = this.bite;
    if (!b || !this.riverFish) { this.state = 'wait'; return; }
    this.state = 'reel'; this.t = 0; this.pending = b; this.bite = null;
    this.riverFish.catchFish(b.id); // (solo: answered at once through `caught`)
  }
  /** The room's verdict on our catch (RiverFish.onCaught). */
  caught(id, ok) {
    const b = this.pending;
    if (this.state !== 'reel' || !b || b.id !== id) return;
    this.pending = null;
    if (!ok) { this.misses++; this.onMessage('Fisken slet sig loss'); this.state = 'wait'; this.waitT = 0; return; }
    this.land(b);
  }
  /** Where something laid down at your feet goes: `side` m to the right of where you stand, on the ground. */
  dropSpot(side = 0.45) {
    const p = this.player.pos, yaw = this.camera.rotation.y, x = p.x + Math.cos(yaw) * side - Math.sin(yaw) * 0.35, z = p.z - Math.sin(yaw) * side - Math.cos(yaw) * 0.35;
    const y = this.player.groundAt(x, z, p.y + 0.3);
    return new THREE.Vector3(x, Number.isFinite(y) && Math.abs(y - p.y) < 0.6 ? y : p.y, z);
  }
  land(b) {
    this.reelIn();
    this.catches++;
    const fish = this.addFish({ species: b.species, cm: b.cm, raw: true }, this.dropSpot(0.5));
    if (this.rod.held) this.rod.placeAt(this.dropSpot(0.45), this.camera.rotation.y + Math.PI / 2 + 0.2);
    fish.take();
    sfx.splash?.(fish.where());
    this.onMessage(`Du fick ${fish.name}!`);
    return fish;
  }
  addFish(info, at) {
    const fish = new CaughtFish(this.scene, this.camera, this, info, at);
    this.fish.push(fish);
    this.onItem(fish);
    const alive = this.fish.filter((f) => !f.broken);
    if (alive.length > F.keep) alive.find((f) => !f.held && f !== heldItem())?.remove();
    this.fish = this.fish.filter((f) => !f.broken);
    return fish;
  }
  /** The fish that bites now (weighted by appetite and closeness), or null; and the hazard per second. */
  appetite() {
    if (!this.riverFish) return { rate: 0, pick: null };
    const now = performance.now() / 1000, list = this.riverFish.near(this.at.x, this.at.z, F.wait.radius).filter((f) => !((this.shy.get(f.id) ?? 0) > now));
    let sum = 0; const w = list.map((f) => { const d = Math.hypot(f.x - this.at.x, f.z - this.at.z), k = (F.species[f.species]?.bite ?? 1) * Math.max(0, 1 - d / F.wait.radius); sum += k; return k; });
    let r = this.rnd() * sum, pick = null;
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) { pick = list[i]; break; } }
    return { rate: F.wait.rate * sum, pick: pick ?? list.at(-1) ?? null };
  }
  /** Per frame: the float, the line, the bite and the others' floats. */
  update(dt) {
    this.frame++;
    if (this.state !== 'idle' && (heldItem() !== this.rod || stowedItem() === this.rod)) this.reelIn();
    this.t += dt;
    const tip = this.state !== 'idle' ? this.rod.tip(W) : null;
    if (this.state === 'flight') {
      const u = Math.min(1, this.t / F.cast.flight), h = Math.hypot(this.at.x - this.from.x, this.at.z - this.from.z);
      V.lerpVectors(this.from, this.at, u); V.y += Math.sin(u * Math.PI) * F.cast.arc * Math.min(1, h / 8);
      this.float.position.copy(V); this.float.visible = true;
      this.drawLine(this.line, tip, V, 0);
      if (u >= 1) { this.state = 'wait'; this.t = 0; this.waitT = 0; this.splash(this.at); sfx.splash?.(this.at); }
    } else if (this.state === 'wait' || this.state === 'bite' || this.state === 'reel') {
      if (Math.hypot(this.player.pos.x - this.at.x, this.player.pos.z - this.at.z) > F.reach) { this.reelIn(); this.onMessage('Linan vevades in'); return this.updateRemote(dt); }
      let dip = 0;
      if (this.state === 'wait') {
        this.waitT += dt;
        if (this.t > F.wait.min) {
          const { rate, pick } = this.appetite();
          if (pick && this.rnd() < 1 - Math.exp(-rate * dt)) {
            const seed = this.riverFish.sync.seed, range = F.species[pick.species]?.cm ?? [15, 40];
            this.bite = { id: pick.id, born: pick.born, species: pick.species, cm: catchCm(pick.id, pick.born, seed, range) };
            this.state = 'bite'; this.t = 0; this.splash(this.at); sfx.splash?.(this.at);
            this.onMessage(this.touch() ? 'Napp! Tryck på Haka!' : 'Napp! Klicka nu!');
          } else if (!pick && !this.hinted && this.waitT > F.wait.idleHint) { this.hinted = true; this.onMessage('Inga fiskar i närheten – prova ett annat ställe'); }
        }
      } else if (this.state === 'bite') {
        dip = F.float.dip * (0.6 + 0.4 * Math.sin(this.t * 22));
        if (this.t > F.wait.window) {
          this.shy.set(this.bite.id, performance.now() / 1000 + F.wait.shy); this.bite = null; this.misses++;
          this.state = 'wait'; this.t = 0; this.waitT = 0; this.onMessage('Fisken simmade iväg');
        }
      } else if (this.t > F.wait.answer && this.pending) { // no answer from the room: given up (RiverFishSync forgets the request)
        const id = this.pending.id; this.riverFish?.sync?.giveUp?.(id); if (this.pending?.id === id) this.caught(id, false);
      }
      const bob = F.float.bob[0] * Math.sin(this.t * F.float.bob[1] * Math.PI * 2);
      this.float.position.set(this.at.x, this.at.y + bob - dip, this.at.z); this.float.visible = true;
      this.drawLine(this.line, tip, this.float.position, this.state === 'reel' ? 0 : Math.min(0.4, 0.03 * tip.distanceTo(this.at)));
    }
    if (this.ringT < F.ring.life) {
      this.ringT += dt; const u = Math.min(1, this.ringT / F.ring.life), r = F.ring.r[0] + (F.ring.r[1] - F.ring.r[0]) * Math.sqrt(u);
      this.ring.scale.set(r, 1, r); this.ring.material.opacity = 0.6 * (1 - u) * (1 - u); this.ring.visible = u < 1;
    }
    this.updateRemote(dt);
  }
  splash(p) { this.ring.position.set(p.x, p.y + 0.015, p.z); this.ringT = 0; this.ring.visible = true; }
  /** Our float for the player state (`fb`, ghosts.js): [x, y, z, 1 while biting] while it is on the water, else null. */
  get wire() { return this.state === 'wait' || this.state === 'bite' || this.state === 'reel' ? [r2(this.at.x), r2(this.at.y), r2(this.at.z), this.state === 'bite' ? 1 : 0] : null; }
  /** The other players' floats (`g.bob` from their `fb`) and lines from their rod (the 'rod' proxy's tip) within FISHING.remoteDist m. */
  updateRemote() {
    let n = 0;
    const cam = this.camera.position, t = performance.now() / 1000;
    if (this.peers) for (const g of this.peers()) {
      const b = g.bob;
      if (!b || Math.hypot(b[0] - cam.x, b[2] - cam.z) > F.remoteDist) continue;
      let r = this.remote[n];
      if (!r) {
        r = this.remote[n] = { float: new THREE.Mesh(this.floatGeo, this.float.material), line: this.makeLine() };
        for (const m of [r.float, r.line]) { m.name = m === r.float ? 'fishing-float-remote' : 'fishing-line-remote'; m.raycast = () => {}; m.userData.noDetail = true; m.frustumCulled = false; this.scene.add(m); }
      }
      const dip = b[3] ? F.float.dip * (0.6 + 0.4 * Math.sin(t * 22)) : 0;
      r.float.position.set(b[0], b[1] + F.float.bob[0] * Math.sin(t * F.float.bob[1] * 6.283) - dip, b[2]); r.float.visible = true;
      if (g.hi === 'rod' && g.itemProp?.visible) { g.itemProp.updateWorldMatrix(true, false); V.copy(ROD_PROXY_TIP).applyMatrix4(g.itemProp.matrixWorld); }
      else V.copy(g.root.position).addScaledVector(UP, 1.6);
      this.drawLine(r.line, V, r.float.position, Math.min(0.4, 0.03 * V.distanceTo(r.float.position)));
      r.id = g.id; n++;
    }
    for (let i = n; i < this.remote.length; i++) { this.remote[i].float.visible = this.remote[i].line.visible = false; this.remote[i].id = null; }
    this.remoteShown = n;
  }
  /** keep.js `fishing`: the caught fish (species, length, raw) lying about (where, how) or in the hand. */
  saveState() {
    const out = [];
    for (const f of this.fish) {
      if (f.broken) continue;
      const e = { sp: f.species, cm: f.cm, raw: f.raw ? 1 : 0 };
      if (f.held || f === stowedItem()) e.h = 1;
      else {
        const p = f.model.getWorldPosition(new THREE.Vector3()), q = f.model.getWorldQuaternion(new THREE.Quaternion());
        e.p = [p.x, p.y, p.z].map((v) => Math.round(v * 1000) / 1000); e.q = [q.x, q.y, q.z, q.w].map((v) => Math.round(v * 1000) / 1000);
      }
      out.push(e);
    }
    return out.length ? { v: 1, fish: out } : null;
  }
  loadState(s) {
    if (s?.v !== 1 || !Array.isArray(s.fish)) return;
    for (const e of s.fish.slice(0, F.keep)) {
      const spec = RIVER_FISH.species.find((x) => x.name === e?.sp), range = F.species[e?.sp]?.cm;
      if (!spec || !range || !Number.isInteger(e.cm) || e.cm < range[0] || e.cm > range[1]) continue;
      const placed = Array.isArray(e.p) && e.p.length === 3 && e.p.every(Number.isFinite) && Array.isArray(e.q) && e.q.length === 4 && e.q.every(Number.isFinite);
      if (!e.h && !placed) continue;
      const fish = this.addFish({ species: e.sp, cm: e.cm, raw: e.raw !== 0 }, placed ? new THREE.Vector3(...e.p) : this.dropSpot(0.5));
      if (e.h && !heldItem()) fish.take();
      else if (placed) { fish.model.position.set(...e.p); fish.model.quaternion.set(...e.q); fish.placed = true; }
      else { fish.held = true; fish.putBack(); }
    }
  }
  state_() { return { state: this.state, at: this.at.toArray(), bite: this.bite, pending: this.pending, fish: this.fish.filter((f) => !f.broken).map((f) => ({ name: f.name, ...f.info, held: f.held, placed: f.placed })), remote: this.remoteShown ?? 0, catches: this.catches, misses: this.misses }; }
}

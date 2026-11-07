import {dropId} from './shareddropwire.js';
import * as THREE from 'three';
import { cookRate } from './cookrules.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FISHING as F, RIVER_FISH, SHARK, SHARED_FISH } from './config.js';
import { Holdable, heldItem, setHeld, stowedItem, restPose, handBusy } from './holdable.js';
import { forgetBicycleHand } from './keep.js';
import { caughtFishGeometry } from './caughtfish.js';
import { riverProject, riverPoint, waterAt, catchCm } from './riverfishswim.js';
import { ROD_PROXY_TIP } from './ghostprops.js';
import { sfx } from './audio.js';
import { SharkFin } from './shark.js';

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
// - #1754: the catch is cooked on a kettle grill (`intoGrill`, on its grate: the courtyard's or the patio's) or in the pan on the hob
//   (`intoPan`), raw → cooked (FISHING.cook.done s of heat, golden) → burnt (`burn` s, charred); a cooked one is eaten in the hand
//   (`useLabel` "Ät", `cook.bites` bites). The host reports onCatch / onCooked / onBurnt / onTakenCooked / onEaten (main.js: score,
//   the hidden quest src/fishquest.js). Cooking state and where it cooks are kept by keep.js's `fishing` part.
// - #1769: the rare shark (src/shark.js, riverFish.shark) bites like a fish (its appetite SHARK.bite) but must be struck within SHARK.strike.window
//   s and may tear loose anyway (`slip`); the room arbitrates the catch (RiverFishSync.catchShark, id -1 here). Caught, only its fin goes into
//   the hand (SharkFin, kept in `fins` by the same keep.js part); the body lies on the bank where it landed (the room's record). onSharkCatch(fin).
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
  onTake() { sfx.click?.(this.where()); this.model.visible = true; this.host.onRod(); }
  onPut() { this.host.reelIn(); }
  /** Not held: drawn only within FISHING.drawDist m (nothing new at the start: the phone budget, #1720). */
  idle() { const p = this.model.position, c = this.camera.position; this.model.visible = Math.hypot(p.x - c.x, p.z - c.z) < F.drawDist; }
}

const GOLDEN = new THREE.Color(F.cook.golden), CHAR = new THREE.Color(F.cook.char), TMP = new THREE.Color(), TMP2 = new THREE.Color();
const COOKED_WORD = { grill: 'grillad', pan: 'stekt', oven: 'ugnsbakad', airfryer: 'friterad' }; // (#1881: the oven and the air fryer too)

export class CaughtFish extends Holdable {
  /** host: the Fishing; info: { species, cm, raw, cook?, by?, bites? }; at: where it starts (a Vector3, the catcher's feet). */
  constructor(scene, camera, host, info, at) {
    const spec = RIVER_FISH.species.find((s) => s.name === info.species) ?? RIVER_FISH.species[0], L = info.cm / 100;
    // #1765: the species' own model (src/caughtfish.js: shape, fins, eyes and skin pattern in vertex colours, one cached geometry per species)
    const geo = caughtFishGeometry(spec.name);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }); // its own: cooking browns it (#1754); the fins are single polygons
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(L); // (the geometry is in units of the fish's length)
    mesh.castShadow = true; mesh.userData.noDetail = true;
    const model = new THREE.Group(); model.add(mesh);
    const sphere = new THREE.Sphere(), hit = new THREE.Vector3(), reach = Math.max(0.14, L * 0.5);
    mesh.raycast = function (rc, out) { sphere.set(this.getWorldPosition(V), reach); if (rc.ray.intersectSphere(sphere, hit)) out.push({ distance: rc.ray.origin.distanceTo(hit), point: hit.clone(), object: this }); };
    super(scene, camera, { name: `en ${spec.name}, ${info.cm} cm`, verb: 'ta', backName: '', backVerb: 'lägga ned', model,
      home: { pos: at.clone(), rot: new THREE.Euler(0, 0, Math.PI / 2) },
      heldPose: { pos: new THREE.Vector3(0.06, -0.2, -0.42 - L * 0.15), rot: new THREE.Euler(0.25, Math.PI / 2 - 0.15, 0) },
      pick: { pos: at.clone(), size: [0.01, 0.01, 0.01] }, cooldown: F.cook.cooldown });
    const cook = Number.isFinite(info.cook) ? Math.max(0, Math.min(F.cook.burn, info.cook)) : info.raw === false ? F.cook.done : 0;
    Object.assign(this, { host, isCaughtFish: true, outdoorPlace: true, species: spec.name, cm: info.cm, caughtAt: info.t ?? Date.now(), mesh, mat, spec, L,
      dropId: dropId(info.id) ? info.id : crypto.randomUUID().replaceAll('-',''), dropState: info.sd ? {...info.sd} : null,
      cook, by: COOKED_WORD[info.by] ? info.by : 'grill', heat: null, bites: 0, sizzleT: 0, burntCounted: cook >= F.cook.burn });
    this.setBites(Number.isInteger(info.bites) ? Math.max(0, Math.min(F.cook.bites - 1, info.bites)) : 0);
    this.paint();
    Object.defineProperty(this.takeTarget,'blocked',{get:()=>handBusy(this)||!!this.host.shared?.blocked(this)});
  }
  /** #1754: what it is (species, length in cm) and whether it is still raw. */
  get info() { return { species: this.species, cm: this.cm, raw: this.raw }; }
  get raw() { return this.cook < F.cook.done; }
  get cooked() { return !this.raw; }
  get burnt() { return this.cook >= F.cook.burn; }
  /** #1766: what a cat sees: 'placed' for a raw fish lying loose on the ground or held out (cooked, burnt, on the heat, gone: not for the cats). */
  get state() { if(this.host.shared&&!this.host.shared.feedable(this))return 'other';return (this.placed || this.held) && this.raw && !this.heat && !this.broken ? 'placed' : 'other'; }
  /** #1766: where a cat goes to eat it (world): on the ground where it lies (y = the floor), or right where the hand holds it. */
  middle(out = new THREE.Vector3()) {
    this.model.getWorldPosition(out);
    if (!this.held) { this.rest ??= restPose(this.model); out.y -= this.rest.lift + 0.001; }
    return out;
  }
  /** 'raw' / 'cooked' / 'burnt'. */
  get cookState() { return this.burnt ? 'burnt' : this.cooked ? 'cooked' : 'raw'; }
  /** The name follows the cooking: "en abborre, 23 cm" → "en grillad abborre, 23 cm" / "en stekt …" / "en bränd …". */
  rename() {
    const word = this.burnt ? 'bränd' : this.cooked ? COOKED_WORD[this.by] : '';
    this.name = this.takeTarget.name = `en ${word ? `${word} ` : ''}${this.species}, ${this.cm} cm`;
  }
  /** The skin's colour by the cooking: the species' own colours (white tint) → golden brown (cooked) → charred (burnt). The tint is divided by
   *  the skin's mean luminance (#1765), so a silvery roach and a dark eel both come out about FISHING.cook.golden (x `skin`), the pattern still faintly showing. */
  paint() {
    const { done, burn } = F.cook, c = this.cook, k = F.cook.skin / Math.max(0.15, this.mesh.geometry.userData.lum ?? F.cook.skin);
    if (c < done) TMP.setRGB(1, 1, 1).lerp(TMP2.copy(GOLDEN).multiplyScalar(k), c / done);
    else TMP.copy(GOLDEN).lerp(CHAR, Math.min(1, (c - done) / (burn - done))).multiplyScalar(k);
    this.mat.color.copy(TMP); this.mat.roughness = c > 0 ? 0.7 : 0.45; this.mat.metalness = c > 0 ? 0 : 0.1;
    this.rename();
  }
  setBites(n) { this.bites = n; this.mesh.scale.z = this.L * (1 - n / (F.cook.bites + 0.6)); }
  /** No home to go back to: it is taken or lies where it was put down. */
  get target() { return this.broken || this.held ? NONE : this.takeTarget; }
  /** In the hand: cooked = "Ät"; raw = nothing (a right click says why). */
  get useLabel() { return this.held && this.cooked ? 'Ät' : null; }
  onUse() {
    if(this.host.shared&&!this.host.shared.canAct(this))return;
    if(!this.raw&&this.bites>=F.cook.bites-1&&this.host.shared?.consume(this,()=>this.onUse())===false)return;
    if (this.raw) { this.host.onMessage('Fisken är rå – grilla eller stek den först'); return; }
    sfx.chew?.(this.where(), 1);
    this.setBites(this.bites + 1);if(this.dropState&&this.bites<F.cook.bites)this.host.shared?.keep();
    if (this.bites >= F.cook.bites) { const was = this.cookState; this.remove(); this.host.eaten(this, was); }
  }
  /** Something else taken into the hand: the fish is laid on the ground at your feet (it has no home). */
  putBack() { if (!this.held) return; this.placeAt(this.host.dropSpot(0.5), Math.random() * 6.28); }
  placeAt(p,yaw=0){if(!this._restoring&&this.host.shared?.place(this,p,yaw)===false)return;super.placeAt(p,yaw);}
  take() {
    if(!this._restoring&&this.host.shared?.take(this)===false)return;
    const from = this.heat;
    super.take();
    if (!this.held) return;
    this.heat = null;
    if (from) this.host.takenOff(this, from);
  }
  onTake() { sfx.splash?.(this.where()); }
  /** Off the hand and into a cooking spot: `parent` (the grill's group / the pan's model) at its local `pos`. */
  settle(parent, pos, yaw) {
    if(!this._restoring&&this.host.shared&&!this.host.shared.canAct(this))return false;
    if (!this.held) return false;
    forgetBicycleHand(this);
    this.held = false; if (heldItem() === this) setHeld(null);
    this.rest ??= restPose(this.model);
    parent.add(this.model);
    this.model.quaternion.setFromAxisAngle(UP, yaw).multiply(this.rest.q);
    this.model.position.set(pos.x, pos.y + this.rest.lift + 0.002, pos.z);
    this.placed = true;
    return true;
  }
  /** g: a Grill (src/grill.js): onto its cooking grate; it cooks while the grill burns. */
  intoGrill(g, { silent = false } = {}) {
    if (!g || !this.settle(g.object, g.grateTop, Math.PI / 2 + 0.25)) return false; // (across the grate)
    this.heat = { kind: 'grill', grill: g }; this.by = 'grill';
    if (silent) return true;
    sfx.click?.(this.where());
    if (!g.on) this.host.onMessage('Tänd grillen så grillas fisken');
    return true;
  }
  /** pan: the Pan (src/pan.js) on the hob: into it; it fries while the hob is on. */
  intoPan(pan) {
    if (!pan?.onHob || !this.settle(pan.model, new THREE.Vector3(0, 0.004, 0), Math.PI / 2 - 0.2)) return false;
    this.heat = { kind: 'pan', pan }; this.by = 'pan';
    sfx.click?.(this.where());
    if (!pan.hob?.on) this.host.onMessage('Slå på plattan så steks fisken');
    return true;
  }
  /** #1881 / #1887: onto the oven tray (oventray.js: put down, or in the open oven); it bakes while the tray is in the shut, powered oven. */
  intoOven(tray) {
    if (!tray?.open || !this.settle(tray.model, tray.spot, 0.15)) return false;
    this.heat = { kind: 'oven', oven: tray }; this.by = 'oven';
    sfx.click?.(this.where());
    this.host.onMessage(tray.inOven ? 'Stäng ugnsluckan så bakas fisken' : 'Sätt in plåten i ugnen så bakas fisken');
    return true;
  }
  /** #1881: into the open air fryer's basket (on its crisper plate); it cooks while the fryer runs with the basket in. */
  intoFryer(fryer) {
    if (!fryer?.open || !this.settle(fryer.basket, new THREE.Vector3(0, fryer.plateY, fryer.frontZ + 0.125), 0)) return false;
    this.heat = { kind: 'airfryer', fryer }; this.by = 'airfryer';
    sfx.click?.(this.where());
    this.host.onMessage('Skjut in korgen och starta airfryern');
    return true;
  }
  /** Cooking while on a lit grill / a pan on a lit hob / in the shut oven / the running air fryer (Fishing.update). */
  cookTick(dt) {
    if(this.host.shared&&!this.host.shared.canAct(this))return;
    const h = this.heat;
    if (!h) return;
    const parent = h.kind === 'grill' ? h.grill.object : h.kind === 'oven' ? h.oven.model : h.kind === 'airfryer' ? h.fryer.basket : h.pan.model;
    if (this.model.parent !== parent || this.held || this.broken) { this.heat = null; return; }
    const hot = h.kind === 'grill' ? h.grill.on : h.kind === 'oven' ? h.oven.cooking
      : h.kind === 'airfryer' ? h.fryer.cooking : h.pan.onHob && !!h.pan.hob?.on;
    if (!hot) return;
    const was = this.cookState;
    this.cook = Math.min(F.cook.burn, this.cook + dt * cookRate('caughtFish', h.kind)); // (#1881: the shared rule's rate per appliance)
    this.paint();
    if (was === 'raw' && this.cooked){this.host.onCooked(this,h.kind);if(this.dropState)this.host.shared?.keep();}
    if (!this.burntCounted && this.burnt) { this.burntCounted = true; this.host.onBurnt(this, h.kind);if(this.dropState)this.host.shared?.keep(); }
    if (this.cook > 1 && h.kind !== 'oven' && (this.sizzleT -= dt) <= 0) { sfx.sizzle?.(this.where()); this.sizzleT = 0.7 + Math.random() * 0.4; }
  }
  /** Out of the world (the oldest lying fish when there are too many; eaten). */
  remove() {
    if(this.host.shared?.remove(this)===false)return;
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    forgetBicycleHand(this);
    this.broken = true; this.placed = false; this.heat = null; this.model.removeFromParent(); this.model.visible = false;
  }
}

export class Fishing {
  /** scene, camera; riverFish: RiverFish or null (&nofish); player: Player (pos, groundAt); onMessage(text): the badge; onItem(fish): a new
   *  Holdable (main.js adds it to the holdables); touch(): touch controls on; rnd: injectable for tests.
   *  #1754: the hooks onRod() (the rod taken), onCatch(fish), onCooked(fish, kind), onBurnt(fish, kind), onTakenCooked(fish, kind) (taken
   *  off the heat cooked, not burnt), onEaten(fish, state); `cookers` = { grills: [Grill], pan } (main.js) for keep.js. */
  constructor({ scene, camera, riverFish, player, groundY, onMessage = () => {}, onItem = () => {}, touch = () => false, rnd = Math.random, now = () => Date.now() }) {
    const nop = () => {};
    Object.assign(this, { fins: [], onSharkCatch: nop, onRod: nop, onCatch: nop, onCooked: nop, onBurnt: nop, onTakenCooked: nop, onEaten: nop, onCatFed: nop, cookers: { grills: [], pan: null } });
    Object.assign(this, { scene, camera, riverFish, player, onMessage, onItem, touch, rnd, state: 'idle', t: 0, fish: [], shy: new Map(), at: new THREE.Vector3(), from: new THREE.Vector3(), bite: null, pending: null, waitT: 0, hinted: false, peers: null, remote: [], aimAt: null, aimFrame: -1, frame: 0, catches: 0, misses: 0, now, awaySince: null });
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
    if (this.state === 'reel' && this.pending) this.giveUpPending();
    this.state = 'idle'; this.bite = null; this.pending = null;
    this.float.visible = this.line.visible = false;
  }
  /** Stop waiting for the room's answer on the pending catch (a fish, or the shark: id -1). */
  giveUpPending() { const s = this.riverFish?.sync; if (this.pending?.shark) s?.giveUpShark?.(); else s?.giveUp?.(this.pending.id); }
  strike() {
    const b = this.bite;
    if (!b || !this.riverFish) { this.state = 'wait'; return; }
    if (b.shark && this.rnd() < SHARK.strike.slip) { // #1769: too strong: it tears loose before anybody is asked
      this.shy.set(-1, performance.now() / 1000 + F.wait.shy); this.bite = null; this.misses++; this.state = 'wait'; this.t = 0; this.waitT = 0;
      this.onMessage('Något stort slet sig loss!'); return;
    }
    this.state = 'reel'; this.t = 0; this.pending = b; this.bite = null;
    if (b.shark) { // #1769: the body lands beside you; the room decides
      const { at, yaw } = this.sharkSpot(); b.spot = at;
      if (!this.riverFish.sync.catchShark([at.x, at.y, at.z], yaw)) this.caught(-1, false);
      return;
    }
    this.riverFish.catchFish(b.id); // (solo: answered at once through `caught`)
  }
  /** The room's verdict on our catch (RiverFish.onCaught). */
  caught(id, ok) {
    const b = this.pending;
    if (this.state !== 'reel' || !b || b.id !== id) return;
    this.pending = null;
    if (!ok) { this.misses++; this.onMessage(b.shark ? 'Något stort slet sig loss!' : 'Fisken slet sig loss'); this.state = 'wait'; this.waitT = 0; return; }
    if (b.shark) this.landShark(b); else this.land(b);
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
    this.onCatch(fish);
    return fish;
  }
  /** #1769: where the shark's body lands: SHARK.landOff m from where you stand, away from the river, along the bank (yaw: its nose downstream). */
  sharkSpot() {
    const p = this.player.pos, q = riverProject(p.x, p.z), c = riverPoint(q.s), side = q.d >= 0 ? 1 : -1;
    const x = p.x + c.nx * side * SHARK.landOff, z = p.z + c.nz * side * SHARK.landOff, y = this.player.groundAt(x, z, p.y + 0.5);
    return { at: new THREE.Vector3(x, Number.isFinite(y) && Math.abs(y - p.y) < 1.5 ? y : p.y, z), yaw: Math.round(Math.atan2(c.nz, -c.nx) * 100) / 100 };
  }
  /** #1769: the shark landed: its fin in the hand, the rod at your feet, the body on the bank (drawn from the room's record by src/shark.js). */
  landShark() {
    this.reelIn();
    this.catches++;
    const fin = this.addFin(this.dropSpot(0.5));
    if (this.rod.held) this.rod.placeAt(this.dropSpot(0.45), this.camera.rotation.y + Math.PI / 2 + 0.2);
    fin.take();
    sfx.splash?.(fin.where());
    this.onMessage('En haj! Bara fenan går att bära – resten blir kvar på stranden.');
    this.onSharkCatch(fin);
    return fin;
  }
  /** #1769: a shark fin into the world (at most SHARK.keepFins; the oldest one lying about goes). */
  addFin(at) {
    const fin = new SharkFin(this.scene, this.camera, this, at);
    this.fins.push(fin);
    this.onItem(fin);
    const alive = this.fins.filter((f) => !f.broken);
    if (alive.length > SHARK.keepFins) alive.find((f) => !f.held && f !== heldItem() && f !== stowedItem())?.remove();
    this.fins = this.fins.filter((f) => !f.broken);
    return fin;
  }
  /** #1754: a fish taken off a grill / out of the pan (`from` = its heat). */
  takenOff(fish, from) { if (fish.cooked && !fish.burnt) this.onTakenCooked(fish, from.kind); }
  /** #1754: the last bite eaten (`state` = how it was cooked). */
  eaten(fish, state) { this.fish = this.fish.filter((f) => f !== fish); this.onEaten(fish, state); }
  /** #1766: the raw fish lying loose or held out: what the cats may eat (`cat.fishSource`). */
  get feedable() { return this.fish.filter((f) => f.state === 'placed'); }
  /** #1766: a cat ate a raw fish: gone, counted by `onCatFed` (not eaten by you: the quest and `onEaten` stay out of it). */
  eatenByCat(fish) { if(this.shared?.consume(fish,()=>this.eatenByCat(fish))===false)return;fish.remove(); this.fish = this.fish.filter((f) => f !== fish); this.onCatFed(fish); }
  /** #1754: the caught fish cooking in the pan / on grill `g` now (or null). */
  inPan(pan = this.cookers.pan) { return this.fish.find((f) => !f.broken && f.heat?.kind === 'pan' && f.heat.pan === pan) ?? null; }
  onGrill(g) { return this.fish.find((f) => !f.broken && f.heat?.kind === 'grill' && f.heat.grill === g) ?? null; }
  /** #1881: the caught fish in the oven / the air fryer's basket now (or null). */
  cookingIn(kind) { return this.fish.find((f) => !f.broken && f.heat?.kind === kind) ?? null; }
  addFish(info, at) {
    const fish = new CaughtFish(this.scene, this.camera, this, info, at);
    this.fish.push(fish);
    this.onItem(fish);
    const alive = this.fish.filter((f) => !f.broken&&!f.dropState);
    if (alive.length > F.keep) alive.find((f) => !f.held && f !== heldItem() && f !== stowedItem())?.remove();
    this.fish = this.fish.filter((f) => !f.broken);
    return fish;
  }
  /** The fish that bites now (weighted by appetite and closeness), or null; and the hazard per second. */
  appetite() {
    if (!this.riverFish) return { rate: 0, pick: null };
    const now = performance.now() / 1000, list = this.riverFish.near(this.at.x, this.at.z, F.wait.radius).filter((f) => !((this.shy.get(f.id) ?? 0) > now));
    if (this.riverFish.shark) list.push(...this.riverFish.shark.near(this.at.x, this.at.z, F.wait.radius).filter((f) => !((this.shy.get(f.id) ?? 0) > now))); // #1769
    let sum = 0; const w = list.map((f) => { const d = Math.hypot(f.x - this.at.x, f.z - this.at.z), k = (f.shark ? SHARK.bite : F.species[f.species]?.bite ?? 1) * Math.max(0, 1 - d / F.wait.radius); sum += k; return k; });
    let r = this.rnd() * sum, pick = null;
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) { pick = list[i]; break; } }
    return { rate: F.wait.rate * sum, pick: pick ?? list.at(-1) ?? null };
  }
  /** #1781: the rod lying away from its home (put down elsewhere, not in a hand, line in): after FISHING.respawn s the same rod is back under the
   *  bridge (never a second one). `awaySince` (ms, wall clock) is kept by keep.js so a reload counts the time away. Local to this client. */
  rodWatch() {
    const r = this.rod, h = F.home, away = !r.held && stowedItem() !== r && r.placed && !r.broken && this.state === 'idle' && Math.hypot(r.model.position.x - h.x, r.model.position.z - h.z) > 1;
    if (!away) { this.awaySince = null; return; }
    const t = this.now();
    if (this.awaySince === null || this.awaySince > t) this.awaySince = t;
    else if (t - this.awaySince >= F.respawn * 1000) { r.goHome(); r.model.visible = false; this.awaySince = null; }
  }
  /** Per frame: the float, the line, the bite and the others' floats. */
  update(dt) {
    this.frame++;
    this.rodWatch();
    for (const f of this.fish) f.cookTick(dt); // #1754
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
            this.bite = pick.shark ? { shark: true, id: -1, born: 0, species: 'haj' } : { id: pick.id, born: pick.born, species: pick.species, cm: catchCm(pick.id, pick.born, seed, range) };
            this.state = 'bite'; this.t = 0; this.splash(this.at); sfx.splash?.(this.at);
            this.onMessage(`${pick.shark ? 'Något stort nappar!' : 'Napp!'} ${this.touch() ? 'Tryck på Haka!' : 'Klicka nu!'}`);
          } else if (!pick && !this.hinted && this.waitT > F.wait.idleHint) { this.hinted = true; this.onMessage('Inga fiskar i närheten – prova ett annat ställe'); }
        }
      } else if (this.state === 'bite') {
        dip = F.float.dip * (0.6 + 0.4 * Math.sin(this.t * 22));
        if (this.t > (this.bite.shark ? SHARK.strike.window : F.wait.window)) {
          this.shy.set(this.bite.id, performance.now() / 1000 + F.wait.shy); this.bite = null; this.misses++;
          this.state = 'wait'; this.t = 0; this.waitT = 0; this.onMessage('Fisken simmade iväg');
        }
      } else if (this.t > F.wait.answer && this.pending) { // no answer from the room: given up (RiverFishSync forgets the request)
        const id = this.pending.id; this.giveUpPending(); if (this.pending?.id === id) this.caught(id, false);
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
      if (f.broken||f.dropState?.foreign&&!f.dropState.intent) continue;
      const e = { id:f.dropId,...(f.dropState?{sd:{...f.dropState}}:{}),sp: f.species, cm: f.cm, raw: f.raw ? 1 : 0 };
      if (f.cook > 0) {const precision=f.dropState?100:10; e.ck = Math.round(f.cook * precision) / precision; e.by = f.by; }
      if (f.bites) e.b = f.bites;
      const gi = f.heat?.kind === 'grill' ? this.cookers.grills.indexOf(f.heat.grill) : -1;
      if (f.held || f === stowedItem() || f.dropState?.intent==='take') e.h = 1;
      else if (gi >= 0) e.on = `grill${gi}`;
      else if (f.heat?.kind === 'pan' && f.heat.pan === this.cookers.pan) e.on = 'pan';
      else if (f.heat?.kind === 'oven' && f.heat.oven === this.cookers.oven) e.on = 'oven'; // (#1881)
      else if (f.heat?.kind === 'airfryer' && f.heat.fryer === this.cookers.fryer) e.on = 'airfryer';
      else {
        const p = f.model.getWorldPosition(new THREE.Vector3()), q = f.model.getWorldQuaternion(new THREE.Quaternion());
        e.p = [p.x, p.y, p.z].map((v) => Math.round(v * 1000) / 1000); e.q = [q.x, q.y, q.z, q.w].map((v) => Math.round(v * 1000) / 1000);
      }
      out.push(e);
    }
    const fins = this.fins.filter((f) => !f.broken).map((f) => { // #1769
      if (f.held || f === stowedItem()) return { h: 1 };
      const p = f.model.getWorldPosition(new THREE.Vector3()), q = f.model.getWorldQuaternion(new THREE.Quaternion());
      return { p: [p.x, p.y, p.z].map((v) => Math.round(v * 1000) / 1000), q: [q.x, q.y, q.z, q.w].map((v) => Math.round(v * 1000) / 1000) };
    });
    const ra = Number.isFinite(this.awaySince) ? Math.round(this.awaySince) : 0; // #1781: when the rod was left away from home
    return out.length || fins.length || ra ||this.dropReceipts?.length ? { v: 1, fish: out,...(this.dropReceipts?.length?{dr:this.dropReceipts.slice(-SHARED_FISH.journalMax)}:{}), ...(fins.length ? { fins } : {}), ...(ra ? { ra } : {}) } : null;
  }
  loadState(s) {
    if (s?.v !== 1 || !Array.isArray(s.fish)) return;
    this.dropReceipts=(Array.isArray(s.dr)?s.dr:[]).filter(dropId).slice(-SHARED_FISH.journalMax);
    if (Number.isFinite(s.ra) && s.ra > 0 && this.rod.placed && !this.rod.held) { // #1781 (`things` came first: the rod lies where it was left)
      if (this.now() - s.ra >= F.respawn * 1000) { this.rod.goHome(); this.rod.model.visible = false; this.awaySince = null; } else this.awaySince = s.ra;
    }
    let personal=0;
    for (const e of s.fish.slice(0, F.keep+SHARED_FISH.max)) {
      if(this.dropReceipts.includes(e?.id)||(!e?.sd&&personal++>=F.keep))continue;
      const spec = RIVER_FISH.species.find((x) => x.name === e?.sp), range = F.species[e?.sp]?.cm;
      if (!spec || !range || !Number.isInteger(e.cm) || e.cm < range[0] || e.cm > range[1]) continue;
      const placed = Array.isArray(e.p) && e.p.length === 3 && e.p.every(Number.isFinite) && Array.isArray(e.q) && e.q.length === 4 && e.q.every(Number.isFinite);
      const grill = /^grill\d$/.test(e.on ?? '') ? this.cookers.grills[Number(e.on.slice(5))] : null, pan = e.on === 'pan' ? this.cookers.pan : null;
      const oven = e.on === 'oven' ? this.cookers.oven : null, fryer = e.on === 'airfryer' ? this.cookers.fryer : null; // (#1881)
      if (!e.h && !placed && !grill && !pan && !oven && !fryer) continue;
      const fish = this.addFish({ id:e.id,sd:e.sd,species: e.sp, cm: e.cm, raw: e.raw !== 0, cook: Number.isFinite(e.ck) ? e.ck : undefined, by: e.by, bites: e.b }, placed ? new THREE.Vector3(...e.p) : this.dropSpot(0.5));
      fish._restoring=true;
      if (oven || fryer) { fish.held = true; if (oven) { fish.settle(oven.model, oven.spot, 0.15); fish.heat = { kind: 'oven', oven }; } else { fish.settle(fryer.basket, new THREE.Vector3(0, fryer.plateY, fryer.frontZ + 0.125), 0); fish.heat = { kind: 'airfryer', fryer }; } }
      else if (grill || pan) { fish.held = true; if (grill) fish.intoGrill(grill, { silent: true }); else { fish.settle(pan.model, new THREE.Vector3(0, 0.004, 0), Math.PI / 2 - 0.2); fish.heat = { kind: 'pan', pan }; } }
      else if (e.h && !heldItem()) fish.take();
      else if (placed) { fish.model.position.set(...e.p); fish.model.quaternion.set(...e.q); fish.placed = true; }
      else { fish.held = true; fish.putBack(); }
      fish._restoring=false;
    }
    for (const e of (Array.isArray(s.fins) ? s.fins : []).slice(0, SHARK.keepFins)) { // #1769
      const placed = Array.isArray(e?.p) && e.p.length === 3 && e.p.every(Number.isFinite) && Array.isArray(e.q) && e.q.length === 4 && e.q.every(Number.isFinite);
      if (!placed && !e?.h) continue;
      const fin = this.addFin(placed ? new THREE.Vector3(...e.p) : this.dropSpot(0.5));
      if (e.h && !heldItem()) fin.take();
      else if (placed) { fin.model.position.set(...e.p); fin.model.quaternion.set(...e.q); fin.placed = true; }
      else { fin.held = true; fin.putBack(); }
    }
  }
  state_() { return { state: this.state, at: this.at.toArray(), bite: this.bite, pending: this.pending, fish: this.fish.filter((f) => !f.broken).map((f) => ({ name: f.name, ...f.info, held: f.held, placed: f.placed, cook: f.cook, state: f.cookState, heat: f.heat?.kind ?? null, bites: f.bites })), remote: this.remoteShown ?? 0, catches: this.catches, misses: this.misses, fins: this.fins.filter((f) => !f.broken).map((f) => ({ held: f.held, placed: f.placed, at: f.model.getWorldPosition(new THREE.Vector3()).toArray() })) }; }
}

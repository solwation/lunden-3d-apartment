import * as THREE from 'three';
import { FISH as C, AIRFRYER } from './config.js';
import { sfx } from './audio.js';
import { heldItem, setHeld, handBusy } from './holdable.js';

// Fish fingers (#162): a carton on the lower open shelf in the freezer. E on it (the freezer open) takes one
// fish finger straight into the hand; the carton counts down and is empty after FISH.n. In the hand a click /
// "Ät" takes a bite (the stick gets shorter, a crunch); after FISH.bites bites it is eaten and the hand is empty.
// E on a table top / the worktop / the floor puts it down (holdable.js placement), E on it takes it again, E on
// the carton while holding one puts it back. Several can lie around at once (like the cups). F (the bare flat)
// clears them away and fills the carton again; so does a new visit. The cat may eat one off the floor (#163).
// Frying (#214): E on the pan standing on the hob with one in the hand lays it in (up to FISH.fry.slots side by side;
// not with the chicken in it). On a lit zone it goes from frozen pale to golden over FISH.fry.seconds (a sizzle), and
// from burnAt on it burns and smokes; E on it in the pan takes it out (fried: it steams a while, crunches louder and
// cannot go back in the carton).
// The air fryer (#287): E on its open basket with one in the hand lays it in (AIRFRYER.slots, a child of the basket); while
// the fryer runs with the basket in it cooks AIRFRYER.rate × as fast as in the pan (golden after one run), burning ones
// smoke out of the fryer's vents; E on one in the open basket takes it out (steaming, like one from the pan).

function crumbTexture() { // frozen breadcrumbs: pale yellow with lighter and darker speckles (frying tints it, #214)
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ead7a4';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(250,240,215,0.85)' : 'rgba(190,150,90,0.6)';
    g.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const crumbs = crumbTexture();
const F = C.fry;
const GOLDEN = new THREE.Color(F.golden), DARK = new THREE.Color(F.dark), WHITE = new THREE.Color(0xffffff);
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
const puff = puffTexture();
const fishMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.7 });

function labelTexture(top) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = top ? 176 : 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1f5fa8';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f2c230';
  g.fillRect(0, c.height - (top ? 26 : 12), c.width, top ? 26 : 12);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  if (top) {
    g.font = 'bold 34px sans-serif';
    g.fillText('Fiskpinnar', 16, 34);
    g.font = 'bold 22px sans-serif';
    g.fillText(`${C.n} st`, 16, 70);
    // three golden fish fingers on a plate, a lemon wedge
    g.fillStyle = '#eef3f8';
    g.beginPath(); g.ellipse(170, 100, 70, 36, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d9902e';
    for (let i = 0; i < 3; i++) { g.save(); g.translate(150 + i * 18, 100); g.rotate(-0.5); g.fillRect(-30, -6, 60, 12); g.restore(); }
    g.fillStyle = '#f6e04a';
    g.beginPath(); g.moveTo(205, 90); g.arc(205, 90, 16, 0, Math.PI * 0.8); g.closePath(); g.fill();
    g.fillStyle = '#1f5fa8';
    g.font = 'bold 15px sans-serif';
    g.fillText('MSC · Panerade', 16, c.height - 13);
  } else {
    g.font = 'bold 30px sans-serif';
    g.fillText(`Fiskpinnar ${C.n} st`, 12, 28);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (top) { t.center.set(0.5, 0.5); t.rotation = Math.PI; } // a box top's "up" is −z (the door): read from the door side
  return t;
}

/** One fish finger: breaded stick lying along +x from its origin (one end, bottom centre). */
export class FishFinger {
  constructor(pack) {
    const { scene, camera } = pack;
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(C.len, C.h, C.w).translate(C.len / 2, C.h / 2, 0);
    this.bread = new THREE.MeshStandardMaterial({ map: crumbs, roughness: 0.95 }); // its own: frying tints it (#214)
    this.stick = new THREE.Mesh(geo, this.bread);
    this.stick.castShadow = true;
    this.cap = new THREE.Mesh(new THREE.BoxGeometry(0.002, C.h * 0.8, C.w * 0.8).translate(0, C.h / 2, 0), fishMat); // the bitten end
    g.add(this.stick, this.cap);
    g.visible = false;
    Object.assign(this, { grip: [0.012, C.h / 2, 0], handCurl: 0.62, // pinched at the far end from the bites (#242)
      name: 'fiskpinnen', placeVerb: 'lägga ner', isFish: true, pack, scene, camera, model: g, state: 'box', held: false, bites: 0, bite: 0,
      cook: 0, hot: 0, sizzleT: 0, clock: Math.random() * 3 });
    // steam while it is hot, smoke while it burns: a few sprites that rise from it
    this.puffs = [...Array(4)].map((_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0 }));
      sp.userData.phase = i / 4; sp.visible = false; sp.raycast = () => {};
      scene.add(sp);
      return sp;
    });
    const self = this;
    this.target = { name: 'fiskpinnen', kind: 'holdable', verb: 'ta', pickable: g, item: this, get blocked() { return handBusy(self); }, toggle: () => this.take() };
    g.traverse((m) => { m.userData.door = this.target; });
    scene.add(g);
    this.setBites(0);
    this.paint();
  }

  get fried() { return this.cook >= F.seconds; }
  get burnt() { return this.cook >= F.burnAt; }

  /** Colour by how long it has fried: frozen pale → golden → burnt dark. */
  paint() {
    const k = this.cook;
    if (k < F.seconds) this.bread.color.copy(WHITE).lerp(GOLDEN, k / F.seconds);
    else if (k < F.burnAt) this.bread.color.copy(GOLDEN);
    else this.bread.color.copy(GOLDEN).lerp(DARK, Math.min(1, (k - F.burnAt) / (F.burnt - F.burnAt)));
    this.bread.roughness = k > 0 ? 0.8 : 0.95;
  }

  /** Into the pan at slot i (a child of the pan: it rides along when the pan is carried). */
  intoPan(pan, i) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'pan';
    this.slot = i;
    pan.model.add(this.model);
    this.model.visible = true;
    const n = F.slots, gap = 0.032;
    this.model.rotation.set(0, 0, 0);
    this.model.position.set(-C.len / 2, 0.004, (i - (n - 1) / 2) * gap);
    sfx.click(this.model.getWorldPosition(new THREE.Vector3()));
  }

  /** Into the air fryer's basket at slot i (#287): a child of the basket, lying along it. */
  intoFryer(fryer, i) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'fryer';
    this.slot = i;
    fryer.basket.add(this.model);
    this.model.visible = true;
    this.model.rotation.set(0, -Math.PI / 2, 0);
    this.model.position.copy(fryer.slotAt(i));
    sfx.click(this.model.getWorldPosition(new THREE.Vector3()));
  }
  setBites(n) {
    this.bites = n;
    const k = 1 - n / (C.bites + 0.5); // what is left of it
    this.stick.scale.x = k;
    this.cap.position.x = C.len * k + 0.001;
    this.cap.visible = n > 0;
  }

  /** Into the hand (from the carton, or picked up from where it lies). */
  take() {
    if (handBusy(this)) return; // one thing at a time (#102)
    if ((this.state === 'pan' || this.state === 'fryer') && this.fried) this.hot = F.steam; // straight out of the pan / fryer: it steams a while
    setHeld(this);
    this.held = true;
    this.state = 'held';
    if (!this.camera.parent) this.scene.add(this.camera);
    this.camera.add(this.model);
    this.model.visible = true;
    this.bite = 0;
    this.pose(0);
    sfx.click(this.model.getWorldPosition(new THREE.Vector3()));
  }

  pose(k) { // k 0 = in the hand … 1 = at the mouth
    this.model.position.set(C.held.x - 0.12 * k, C.held.y + 0.1 * k, C.held.z + 0.18 * k);
    this.model.rotation.set(0.25 - 0.2 * k, 1.9 + 0.5 * k, 0.15);
  }

  /** Put it down at a world point on a table top / the floor, lying flat with a random turn. */
  placeAt(p, yaw = Math.random() * Math.PI * 2) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'placed';
    this.scene.add(this.model);
    this.model.visible = true;
    this.poseAt(this.model, p, yaw);
    sfx.click(this.model.position);
    this.pack.onPlaced?.(this);
  }

  /** Lying flat at `p` turned `yaw` about its middle (the model or main.js's ghost, #368). */
  poseAt(obj, p, a = 0) {
    obj.rotation.set(0, a, 0);
    obj.position.set(p.x - Math.cos(a) * C.len / 2, p.y + 0.001, p.z + Math.sin(a) * C.len / 2);
  }

  /** Where it lies: the middle of the stick (world). */
  middle(out = new THREE.Vector3()) { return this.stick.localToWorld(out.set(C.len / 2, 0, 0)); }

  /** Gone (eaten, back in the carton, cleared away). */
  hide() {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'box';
    this.scene.add(this.model);
    this.model.visible = false;
    this.setBites(0);
    this.cook = 0; this.hot = 0;
    this.paint();
    for (const sp of this.puffs) sp.visible = false;
  }

  /** Something else was taken: it goes back in the carton. */
  putBack() { if (this.held) this.pack.putIn(this); }

  get useLabel() { return this.held ? 'Ät' : null; }
  /** A click / "Ät": a bite. */
  use() {
    if (!this.held || this.bite > 0) return;
    this.bite = 1;
    sfx.chew(this.model.getWorldPosition(new THREE.Vector3()), this.fried ? 1.35 : 1); // fried: a crunchier bite
  }

  /** In the pan on a lit zone: it fries; hot ones steam, burning ones smoke. */
  fry(dt) {
    const pan = this.pack.pan, hob = this.pack.hob;
    if (this.state === 'pan' && this.model.parent !== pan?.model) this.state = 'placed'; // (not expected: the pan keeps it)
    const fryer = this.state === 'fryer' ? this.pack.fryer : null;
    const frying = (this.state === 'pan' && pan?.onHob && hob?.on) || !!fryer?.cooking;
    if (frying) {
      const was = this.fried, wasBurnt = this.burnt;
      this.cook += fryer ? dt * AIRFRYER.rate : dt;
      this.hot = F.steam;
      this.paint();
      if (!was && this.fried) this.pack.onFried?.(this);
      if (!wasBurnt && this.burnt) this.pack.onBurnt?.(this);
      if (!fryer && this.cook > 1 && (this.sizzleT -= dt) <= 0) { sfx.sizzle(this.model.getWorldPosition(new THREE.Vector3())); this.sizzleT = 0.7 + Math.random() * 0.4; }
    } else if (this.hot > 0) this.hot = Math.max(0, this.hot - dt);
    // steam (hot and fried) or smoke (burnt and still on the heat)
    this.clock += dt;
    const smoke = frying && this.burnt, steam = !smoke && this.hot > 0 && this.cook > 0;
    const on = (smoke || steam) && this.model.visible && this.state !== 'box';
    const from = !on ? null : smoke && fryer ? fryer.vent.clone() : this.middle(new THREE.Vector3()); // the fryer smokes out of its vents
    for (const sp of this.puffs) {
      sp.visible = !!on;
      if (!on) continue;
      const k = (this.clock / (smoke ? 2 : 2.6) + sp.userData.phase) % 1;
      sp.position.copy(from).add(new THREE.Vector3(Math.sin((k + sp.userData.phase) * 8) * 0.012, 0.01 + k * (smoke ? 0.3 : 0.12), Math.cos((k + sp.userData.phase) * 6) * 0.01));
      sp.scale.setScalar(smoke ? 0.04 + k * 0.12 : 0.02 + k * 0.05);
      sp.material.color.setHex(smoke ? 0x8e9093 : 0xffffff);
      sp.material.opacity = (smoke ? 0.55 : 0.22 * Math.min(1, this.hot / 8)) * Math.sin(Math.PI * k);
    }
  }

  update(dt) {
    this.fry(dt);
    if (!this.held || this.bite <= 0) return;
    const before = this.bite;
    this.bite = Math.max(0, this.bite - dt * 2.5);
    if (before > 0.5 && this.bite <= 0.5) { // at the mouth: the bite comes off
      this.setBites(this.bites + 1);
      if (this.bites >= C.bites) { this.pack.eaten(this); return; }
    }
    this.pose(Math.sin(this.bite * Math.PI));
  }
}

/** The carton in the freezer and its fish fingers. */
export class FishPack {
  constructor(scene, camera, freezer) {
    Object.assign(this, { scene, camera, freezer, left: C.n, fingers: [], eatenCount: 0, pan: null, hob: null });
    const { w, d, h } = C.box;
    const side = new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.7 });
    const top = new THREE.MeshStandardMaterial({ map: labelTexture(true), roughness: 0.7 });
    const front = new THREE.MeshStandardMaterial({ map: labelTexture(false), roughness: 0.7 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), [side, side, top, side, side, front]);
    box.castShadow = box.receiveShadow = true;
    const ins = freezer.inside;
    box.position.set(ins.cx - 0.06, freezer.shelves[0], ins.cz - 0.05);
    box.rotation.y = 0.08; // a little askew; the −z face (material 5, "Fiskpinnar 15 st") faces the door
    scene.add(box);
    this.object = box;
    const pack = this;
    this.target = { kind: 'holdable', pickable: box, pack: this,
      get name() { return pack.holding || pack.left > 0 ? 'paketet' : 'det tomma paketet'; },
      get verb() { return pack.holding ? 'lägga tillbaka fiskpinnen i' : pack.left > 0 ? 'ta en fiskpinne ur' : 'titta i'; },
      get blocked() { return (!!heldItem() && !pack.holding) || !!pack.holding?.fried; },
      get blockedText() { return pack.holding?.fried ? 'Den är stekt nu – ät upp den!' : undefined; }, // a fried one does not go back (#214)
      toggle: () => this.press() };
    box.userData.door = this.target;
  }

  /** The fish finger in the hand, if that is what you hold. */
  get holding() { const h = heldItem(); return h?.isFish ? h : null; }

  /** E on the carton: one out into the hand, or the held one back in. */
  press() {
    const h = this.holding;
    if (h?.fried) return; // fried: it does not go back in the carton (#214)
    if (h) { this.putIn(h); return; }
    if (this.left <= 0) { sfx.click(this.object.position); return; } // empty
    let f = this.fingers.find((x) => x.state === 'box');
    if (!f) { f = new FishFinger(this); this.fingers.push(f); }
    this.left--;
    f.take();
  }

  putIn(f) {
    f.hide();
    this.left = Math.min(C.n, this.left + 1);
    sfx.click(this.object.position);
  }

  eaten(f) {
    f.hide();
    this.eatenCount++;
    this.onEaten?.();
  }

  /** The cat ate it off the floor (#163). */
  eatenByCat(f) {
    f.hide();
    this.catCount = (this.catCount ?? 0) + 1;
    this.onCatEaten?.();
  }

  /** The fish fingers lying out (E targets). */
  get placed() { return this.fingers.filter((f) => f.state === 'placed'); }

  /** The ones in the pan (#214). */
  get inPan() { return this.fingers.filter((f) => f.state === 'pan'); }

  /** The ones in the air fryer's basket (#287). */
  get inFryer() { return this.fingers.filter((f) => f.state === 'fryer'); }

  /** Smoke out of the air fryer: a burnt one in it while it runs (#287, the smoke alarm). */
  get fryerSmoke() { return !!this.fryer?.cooking && this.inFryer.some((f) => f.burnt); }

  /** Is the basket open with room for the one in the hand? */
  canAirfry() { return !!this.holding && !!this.fryer?.open && this.inFryer.length < AIRFRYER.slots; }

  /** The held one into the air fryer's basket, in the first free slot. */
  airfryHeld() {
    const f = this.holding;
    if (!f || !this.fryer) return;
    const used = new Set(this.inFryer.map((x) => x.slot));
    let i = 0;
    while (used.has(i)) i++;
    if (i >= AIRFRYER.slots) return;
    f.intoFryer(this.fryer, i);
  }

  /** Is there room in the pan for the one in the hand (not with the chicken in it)? */
  canFry(chickenInPan) { return !!this.holding && !!this.pan?.onHob && !chickenInPan && this.inPan.length < F.slots; }

  /** The held one into the pan, in the first free slot. */
  fryHeld() {
    const f = this.holding;
    if (!f || !this.pan) return;
    const used = new Set(this.inPan.map((x) => x.slot));
    let i = 0;
    while (used.has(i)) i++;
    if (i >= F.slots) return;
    f.intoPan(this.pan, i);
  }

  /** F / a fresh start: nothing lying around, a full carton. */
  reset() {
    for (const f of this.fingers) f.hide();
    this.left = C.n;
  }

  update(dt) {
    // the pan went back into its drawer with fish fingers in it: they are cleared away
    if (this.pan && this.pan.model.parent === this.pan.drawer?.object) for (const f of this.inPan) f.hide();
    for (const f of this.fingers) f.update(dt);
  }
}

/** The carton in the freezer (world.lids' freezer), or null when there is no freezer. */
export function buildFish(scene, camera, world) {
  const freezer = world.lids.find((l) => l.kind === 'fridge' && l.freezer);
  return freezer ? new FishPack(scene, camera, freezer) : null;
}

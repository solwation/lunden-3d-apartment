import * as THREE from 'three';
import { FISH as C } from './config.js';
import { sfx } from './audio.js';
import { heldItem, setHeld, handBusy } from './holdable.js';

// Fish fingers (#162): a carton on the lower open shelf in the freezer. E on it (the freezer open) takes one
// fish finger straight into the hand; the carton counts down and is empty after FISH.n. In the hand a click /
// "Ät" takes a bite (the stick gets shorter, a crunch); after FISH.bites bites it is eaten and the hand is empty.
// E on a table top / the worktop / the floor puts it down (holdable.js placement), E on it takes it again, E on
// the carton while holding one puts it back. Several can lie around at once (like the cups). F (the bare flat)
// clears them away and fills the carton again; so does a new visit. The cat may eat one off the floor (#163).

function crumbTexture() { // golden breadcrumbs: speckles of lighter and darker brown
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#c98a3c';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(240,190,110,0.8)' : 'rgba(140,80,30,0.6)';
    g.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const bread = new THREE.MeshStandardMaterial({ map: crumbTexture(), roughness: 0.95 });
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
    this.stick = new THREE.Mesh(geo, bread);
    this.stick.castShadow = true;
    this.cap = new THREE.Mesh(new THREE.BoxGeometry(0.002, C.h * 0.8, C.w * 0.8).translate(0, C.h / 2, 0), fishMat); // the bitten end
    g.add(this.stick, this.cap);
    g.visible = false;
    Object.assign(this, { name: 'fiskpinnen', placeVerb: 'lägga ner', isFish: true, pack, scene, camera, model: g, state: 'box', held: false, bites: 0, bite: 0 });
    const self = this;
    this.target = { name: 'fiskpinnen', kind: 'holdable', verb: 'ta', pickable: g, item: this, get blocked() { return handBusy(self); }, toggle: () => this.take() };
    g.traverse((m) => { m.userData.door = this.target; });
    scene.add(g);
    this.setBites(0);
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
  placeAt(p) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'placed';
    this.scene.add(this.model);
    this.model.visible = true;
    const a = Math.random() * Math.PI * 2; // a random turn about its middle, which lands on p
    this.model.rotation.set(0, a, 0);
    this.model.position.set(p.x - Math.cos(a) * C.len / 2, p.y + 0.001, p.z + Math.sin(a) * C.len / 2);
    sfx.click(this.model.position);
    this.pack.onPlaced?.(this);
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
  }

  /** Something else was taken: it goes back in the carton. */
  putBack() { if (this.held) this.pack.putIn(this); }

  get useLabel() { return this.held ? 'Ät' : null; }
  /** A click / "Ät": a bite. */
  use() {
    if (!this.held || this.bite > 0) return;
    this.bite = 1;
    sfx.chew(this.model.getWorldPosition(new THREE.Vector3()));
  }

  update(dt) {
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
    Object.assign(this, { scene, camera, freezer, left: C.n, fingers: [], eatenCount: 0 });
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
      get blocked() { return !!heldItem() && !pack.holding; },
      toggle: () => this.press() };
    box.userData.door = this.target;
  }

  /** The fish finger in the hand, if that is what you hold. */
  get holding() { const h = heldItem(); return h?.isFish ? h : null; }

  /** E on the carton: one out into the hand, or the held one back in. */
  press() {
    const h = this.holding;
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

  /** The fish fingers lying out (E targets). */
  get placed() { return this.fingers.filter((f) => f.state === 'placed'); }

  /** F / a fresh start: nothing lying around, a full carton. */
  reset() {
    for (const f of this.fingers) f.hide();
    this.left = C.n;
  }

  update(dt) { for (const f of this.fingers) f.update(dt); }
}

/** The carton in the freezer (world.lids' freezer), or null when there is no freezer. */
export function buildFish(scene, camera, world) {
  const freezer = world.lids.find((l) => l.kind === 'fridge' && l.freezer);
  return freezer ? new FishPack(scene, camera, freezer) : null;
}

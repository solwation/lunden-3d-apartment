import * as THREE from 'three';
import { FRIES as FR, DRINKS as D } from './config.js';
import { sfx } from './audio.js';
import { Holdable, heldItem, setHeld, handBusy } from './holdable.js';
import { Steam } from './cups.js';

// Aviko frozen fries (#301): a stand-up bag leaning back on the freezer's top shelf, a Holdable like the milk (#168): E with
// the freezer open takes it, E on its place puts it back, E on a table top / the worktop / the floor puts it down. In the
// hand, E on the air fryer's open basket (#287) pours a portion (the bag tips, a rustle and a rattle; the fries drop in as a
// loose heap, one InstancedMesh, a child of the basket so it rides along); FRIES.portions pours in a bag, FRIES.max
// portions in the basket, one kind at a time (not with fish fingers). While the fryer runs with the basket in they cook:
// frozen pale → golden after FRIES.golden s (one run), burnt from FRIES.burnAt (a third run) with smoke out of the vents
// (→ the smoke alarm, a deduction). Done and pulled out, they steam (cups.js Steam) as they cool over FRIES.steam s.
// E on the basket with a free hand takes FRIES.bunch of them into the hand (FriesBunch, like a fish finger): a click /
// "Ät" eats one; a bunch can be put down and taken again. F: the basket emptied, the bunches cleared, a full bag at home.

const RAW = new THREE.Color(FR.raw), GOLDEN = new THREE.Color(FR.goldenColor), DARK = new THREE.Color(FR.dark), PALE = new THREE.Color(0xffffff);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One fry on a drawing: a golden stick with darker ends. */
function drawFry(g, x, y, len, a, w = 7) {
  g.save(); g.translate(x, y); g.rotate(a);
  const gr = g.createLinearGradient(-len / 2, 0, len / 2, 0);
  gr.addColorStop(0, '#b8741f'); gr.addColorStop(0.12, '#f0b545'); gr.addColorStop(0.88, '#f3c057'); gr.addColorStop(1, '#a9681b');
  g.fillStyle = gr; g.fillRect(-len / 2, -w / 2, len, w);
  g.fillStyle = 'rgba(255,240,190,0.5)'; g.fillRect(-len / 2 + 3, -w / 2 + 1, len - 6, 2);
  g.restore();
}

/** The bag's front: our own simple print (a plain wordmark, not Aviko's artwork). */
const frontTexture = () => canvasTex(256, 352, (g, W, H) => {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#ffcf2e'); bg.addColorStop(0.55, '#ffb21e'); bg.addColorStop(1, '#f28a12');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.18)'; // a sunburst behind the bowl
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(128, 225); g.arc(128, 225, 240, a, a + 0.12); g.fill(); }
  // the wordmark on a red rounded banner
  g.fillStyle = '#d4202a';
  g.beginPath(); g.roundRect(38, 26, 180, 62, 18); g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold italic 46px sans-serif'; g.fillText('Aviko', 128, 58);
  g.fillStyle = '#7a2a08'; g.font = 'bold 30px sans-serif'; g.fillText('Pommes Frites', 128, 118);
  g.fillStyle = '#ffffff'; g.font = 'bold 22px sans-serif'; g.fillText('SUPER CRUNCH', 128, 148);
  // a heap of golden fries in a white bowl
  for (let i = 0; i < 46; i++) drawFry(g, 128 + (Math.random() - 0.5) * 120, 222 + (Math.random() - 0.5) * 36 - (i / 46) * 24, 60 + Math.random() * 30, -0.9 + Math.random() * 1.8);
  g.fillStyle = '#fbfbf8';
  g.beginPath(); g.moveTo(52, 236); g.quadraticCurveTo(128, 330, 204, 236); g.closePath(); g.fill();
  g.fillStyle = '#e1e1dc'; g.fillRect(52, 234, 152, 5);
  g.fillStyle = '#d4202a'; g.beginPath(); g.arc(214, 314, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.font = 'bold 20px sans-serif'; g.fillText('1 kg', 214, 315);
  g.fillStyle = '#7a2a08'; g.font = '13px sans-serif'; g.fillText('Ugn · Airfryer · Fritös', 98, 326);
});

/** The back: an ingredient block in grey lines on a white panel. */
const backTexture = () => canvasTex(256, 352, (g, W, H) => {
  g.fillStyle = '#ffb21e'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fbfaf5'; g.fillRect(22, 70, W - 44, 230);
  g.fillStyle = '#d4202a'; g.font = 'bold italic 30px sans-serif'; g.textAlign = 'center'; g.fillText('Aviko', 128, 46);
  g.fillStyle = '#555'; g.textAlign = 'left'; g.font = 'bold 14px sans-serif'; g.fillText('Ingredienser', 34, 92);
  g.fillStyle = '#9a9a9a';
  for (let y = 106; y < 290; y += 12) g.fillRect(34, y, 150 + Math.random() * 38, 5);
  g.fillStyle = '#222'; for (let x = 70; x < 186; x += 4) g.fillRect(x, 310, Math.random() < 0.5 ? 2 : 1, 26); // a barcode
});

/** A fry's skin: lighter in the middle, a shade darker at the tips (crisp ends once fried). */
const stickTexture = () => canvasTex(64, 8, (g, W, H) => {
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, '#c9b9a0'); gr.addColorStop(0.15, '#ffffff'); gr.addColorStop(0.85, '#fbf6ee'); gr.addColorStop(1, '#c4b298');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
});

const puffTexture = () => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
};

let skin = null;
/** Colour by cooking time: frozen pale → golden → burnt dark. */
function cookColour(out, cook) {
  if (cook <= 0) return out.copy(RAW);
  if (cook < FR.golden) return out.copy(RAW).lerp(GOLDEN, cook / FR.golden);
  if (cook < FR.burnAt) return out.copy(GOLDEN);
  return out.copy(GOLDEN).lerp(DARK, Math.min(1, (cook - FR.burnAt) / (FR.burnt - FR.burnAt)));
}

/** The bag, its origin at the bottom centre, the print on +z: a pillowy box with a sealed, folded top. */
function bagModel() {
  const { w, h, d } = FR.bag, g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d, 10, 14, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { // thin at the edges, full in the middle
    const nx = p.getX(i) / (w / 2), ny = p.getY(i) / (h / 2);
    p.setZ(i, p.getZ(i) * Math.max(0.12, (1 - 0.8 * nx ** 4) * (1 - 0.85 * Math.max(0, ny) ** 5) * (1 - 0.5 * Math.max(0, -ny) ** 6)));
  }
  geo.translate(0, h / 2, 0);
  geo.computeVertexNormals();
  const plain = new THREE.MeshStandardMaterial({ color: 0xffb21e, roughness: 0.42 });
  const front = new THREE.MeshStandardMaterial({ map: frontTexture(), roughness: 0.38 });
  const back = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.42 });
  const body = new THREE.Mesh(geo, [plain, plain, plain, plain, front, back]);
  const seal = new THREE.Mesh(new THREE.BoxGeometry(w * 0.97, 0.03, 0.004), new THREE.MeshStandardMaterial({ color: 0xe8960f, roughness: 0.5 }));
  seal.position.y = h + 0.013;
  const fold = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.035, 0.004), seal.material); // the top folded over to the front
  fold.position.set(0, h - 0.004, d * 0.12); fold.rotation.x = -0.35;
  g.add(body, seal, fold);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

export class FriesBag extends Holdable {
  constructor(scene, camera, freezer) {
    const model = bagModel(), ins = freezer.inside, { h, d } = FR.bag;
    const lean = THREE.MathUtils.degToRad(64); // from upright: leaning back against the freezer's back wall under the roof
    const y = freezer.shelves[1] + Math.sin(lean) * d / 2 + 0.002;
    const pos = new THREE.Vector3(ins.cx + 0.02, y, ins.cz - 0.17);
    super(scene, camera, {
      name: 'påsen med pommes frites', verb: 'ta', backName: 'frysen', backVerb: 'lägga tillbaka påsen i', placeVerb: 'lägga ner',
      model, home: { pos, rot: new THREE.Euler(-lean, Math.PI, 0, 'YXZ') }, // the print towards the door and up
      heldPose: { pos: new THREE.Vector3(FR.held.x, FR.held.y, FR.held.z), rot: new THREE.Euler(0.2, -0.35, -0.08) },
      pick: { pos: new THREE.Vector3(pos.x, pos.y + 0.08, pos.z + 0.14), size: [0.27, 0.17, 0.34] }, cooldown: 0.3,
    });
    Object.assign(this, { left: FR.portions, tilt: 0, tiltT: 0, grip: [FR.bag.w / 2 - 0.02, h * 0.82, 0], isBag: true });
  }

  /** Tip it for `secs` seconds (pouring into the basket). */
  pour(secs) { this.tiltT = secs; }
  /** Thinner as it empties. */
  shape() { this.model.scale.z = 0.45 + 0.55 * this.left / FR.portions; }
  onTake() { sfx.rustle(this.where()); }
  onPut() { sfx.rustle(this.where()); this.tiltT = 0; this.tilt = 0; }

  tick(dt) {
    this.tiltT = Math.max(0, this.tiltT - dt);
    this.tilt += ((this.tiltT > 0 ? 1 : 0) - this.tilt) * Math.min(1, dt * 8);
    const r = this.heldPose.rot;
    this.model.rotation.set(r.x - 0.5 * this.tilt, r.y, r.z + (D.tilt + 0.3) * this.tilt);
  }
}

/** A few fries in the hand (from the basket): lying along +x from their pinched ends (the origin). */
export class FriesBunch {
  constructor(mgr) {
    const { scene, camera } = mgr;
    Object.assign(this, { mgr, scene, camera, name: 'pommesen', placeVerb: 'lägga ner', isFries: true, state: 'pool', held: false,
      n: 0, cook: 0, hot: 0, bite: 0, steamT: 0, grip: [0.012, FR.t / 2, 0], handCurl: 0.62, lastAt: new THREE.Vector3() });
    const g = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.75 });
    const geo = new THREE.BoxGeometry(FR.len, FR.t, FR.t).translate(FR.len / 2, FR.t / 2, 0);
    this.sticks = [...Array(FR.bunch)].map((_, j) => {
      const m = new THREE.Mesh(geo, this.mat);
      const k = j - (FR.bunch - 1) / 2;
      m.position.set(0, (j % 2) * FR.t * 0.6, k * 0.007);
      m.rotation.set(0.1 * k, 0.13 * k, 0.04 * (j % 2 ? 1 : -1));
      m.scale.x = [1, 0.86, 1.06, 0.92][j % 4];
      m.castShadow = true;
      g.add(m);
      return m;
    });
    this.steam = new Steam();
    g.add(this.steam.mesh);
    g.visible = false;
    this.model = g;
    const self = this;
    this.target = { name: 'pommesen', kind: 'holdable', verb: 'ta', pickable: g, item: this, get blocked() { return handBusy(self); }, toggle: () => this.take() };
    g.traverse((m) => { m.userData.door = this.target; });
    scene.add(g);
  }

  get useLabel() { return this.held ? 'Ät' : null; }

  /** `n` fries cooked `cook` s, `hot` s of steam left: into the hand. */
  fill(n, cook, hot) {
    Object.assign(this, { n, cook, hot });
    this.sticks.forEach((s, j) => { s.visible = j < n; });
    cookColour(this.mat.color, cook);
  }

  take() {
    if (handBusy(this)) return;
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

  pose(k) { // 0 = in the hand … 1 = at the mouth
    const H = FR.bunchHeld;
    this.model.position.set(H.x - 0.12 * k, H.y + 0.1 * k, H.z + 0.18 * k);
    this.model.rotation.set(0.25 - 0.2 * k, 1.9 + 0.5 * k, 0.15);
  }

  placeAt(p) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'placed';
    this.scene.add(this.model);
    this.model.visible = true;
    const a = Math.random() * Math.PI * 2;
    this.model.rotation.set(0, a, 0);
    this.model.position.set(p.x - Math.cos(a) * FR.len / 2, p.y + 0.001, p.z + Math.sin(a) * FR.len / 2);
    sfx.click(this.model.position);
  }

  /** Gone (eaten, cleared away). */
  hide() {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'pool';
    this.scene.add(this.model);
    this.model.visible = false;
    this.steam.update(0, 0);
  }

  /** Something else in the hand / F: cleared away. */
  putBack() { if (this.held) this.hide(); }

  use() {
    if (!this.held || this.bite > 0) return;
    this.bite = 1;
    sfx.chew(this.model.getWorldPosition(new THREE.Vector3()), this.cook >= FR.golden ? 1.3 : 1);
  }

  update(dt) {
    if (this.state === 'pool') return;
    this.hot = Math.max(0, this.hot - dt);
    this.steamT += dt;
    const k = this.model.visible ? 0.6 * Math.min(1, this.hot / FR.steam) : 0;
    if (k > 0.01) {
      const q = this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(q);
      side.y = 0; if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      this.steam.mesh.position.set(FR.len * 0.55, 0, 0);
      this.steam.update(FR.t, k, this.steamT, side, this.steam.lean);
    } else this.steam.update(0, 0);
    if (!this.held || this.bite <= 0) return;
    const before = this.bite;
    this.bite = Math.max(0, this.bite - dt * 2.5);
    if (before > 0.5 && this.bite <= 0.5) { // at the mouth: one fry is eaten
      this.n--;
      this.sticks.forEach((s, j) => { s.visible = j < this.n; });
      this.mgr.onEaten?.();
      if (this.n <= 0) { this.hide(); return; }
    }
    this.pose(Math.sin(this.bite * Math.PI));
  }
}

/** The bag in the freezer, the fries in the air fryer's basket, and the bunches taken out of it. */
export class Fries {
  constructor(scene, camera, freezer, fryer) {
    skin ??= stickTexture();
    Object.assign(this, { scene, camera, fryer, count: 0, cook: 0, hot: 0, clock: 0, bunches: [], falling: 0 });
    this.bag = new FriesBag(scene, camera, freezer);
    // the heap: up to max portions of sticks, laid out once (basket-local), shown 0 … count-1, the top ones last
    const N = FR.portion * FR.max, geo = new THREE.BoxGeometry(FR.len, FR.t, FR.t);
    this.mat = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.8 });
    this.heap = new THREE.InstancedMesh(geo, this.mat, N);
    Object.assign(this.heap, { count: 0, frustumCulled: false, castShadow: true, receiveShadow: true });
    const cz = fryer.frontZ + 0.125, hx = 0.1, hz = 0.08; // the tray's centre (basket-local z) and half-sizes, inside its walls
    this.spots = [...Array(N)].map((_, i) => {
      const layer = i / N, shrink = 1 - 0.45 * layer, o = new THREE.Object3D();
      o.position.set((Math.random() * 2 - 1) * hx * shrink, fryer.plateY + FR.t / 2 + 0.002 + layer * 0.032 + Math.random() * 0.006, cz + (Math.random() * 2 - 1) * hz * shrink);
      o.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4);
      o.scale.x = 0.8 + Math.random() * 0.35;
      o.updateMatrix();
      this.heap.setColorAt(i, new THREE.Color().setScalar(0.88 + Math.random() * 0.14));
      return { m: o.matrix.clone(), y: o.position.y, o, start: 0 };
    });
    this.spots.forEach((s, i) => this.heap.setMatrixAt(i, s.m));
    fryer.basket.add(this.heap);
    const ray = THREE.InstancedMesh.prototype.raycast;
    this.heap.raycast = (rc, hits) => { if (fryer.open && this.count > 0) ray.call(this.heap, rc, hits); }; // never through the closed fryer
    const self = this;
    this.takeTarget = { name: 'pommes frites', kind: 'holdable', verb: 'ta', pickable: this.heap,
      get blocked() { return !!heldItem() || !self.done; },
      get blockedText() { return heldItem() ? undefined : self.cook > 0 ? 'Pommesen är inte klara än' : 'Pommesen är frysta – starta airfryern'; },
      toggle: () => this.takeBunch() };
    this.heap.userData.door = this.takeTarget;
    this.pourTarget = { name: 'pommes frites i airfryern', kind: 'pourfries', verb: 'hälla',
      get blocked() { return !!this.blockedText; },
      get blockedText() {
        if (self.bag.left <= 0) return 'Påsen är tom';
        if (self.fishIn?.()) return 'Korgen har fiskpinnar';
        if (self.count + FR.portion > FR.portion * FR.max) return 'Korgen är full';
        if (self.cook > 0) return 'Ät upp pommesen först';
        return undefined;
      },
      toggle: () => this.pour() };
    // steam over the open basket (two sets of wisps), smoke out of the vents
    this.steams = [-0.045, 0.045].map((x) => {
      const s = new Steam();
      s.mesh.position.set(x, 0, cz);
      fryer.basket.add(s.mesh);
      return s;
    });
    this.steamT = 0;
    const puff = puffTexture();
    this.puffs = [...Array(4)].map((_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0, color: 0x8e9093 }));
      sp.userData.phase = i / 4; sp.visible = false; sp.raycast = () => {};
      scene.add(sp);
      return sp;
    });
    this.paint();
  }

  get done() { return this.count > 0 && this.cook >= FR.golden; }
  get burnt() { return this.cook >= FR.burnAt; }
  /** Smoke out of the air fryer (the smoke alarm): burning fries in it while it runs. */
  get smoke() { return this.count > 0 && this.burnt && this.fryer.cooking; }
  /** The bunches lying out (E targets). */
  get placed() { return this.bunches.filter((b) => b.state === 'placed'); }
  /** The bag in the hand, if that is what you hold. */
  get holdingBag() { return heldItem() === this.bag; }

  paint() { cookColour(this.mat.color, this.cook); }

  /** E with the bag on the open basket: a portion in. */
  pour() {
    if (this.pourTarget.blocked || !this.fryer.open) return;
    this.bag.left--;
    this.bag.shape();
    this.bag.pour(FR.pour);
    const from = this.count;
    this.count = Math.min(FR.portion * FR.max, this.count + FR.portion);
    for (let i = from; i < this.count; i++) this.spots[i].start = 0.12 + ((i - from) / FR.portion) * (FR.pour - 0.25) + Math.random() * 0.08;
    this.falling = FR.pour + 0.6;
    this.heap.count = this.count;
    sfx.pourFries?.(this.fryer.basket.getWorldPosition(new THREE.Vector3()));
    this.onPoured?.();
  }

  /** E on the done fries with a free hand: a bunch into the hand. */
  takeBunch() {
    if (this.takeTarget.blocked) return;
    const n = Math.min(FR.bunch, this.count);
    this.count -= n;
    this.heap.count = this.count;
    this.heap.boundingSphere = null;
    let b = this.bunches.find((x) => x.state === 'pool');
    if (!b) { b = new FriesBunch(this); this.bunches.push(b); }
    b.fill(n, this.cook, this.hot);
    b.take();
    if (!this.count) { this.cook = 0; this.hot = 0; this.paint(); } // empty: the next pour starts frozen
  }

  /** A full basket of golden, freshly done fries (`&fries`, screenshots). */
  cooked() {
    Object.assign(this, { count: FR.portion * FR.max, cook: FR.golden + 1, hot: FR.steam, falling: 0 });
    this.spots.forEach((s, i) => { s.start = -1; this.heap.setMatrixAt(i, s.m); });
    this.heap.count = this.count;
    this.heap.instanceMatrix.needsUpdate = true;
    this.paint();
  }

  /** F / a fresh start: the basket empty, no bunches, a full bag. */
  reset() {
    for (const b of this.bunches) b.hide();
    Object.assign(this, { count: 0, cook: 0, hot: 0, falling: 0 });
    this.heap.count = 0;
    this.bag.left = FR.portions;
    this.bag.shape();
    this.paint();
    for (const s of this.steams) s.update(0, 0);
    for (const sp of this.puffs) sp.visible = false;
  }

  update(dt) {
    const fr = this.fryer, cooking = fr.cooking && this.count > 0;
    if (cooking) {
      const wasDone = this.done, wasBurnt = this.burnt;
      this.cook += dt;
      this.hot = FR.steam;
      this.paint();
      if (!wasDone && this.done) this.onGolden?.();
      if (!wasBurnt && this.burnt) this.onBurnt?.();
    } else this.hot = Math.max(0, this.hot - dt);
    // the fries of a pour drop into the basket
    if (this.falling > 0) {
      this.falling -= dt;
      for (let i = 0; i < this.count; i++) {
        const s = this.spots[i];
        if (s.start <= -1) continue;
        s.start -= dt;
        const k = Math.min(1, Math.max(0, -s.start / 0.3)), drop = s.start > 0 ? 1 : (1 - k) * (1 - k);
        s.o.position.y = s.y + 0.2 * drop;
        s.o.updateMatrix();
        this.heap.setMatrixAt(i, s.start > 0 ? ZERO : s.o.matrix);
        if (k >= 1) s.start = -1;
      }
      this.heap.instanceMatrix.needsUpdate = true;
      this.heap.boundingSphere = null;
    }
    // steam over the open basket while they are hot and done
    this.steamT += dt;
    const k = this.done && !cooking && fr.out > 0.3 && !this.burnt ? 0.8 * Math.min(1, this.hot / FR.steam) : 0;
    if (k > 0.01) {
      const q = fr.basket.getWorldQuaternion(new THREE.Quaternion()).invert();
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(q);
      side.y = 0; if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      this.steams.forEach((s, i) => s.update(fr.plateY + 0.03, k, this.steamT + i * 1.7, side, s.lean));
    } else for (const s of this.steams) s.update(0, 0);
    // smoke out of the vents while burnt ones are on the heat
    this.clock += dt;
    const smoke = this.smoke;
    for (const sp of this.puffs) {
      sp.visible = smoke;
      if (!smoke) continue;
      const t = (this.clock / 2 + sp.userData.phase) % 1;
      sp.position.copy(fr.vent).add(new THREE.Vector3(Math.sin((t + sp.userData.phase) * 8) * 0.012, 0.01 + t * 0.3, Math.cos((t + sp.userData.phase) * 6) * 0.01));
      sp.scale.setScalar(0.04 + t * 0.12);
      sp.material.opacity = 0.55 * Math.sin(Math.PI * t);
    }
    for (const b of this.bunches) b.update(dt);
  }
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** The bag in the freezer (world.lids' freezer) and the fries in `fryer`; null without a freezer. */
export function buildFries(scene, camera, world, fryer) {
  const freezer = world.lids.find((l) => l.kind === 'fridge' && l.freezer);
  return freezer ? new Fries(scene, camera, freezer, fryer) : null;
}

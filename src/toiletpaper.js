// Toilet-paper holders (#426, TOILET_PAPER in config): one beside each toilet (toilet.js), brushed steel like the towel
// hooks (#424), on the tank's wall at the side away from the toilet, a white roll on it with a short tail hanging.
// E on the roll (a free hand) pulls out a sheet: the roll turns, a soft rustle, the strip hangs down one sheet further
// (up to `hang` sheets). E on the hanging strip tears it off into the hand as a crumpled wad (crumple sound); it can't be
// put down — it is thrown away with E on a toilet (the lid opens if it is shut, the wad drops in and it flushes; with the
// tank still refilling it floats there until the next flush). Each roll gets thinner as it is used and is empty after
// `sheets`; F (the bare flat) puts full rolls back and clears the wad away. Not loose items (they stay with F, like the
// bathroom fittings); nothing is saved across a reload. Stats: `toiletPaper` per wad flushed away.
import * as THREE from 'three';
import { TOILET_PAPER as C, TOWEL_HOOKS } from './config.js';
import { sfx } from './audio.js';
import { heldItem, setHeld } from './holdable.js';

const H = TOWEL_HOOKS.hook; // the same brushed steel as the towel hooks
const steel = new THREE.MeshStandardMaterial({ color: H.color, metalness: H.metalness, roughness: H.roughness });
const card = new THREE.MeshStandardMaterial({ color: 0xb38b5d, roughness: 0.9 });
const hole = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 1 });

/** Soft paper with a faint emboss and the perforation across it every sheet (UV v in sheets). */
function paperTexture() {
  const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n);
  for (let j = 4; j < n; j += 8) for (let i = 4 + ((j >> 3) & 1) * 4; i < n; i += 8) { // a quilted emboss
    g.fillStyle = 'rgba(0,0,0,0.05)'; g.beginPath(); g.arc(i, j, 2, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.14)';
  for (let i = 0; i < n; i += 4) g.fillRect(i, 0, 2, 1); // the perforation at the sheet's edge
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const paperMap = paperTexture();
const paper = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.95, map: paperMap });
const rollPaper = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.95 });

function mesh(geo, m) {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = o.receiveShadow = true;
  return o;
}

/** A crumpled paper wad: a lumpy ball (an icosphere with every vertex pushed in or out), radius 1. */
function wadGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 2), p = geo.attributes.position, v = new THREE.Vector3();
  const lump = new Map(); // the same push for the vertices that share a place (no cracks)
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!lump.has(k)) { const q = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; lump.set(k, 0.72 + 0.4 * (q - Math.floor(q))); }
    v.multiplyScalar(lump.get(k));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); // faceted: creases
  return geo;
}

/** The torn-off paper in the hand (one at a time): `isPaper`; no placeAt (it goes in a toilet, not on a table). */
class Wad {
  constructor(pack) {
    const { scene, camera } = pack;
    this.model = mesh(wadGeometry(3), rollPaper);
    this.model.visible = false;
    scene.add(this.model);
    Object.assign(this, { pack, scene, camera, name: 'pappret', isPaper: true, held: false, grip: [0.9, -0.2, 0], handCurl: 0.75,
      sheets: 0, sink: -1, toilet: null });
  }

  /** Into the hand, `sheets` sheets crumpled up. */
  take(sheets) {
    setHeld(this);
    this.held = true;
    this.sheets = sheets;
    this.toilet = null; this.sink = -1;
    if (!this.camera.parent) this.scene.add(this.camera);
    this.camera.add(this.model);
    this.model.scale.setScalar(C.wad[0] + (C.wad[1] - C.wad[0]) * Math.min(1, (sheets - 1) / (C.hang - 1)));
    this.model.position.set(...C.held);
    this.model.rotation.set(0.4, 0.8, 0.2);
    this.model.visible = true;
  }

  /** Gone: thrown away, flushed, or something else was taken (setHeld), or F. */
  hide() {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.scene.add(this.model);
    this.model.visible = false;
    this.toilet = null; this.sink = -1;
  }
  putBack() { if (this.held) this.hide(); }

  /** Dropped into `t`'s bowl: floating on the water until it flushes. */
  drop(t) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.toilet = t; this.sink = 0;
    this.scene.add(this.model);
    this.model.position.copy(t.flush.pool.getWorldPosition(new THREE.Vector3())).y += this.model.scale.x * 0.4;
    this.model.visible = true;
    sfx.splat(this.model.position.clone());
  }

  update(dt) {
    const t = this.toilet;
    if (!t || !this.model.visible) return;
    const f = t.flush;
    if (this.sink === 0 && f.t < 1) this.sink = 0.001; // the flush has started: it swirls away
    if (this.sink > 0) {
      this.sink += dt;
      const k = Math.min(1, this.sink / C.swirl), pool = f.pool.getWorldPosition(new THREE.Vector3());
      const a = this.sink * 9, r = 0.04 * (1 - k);
      this.model.position.set(pool.x + Math.cos(a) * r, pool.y + this.model.scale.x * 0.4 - 0.06 * k, pool.z + Math.sin(a) * r);
      this.model.scale.setScalar(Math.max(0.001, this.model.scale.x * (1 - dt * 1.2)));
      if (k >= 1) { this.hide(); this.pack.onThrown?.(this.sheets); }
    }
  }
}

/** One holder with its roll beside toilet `t` (a toilet.js Toilet). */
class Holder {
  constructor(pack, t) {
    const g = new THREE.Group();
    g.position.copy(t.object.position);
    g.rotation.y = t.object.rotation.y; // the toilet's frame: x along the wall, z out of it, y up from its floor
    const s = C.side, out = C.wall; // the plate's middle along the wall, its back on the tiles
    const R = C.roll, ax = s + C.dir * (C.rod / 2 + 0.01), az = out + C.arm; // the roll's axis
    const plate = mesh(new THREE.CylinderGeometry(C.plate, C.plate, 0.007, 24), steel);
    plate.rotation.x = Math.PI / 2; plate.position.set(s, C.y, out + 0.0035);
    const post = mesh(new THREE.CylinderGeometry(0.006, 0.006, C.arm, 12), steel);
    post.rotation.x = Math.PI / 2; post.position.set(s, C.y, out + C.arm / 2);
    const rod = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, C.rod, 12), steel); // along x, open at the far end
    rod.rotation.z = Math.PI / 2; rod.position.set(s + C.dir * C.rod / 2, C.y, az);
    const knuckle = mesh(new THREE.SphereGeometry(0.0075, 12, 8), steel);
    knuckle.position.set(s, C.y, az);
    const tip = mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.006, 12), steel); // a flat end against the roll sliding off
    tip.rotation.z = Math.PI / 2; tip.position.set(s + C.dir * (C.rod - 0.003), C.y, az);
    g.add(plate, post, rod, knuckle, tip);
    // the roll: a paper cylinder (scaled to the paper left), the cardboard core and its hole at both ends
    this.spin = new THREE.Group();
    this.spin.position.set(ax, C.y, az);
    this.paper = mesh(new THREE.CylinderGeometry(1, 1, R.w, 32), rollPaper);
    this.paper.rotation.z = Math.PI / 2;
    this.spin.add(this.paper);
    for (const e of [-1, 1]) {
      const ring = mesh(new THREE.RingGeometry(R.core - 0.003, R.core, 24), card);
      ring.rotation.y = e * Math.PI / 2; ring.position.x = e * (R.w / 2 + 0.0006);
      const dark = mesh(new THREE.CircleGeometry(R.core - 0.003, 24), hole);
      dark.rotation.y = e * Math.PI / 2; dark.position.x = e * (R.w / 2 + 0.0004);
      this.spin.add(ring, dark);
    }
    g.add(this.spin);
    // the strip hanging from the roll's front: a plane from its top down `len`, the perforation every sheet
    this.stripMap = paperMap.clone();
    this.stripMat = paper.clone();
    this.stripMat.map = this.stripMap;
    this.stripMat.side = THREE.DoubleSide;
    this.strip = mesh(new THREE.PlaneGeometry(R.w - 0.002, 1).translate(0, -0.5, 0), this.stripMat);
    this.strip.position.x = ax;
    g.add(this.strip);
    // E boxes: the roll (and the holder round it), the strip
    const rollPick = new THREE.Mesh(new THREE.BoxGeometry(R.w + 0.03, 2 * R.r + 0.03, 2 * R.r + 0.04), new THREE.MeshBasicMaterial());
    rollPick.position.set(ax, C.y, az + 0.01);
    this.stripPick = new THREE.Mesh(new THREE.BoxGeometry(R.w + 0.01, 1, 0.04).translate(0, -0.5, 0), new THREE.MeshBasicMaterial());
    this.stripPick.position.x = ax;
    for (const p of [rollPick, this.stripPick]) { p.visible = false; g.add(p); }
    pack.scene.add(g);
    Object.assign(this, { pack, toilet: t, object: g, az, anim: 0, from: 0, to: 0 });
    const self = this;
    this.rollTarget = { kind: 'holdable', pickable: rollPick,
      get name() { return self.left > 0 ? 'toapappret' : 'den tomma rullen'; },
      verb: 'dra ut',
      get blocked() { return !!heldItem() || self.left <= 0 || self.hang >= C.hang; },
      get blockedText() { return heldItem() ? pack.busyText() : self.left <= 0 ? 'Rullen är slut' : 'Riv av pappret först'; },
      toggle: () => this.pull() };
    this.stripTarget = { kind: 'holdable', name: 'pappret', verb: 'riv av', pickable: this.stripPick,
      get blocked() { return !!heldItem(); }, get blockedText() { return pack.busyText(); }, toggle: () => this.tear() };
    rollPick.userData.door = this.rollTarget;
    this.stripPick.traverse((o) => { o.userData.door = this.stripTarget; });
    this.reset();
  }

  /** Sheets hanging (beyond the tail). */
  get hang() { return Math.round((this.to - C.tail) / C.sheet); }

  reset() {
    this.left = C.sheets;
    this.len = this.from = this.to = C.tail;
    this.anim = 0;
    this.shape();
  }

  /** The roll's radius for the paper left, the strip from its front down `len`. */
  shape() {
    const R = C.roll, r = R.core + (R.r - R.core) * Math.sqrt(this.left / C.sheets);
    this.r = r;
    this.paper.scale.set(r, 1, r); // (turned: its x / z are the radius)
    this.paper.visible = this.left > 0;
    this.strip.visible = this.left > 0 || this.len > C.tail + 0.001;
    this.strip.position.set(this.strip.position.x, C.y, this.az + r + 0.0015);
    this.strip.scale.y = this.len;
    this.stripPick.position.set(this.stripPick.position.x, C.y, this.az + r);
    this.stripPick.scale.y = this.len;
    this.stripMap.repeat.set(1, this.len / C.sheet);
    this.stripMap.offset.y = -this.len / C.sheet; // the perforations stay put on the paper as it grows
    this.object.updateMatrixWorld(true); // the E boxes are hit with these (no render needed)
  }

  /** E on the roll: one more sheet out. */
  pull() {
    if (this.left <= 0 || this.hang >= C.hang || heldItem()) return;
    this.left--;
    this.from = this.len; this.to = this.to + C.sheet; this.anim = C.pullTime;
    sfx.paper(this.spin.getWorldPosition(new THREE.Vector3()));
  }

  /** E on the strip: torn off at the perforation by the roll, into the hand crumpled up. */
  tear() {
    const n = this.hang;
    if (n < 1 || heldItem()) return;
    this.len = this.from = this.to = C.tail; this.anim = 0;
    this.shape();
    sfx.crumple(this.spin.getWorldPosition(new THREE.Vector3()));
    this.pack.wad.take(n);
  }

  /** The E targets now: the roll, and the strip once something hangs from it. */
  targets() { return this.hang >= 1 && this.anim <= 0 ? [this.rollTarget, this.stripTarget] : [this.rollTarget]; }

  update(dt) {
    if (this.anim <= 0) return;
    this.anim = Math.max(0, this.anim - dt);
    const k = 1 - this.anim / C.pullTime, e = k * k * (3 - 2 * k), was = this.len;
    this.len = this.from + (this.to - this.from) * e;
    this.spin.rotation.x += (this.len - was) / this.r; // paper off the front: the roll turns (about its axis, x)
    this.shape();
  }
}

/** The holders beside every toilet in world.lids, and the wad in the hand. */
export class ToiletPaper {
  constructor(scene, camera, world) {
    Object.assign(this, { scene, camera });
    this.wad = new Wad(this);
    const toilets = world.lids.filter((l) => l.kind === 'lid' && l.flush);
    this.holders = toilets.map((t) => new Holder(this, t));
    this.byTarget = new Map();
    for (const t of toilets) { this.byTarget.set(t, t); this.byTarget.set(t.flush, t); }
  }

  /** Blocked by something in the hand: the wad has to go in a toilet (it can't be put down). */
  busyText() { return heldItem() === this.wad ? 'Släng pappret i toaletten först' : undefined; }

  /** The E targets' pickables (the rolls, the strips hanging). */
  targets() { return this.holders.flatMap((h) => h.targets().map((t) => t.pickable)); }

  /** Holding the wad, aimed at a toilet (its bowl / lid or the flush button): throw it in instead. */
  aim(focused) {
    if (heldItem() !== this.wad) return null;
    const t = focused && this.byTarget.get(focused);
    return t ? { name: 'pappret i toaletten', kind: 'holdable', verb: 'släng', toggle: () => this.throwIn(t) } : null;
  }

  /** Into the toilet and flushed (the lid opens first if it is down). */
  throwIn(t) {
    if (heldItem() !== this.wad) return;
    if (!t.isOpen) { t.toggle(); sfx.lid(t.object.position, true); }
    this.wad.drop(t);
    if (t.flush.toggle()) this.onFlush?.(t.flush);
  }

  /** F / a fresh start: full rolls, a short tail each, the wad gone. */
  reset() {
    this.wad.hide();
    for (const h of this.holders) h.reset();
  }

  update(dt) {
    for (const h of this.holders) h.update(dt);
    this.wad.update(dt);
  }
}

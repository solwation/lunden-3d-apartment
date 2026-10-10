import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FRUIT as C } from './config.js';
import { sfx } from './audio.js';
import { heldItem, setHeld, handBusy } from './holdable.js';
import { roomEnv } from './lights.js';

// The fruit bowl on the coffee table (#326): a Dorre wire bowl in polished copper (docs/fruktskal-dorre-koppar.jpg) —
// a flat band round the top, zig-zag wires hanging from it in square-wave steps down to a base wheel — full of fruit.
// The wires are thin tubes merged into one mesh (one draw call). Each piece of fruit is its own mesh (vertex colours, one
// shared material) and a holdable like the fish finger (#162): E takes it straight into the hand, a click / "Ät" takes a
// bite (a scoop out of it in the flesh colour, sfx.chew; an orange or a banana is peeled with the first), and after
// FRUIT.bites[kind] it is eaten. E on a table top / the floor puts it down, E on the bowl puts it back in its own spot.
// F (the bare flat) puts every piece back in the bowl, whole. The cat ignores fruit.

const fruitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42 });
const NAMES = { apple: 'äpplet', pear: 'päronet', orange: 'apelsinen', clementine: 'clementinen', banana: 'bananen' };
const FLESH = { apple: 0xf3e6b8, pear: 0xf1eabf, orange: 0xf29a2e, clementine: 0xf4a33a, banana: 0xf4ecc4 };
const PEELED = { orange: 0xf0a040, banana: 0xf3ebc6 }; // what shows after the first bite peeled it
const tmp = new THREE.Color(), tmp2 = new THREE.Color();

/** A seeded little random, so the same piece looks the same every visit. */
function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

/** Paint every vertex of `geo` with `fn(position, color)`. */
function paint(geo, fn) {
  const p = geo.attributes.position, cols = new Float32Array(p.count * 3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(v.fromBufferAttribute(p, i), c); cols.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}
const solid = (geo, hex) => paint(geo, (v, c) => c.setHex(hex));
const flat = (geo) => { geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); return geo; }; // indexed, normals made after the merge

function stalk(len, r, x, y, z, lean) {
  return solid(flat(new THREE.CylinderGeometry(r * 0.7, r, len, 5).translate(0, len / 2, 0).rotateZ(lean).translate(x, y, z)), 0x4b3520);
}
function leaf(len, x, y, z, turn) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(len * 0.5, len * 0.32, len, 0); s.quadraticCurveTo(len * 0.5, -len * 0.32, 0, 0);
  return solid(flat(new THREE.ShapeGeometry(s, 4).rotateX(-Math.PI / 2 + 0.5).rotateY(turn).translate(x, y, z)), 0x3f7a2a);
}

/** A round fruit turned on a lathe from a profile [(r, y)] (bottom → top), coloured by `colour(v, c)`. */
function lathe(profile, colour, segs = 22) {
  const geo = flat(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs));
  return paint(geo, colour);
}

/** Build one piece: { geo, mid (its middle, local), r (its radius about mid), tip? (banana) }. Origin at the bottom. */
function fruitGeometry(spec, seed) {
  const rand = rng(seed + 1);
  const n = 16;
  if (spec.kind === 'apple') {
    const R = 0.037 + rand() * 0.004, H = R * 1.8;
    const prof = [...Array(n + 1)].map((_, i) => {
      const a = (i / n) * Math.PI;
      let r = R * Math.sin(a) * (1 + 0.1 * -Math.cos(a)), y = H / 2 * (1 - Math.cos(a));
      if (i === 0) { r = 0.0001; y = H * 0.06; } // dimples at the ends
      if (i === n) { r = 0.0001; y = H * 0.86; }
      return [r, y];
    });
    const base = new THREE.Color(spec.color), alt = new THREE.Color(spec.color === 0x8fbf3a ? 0xd8cf55 : 0xe0b23a);
    const body = lathe(prof, (v, c) => {
      const k = 0.5 + 0.5 * Math.sin(Math.atan2(v.z, v.x) * 7 + v.y * 90) * 0.4 + (rand() - 0.5) * 0.25; // streaks
      c.copy(base).lerp(alt, Math.max(0, Math.min(1, (k - 0.35) * (0.5 + v.y / H)))).multiplyScalar(0.9 + rand() * 0.15);
    });
    const parts = [body, stalk(0.018, 0.0018, 0, H * 0.84, 0, 0.25)];
    if (rand() < 0.6) parts.push(leaf(0.03, 0.002, H * 0.9, 0, rand() * 6));
    return { geo: mergeGeometries(parts), mid: new THREE.Vector3(0, H / 2, 0), r: R, H };
  }
  if (spec.kind === 'pear') {
    const H = 0.105;
    const prof = [...Array(n + 1)].map((_, i) => {
      const t = i / n, y = t * H;
      let r = t < 0.42 ? 0.036 * Math.sin(Math.min(1, t / 0.42) * Math.PI / 2 + 0.0001) ** 0.6 // the bulb
        : 0.036 - (0.036 - 0.016) * Math.sin(((t - 0.42) / 0.58) * Math.PI / 2) ** 1.2; // the neck
      if (t > 0.92) r *= (1 - t) / 0.08 * 0.9 + 0.1;
      if (i === 0) r = 0.0001;
      if (i === n) r = 0.0001;
      return [r, y];
    });
    const base = new THREE.Color(0xb7bf3c), blush = new THREE.Color(0xc9893a);
    const body = lathe(prof, (v, c) => c.copy(base).lerp(blush, Math.max(0, 0.6 * Math.sin(Math.atan2(v.z, v.x)) - 0.1) + rand() * 0.15).multiplyScalar(0.92 + rand() * 0.12));
    return { geo: mergeGeometries([body, stalk(0.022, 0.0019, 0, H - 0.002, 0, -0.35)]), mid: new THREE.Vector3(0, 0.035, 0), r: 0.036, H };
  }
  if (spec.kind === 'orange' || spec.kind === 'clementine') {
    const R = spec.kind === 'orange' ? 0.04 : 0.031, sq = spec.kind === 'orange' ? 0.95 : 0.84;
    const geo = flat(new THREE.SphereGeometry(R, 22, 16).scale(1, sq, 1).translate(0, R * sq, 0));
    const base = new THREE.Color(spec.kind === 'orange' ? 0xf07f12 : 0xf2700f);
    paint(geo, (v, c) => {
      c.copy(base).multiplyScalar(0.9 + rand() * 0.16); // a pitted peel
      if (v.y > R * sq * 1.9) c.lerp(tmp.setHex(0x6d7a2a), 0.7); // the stalk end
    });
    return { geo, mid: new THREE.Vector3(0, R * sq, 0), r: R, H: 2 * R * sq };
  }
  // a banana: a five-sided tube along a curve lying on its side (in the x-z plane), tapering to a dark tip and a stalk
  const L = 0.19, bend = 0.035, segs = 18, sides = 10;
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-L / 2, 0, 0), new THREE.Vector3(0, 0, bend * 2), new THREE.Vector3(L / 2, 0, 0));
  const pos = [], col = [], idx = [];
  const yellow = new THREE.Color(0xf2cf3a), green = new THREE.Color(0xa9b83a), brown = new THREE.Color(0x4a3418);
  const radius = (t) => 0.017 * Math.min(1, Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.45 * 1.1) + 0.0035;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPoint(t), tan = curve.getTangent(t), side = new THREE.Vector3(-tan.z, 0, tan.x);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2, ridge = 1 - 0.07 * Math.abs(Math.cos(a * 2.5)); // five flat faces
      const r = radius(t) * ridge;
      const v = p.clone().addScaledVector(side, Math.cos(a) * r).add(new THREE.Vector3(0, Math.sin(a) * r, 0));
      pos.push(v.x, v.y, v.z);
      tmp.copy(yellow).lerp(green, Math.max(0, 0.25 - t) * 2.4).multiplyScalar(0.92 + rand() * 0.1);
      if (rand() < 0.06) tmp.lerp(brown, 0.5); // a freckle
      if (t > 0.95 || t < 0.04) tmp.copy(brown);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const body = g;
  const stem = stalk(0.022, 0.004, 0, 0, 0, 0);
  stem.rotateZ(Math.PI / 2 + 0.25).translate(-L / 2 + 0.002, 0, 0);
  const geo = mergeGeometries([body, stem]);
  geo.translate(0, 0.0205, 0); // lying on its side: the bottom at y 0
  return { geo, mid: curve.getPoint(0.5).add(new THREE.Vector3(0, 0.0205, 0)), r: 0.02, H: 0.04, curve };
}

/** One piece of fruit in the bowl. */
export class Fruit {
  constructor(bowl, spec, i) {
    Object.assign(this, { bowl, spec, kind: spec.kind, slot: i, scene: bowl.scene, camera: bowl.camera, isFruit: true,
      name: NAMES[spec.kind], placeVerb: 'lägga ner', held: false, state: 'bowl', bites: 0, bite: 0, peeled: false, scoops: [] });
    const f = fruitGeometry(spec, i);
    Object.assign(this, { mid: f.mid, radius: f.r, curve: f.curve });
    f.geo.userData.keepCpu = true; // reshape() rewrites its arrays (#628: never freed on phones)
    f.geo.computeVertexNormals();
    this.base = { pos: f.geo.attributes.position.array.slice(), col: f.geo.attributes.color.array.slice() };
    this.model = new THREE.Mesh(f.geo, fruitMat);
    this.model.castShadow = true;
    this.model.userData.noCat = true;
    this.handCurl = this.kind === 'banana' ? 0.9 : 0.7;
    const self = this;
    this.target = { kind: 'holdable', verb: 'ta', pickable: this.model, item: this, get name() { return self.name; },
      get blocked() { return handBusy(self); }, toggle: () => this.take() };
    this.model.userData.door = this.target;
    this.home();
  }

  /** Back in its spot in the bowl. */
  home() {
    const s = this.spec;
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'bowl';
    this.bowl.group.add(this.model);
    this.model.visible = true;
    this.model.position.set(s.x, s.y + C.wire * 2, s.z);
    this.model.rotation.set(s.kind === 'banana' ? s.tilt : 0, s.turn, s.kind === 'banana' ? 0 : s.tilt, 'YXZ');
  }

  /** Whole again (F). */
  restore() {
    this.bites = 0; this.bite = 0; this.peeled = false; this.scoops = [];
    this.reshape();
  }

  /** Rebuild the shape from the whole one: peeled (a little smaller, flesh-coloured), then every bite scooped out. */
  reshape() {
    const geo = this.model.geometry, P = geo.attributes.position, Co = geo.attributes.color;
    P.array.set(this.base.pos); Co.array.set(this.base.col);
    const v = new THREE.Vector3(), d = new THREE.Vector3();
    const peel = this.peeled ? tmp2.setHex(PEELED[this.kind]) : null, flesh = new THREE.Color(FLESH[this.kind]);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      let bitten = false;
      if (peel) {
        if (this.kind === 'banana') { // thinner: towards the curve's middle line (lying on its side, y = the line's height)
          v.y = 0.0205 + (v.y - 0.0205) * 0.82; v.z = v.z * 0.92;
        } else v.sub(this.mid).multiplyScalar(0.9).add(this.mid);
        if (this.base.col[i * 3] > 0.2) Co.setXYZ(i, peel.r * (0.94 + 0.06 * Math.sin(i)), peel.g, peel.b); // (not the stalk)
      }
      for (const s of this.scoops) {
        if (s.n) { // a banana: bitten off straight across, the end flat
          const k = d.subVectors(v, s.c).dot(s.n);
          if (k > 0) { v.addScaledVector(s.n, -k); bitten = true; }
          continue;
        }
        d.subVectors(v, s.c);
        const l = d.length();
        if (l < s.R) { v.copy(s.c).addScaledVector(l > 1e-6 ? d.divideScalar(l) : d.set(0, -1, 0), s.R); bitten = true; }
      }
      if (bitten) Co.setXYZ(i, flesh.r, flesh.g, flesh.b);
      P.setXYZ(i, v.x, v.y, v.z);
    }
    P.needsUpdate = Co.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere(); geo.computeBoundingBox();
  }

  /** A bite: the first peels an orange / a banana, the others scoop out of it on the side facing the mouth. */
  biteOff() {
    this.bites++;
    if ((this.kind === 'orange' || this.kind === 'banana') && !this.peeled) { this.peeled = true; this.reshape(); return; }
    if (this.kind === 'banana') { // from the tip in, a fifth of it at a time
      const t = 1 - 0.2 * (this.scoops.length + 1);
      this.scoops.push({ c: this.curve.getPoint(t).add(new THREE.Vector3(0, 0.0205, 0)), n: this.curve.getTangent(t) });
    } else {
      this.model.updateMatrixWorld(true);
      const eye = this.model.worldToLocal(this.camera.getWorldPosition(new THREE.Vector3()));
      const dir = eye.sub(this.mid); dir.y *= 0.3; dir.normalize();
      const R = this.radius * 0.62;
      this.scoops.push({ c: this.mid.clone().addScaledVector(dir, this.radius * 0.95 + R - this.radius * 0.38), R });
    }
    this.reshape();
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

  pose(k) { // k 0 = in the hand … 1 = at the mouth; each bite turns it a little to a fresh side
    const H = C.held, turn = this.bites * 1.3;
    this.model.position.set(H.x - 0.11 * k, H.y - 0.01 + 0.1 * k, H.z + 0.16 * k);
    if (this.kind === 'banana') this.model.rotation.set(0.2, 1.2 + 0.4 * k, -0.9 - 0.3 * k, 'YXZ');
    else this.model.rotation.set(0.15 - 0.2 * k, 0.4 + turn + 0.4 * k, 0.1, 'YXZ');
  }

  /** Put it down on a table top / the floor at world point p, a random turn. */
  placeAt(p, yaw = Math.random() * Math.PI * 2) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'placed';
    this.scene.add(this.model);
    this.model.visible = true;
    this.poseAt(this.model, p, yaw);
    sfx.click(this.model.position);
  }
  /** Lying at `p` turned `yaw` (the model or main.js's ghost, #368). */
  poseAt(obj, p, yaw = 0) { obj.rotation.set(0, yaw, 0); obj.position.set(p.x, p.y + 0.001, p.z); }

  /** Something else was taken / F: back in the bowl. */
  putBack() { if (this.held) this.home(); }

  get useLabel() { return this.held ? 'Ät' : null; }
  use() {
    if (!this.held || this.bite > 0) return;
    this.bite = 1;
    sfx.chew(this.model.getWorldPosition(new THREE.Vector3()), this.kind === 'apple' || this.kind === 'pear' ? 1.3 : 0.6); // an apple crunches
  }

  update(dt) {
    if (!this.held || this.bite <= 0) return;
    const before = this.bite;
    this.bite = Math.max(0, this.bite - dt * 2.5);
    if (before > 0.5 && this.bite <= 0.5) { // at the mouth: the bite comes off
      this.biteOff();
      if (this.bites >= C.bites[this.kind]) { this.bowl.eaten(this); return; }
    }
    this.pose(Math.sin(this.bite * Math.PI));
  }
}

/** The copper wire bowl: the band, the zig-zag wires, the base wheel; one merged mesh. Origin at its base centre. */
function bowlGeometry() {
  const { r, bottom: rb, h, band, hooks, spokes, wire } = C;
  const H = h / Math.sqrt(1 - (rb / r) ** 2), phi0 = Math.asin(rb / r); // an elliptic profile: r at the top, rb at y 0
  const at = (theta, phi, out = 0) => { // a point on the bowl's skin: theta round, phi from phi0 (bottom) to π/2 (top)
    const rad = r * Math.sin(phi) + out;
    return new THREE.Vector3(Math.cos(theta) * rad, h - H * Math.cos(phi) + wire, Math.sin(theta) * rad);
  };
  const geos = [];
  const rod = (a, b) => {
    const len = a.distanceTo(b);
    if (len < 1e-5) return;
    const g = new THREE.CylinderGeometry(wire, wire, len, 5, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate(a.x, a.y, a.z);
    geos.push(g.deleteAttribute('uv'));
  };
  const line = (pts) => { for (let i = 1; i < pts.length; i++) rod(pts[i - 1], pts[i]); };
  const ring = (rad, y, n = 48) => line([...Array(n + 1)].map((_, i) => new THREE.Vector3(Math.cos(i / n * Math.PI * 2) * rad, y, Math.sin(i / n * Math.PI * 2) * rad)));
  // the band: a flat strip round the top (both faces), a rolled edge top and bottom
  const strip = new THREE.CylinderGeometry(r + 0.002, r + 0.002, band, 64, 1, true).translate(0, h + wire - band / 2 + 0.004, 0);
  geos.push(strip.deleteAttribute('uv'));
  ring(r + 0.002, h + wire + 0.004, 64); ring(r + 0.002, h + wire + 0.004 - band, 64);
  // the zig-zag wires: a hook over the band, then down in square-wave steps to the base ring
  const steps = 7, dphi = (Math.PI / 2 - phi0) / steps;
  for (let k = 0; k < hooks; k++) {
    const th = (k / hooks) * Math.PI * 2;
    const pts = [], o = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    pts.push(o.clone().multiplyScalar(r - 0.003).setY(h + wire - 0.002), o.clone().multiplyScalar(r - 0.003).setY(h + wire + 0.006),
      o.clone().multiplyScalar(r + 0.006).setY(h + wire + 0.006), o.clone().multiplyScalar(r + 0.006).setY(h + wire - band + 0.002));
    let theta = th, phi = Math.PI / 2 - band / H * 0.9;
    pts.push(at(theta, phi, 0.002));
    for (let s = 0; s < steps; s++) {
      const next = Math.max(phi0, phi - dphi * (s === steps - 1 ? 2 : 1));
      pts.push(at(theta, next, 0.002));
      phi = next;
      if (phi <= phi0 + 1e-6) break;
      const rad = r * Math.sin(phi), side = (s % 4 < 2 ? 1 : -1) * 0.022 / rad; // a step aside, two one way, two back
      theta += side;
      pts.push(at(theta, phi, 0.002));
    }
    line(pts);
  }
  // the base wheel: the outer ring, spokes to a small inner ring
  ring(rb, wire, 40);
  ring(0.022, wire, 24);
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    rod(new THREE.Vector3(c * 0.022, wire, s * 0.022), new THREE.Vector3(c * rb, wire, s * rb));
  }
  return mergeGeometries(geos);
}

/** The bowl on the coffee table and its fruit. */
export class FruitBowl {
  constructor(scene, camera) {
    Object.assign(this, { scene, camera, eatenCount: 0 });
    this.group = new THREE.Group();
    this.carryable = { model: this.group }; // bowl and fruit still inside travel as one (#475)
    this.group.position.set(C.x, C.y, C.z);
    const copper = new THREE.MeshStandardMaterial({ color: C.copper, metalness: 0.9, roughness: 0.22, envMap: roomEnv(), side: THREE.DoubleSide });
    this.wires = new THREE.Mesh(bowlGeometry(), copper);
    this.wires.userData.noCat = true;
    this.group.add(this.wires);
    scene.add(this.group);
    this.fruit = C.pieces.map((s, i) => new Fruit(this, s, i));
    // E on the bowl with fruit in the hand: back in its spot; with anything else: not in the bowl
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(C.r + 0.01, C.bottom + 0.01, C.h + 0.05, 16).translate(0, (C.h + 0.05) / 2, 0), new THREE.MeshBasicMaterial());
    pick.visible = false;
    this.group.add(pick);
    const bowl = this;
    this.target = { kind: 'holdable', pickable: pick,
      get name() { return heldItem()?.isFruit ? `${heldItem().name} i fruktskålen` : 'fruktskålen'; },
      verb: 'lägga tillbaka',
      get blocked() { return !heldItem()?.isFruit; },
      blockedText: 'Inte i fruktskålen',
      toggle: () => { const f = heldItem(); if (f?.isFruit) { f.home(); sfx.click(f.model.getWorldPosition(new THREE.Vector3())); } } };
    pick.userData.door = this.target;
  }

  /** E targets now: the fruit in the bowl or lying out, and the bowl itself while something is in the hand. */
  targets() {
    const t = this.fruit.filter((f) => f.state === 'bowl' || f.state === 'placed').map((f) => f.model);
    if (heldItem()) t.push(this.target.pickable);
    return t;
  }

  eaten(f) {
    f.held = false;
    if (heldItem() === f) setHeld(null);
    f.state = 'eaten';
    this.scene.add(f.model);
    f.model.visible = false;
    this.eatenCount++;
    this.onEaten?.(f);
  }

  /** F / a fresh start: every piece back in the bowl, whole. */
  reset() { for (const f of this.fruit) { f.restore(); f.home(); } }

  get placed() { return this.fruit.filter((f) => f.state === 'placed'); }
  get inBowl() { return this.fruit.filter((f) => f.state === 'bowl'); }

  update(dt) { for (const f of this.fruit) f.update(dt); }
}

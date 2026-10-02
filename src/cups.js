import * as THREE from 'three';
import { CUPS as C } from './config.js';
import { sfx } from './audio.js';
import { heldItem, setHeld, handBusy, Holdable } from './holdable.js';

// Coffee cups (#90, #141). Three mugs in the wall cabinet over the Moccamaster: E on one (the cabinet open)
// takes it into the hand, brewed or not. A cup is put down with E on a table top / the worktop / the floor and
// taken again with E; E on the open cabinet while holding one puts it back on its shelf. The glass jug is a
// thing of its own (Jug, a Holdable): E takes it off the hot plate, and with it in the hand E on a cup that
// stands somewhere pours (the jug's level drops by CUPS.pour per cup); E on the hot plate puts it back.
// Brewing only fills the jug while it stands there (coffee.js). One held thing at a time (holdable.js).

const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.6 });

const OPEN_DEG = 88; // just short of flat against the tall unit's side (#116)

/** The cup cabinet: a hollow carcass with a shelf and a side-hinged door (a world.lids appliance). */
export function cupCabinet(c) {
  const g = new THREE.Group();
  const w = 0.016, depth = c.back - c.front, zc = (c.z0 + c.z1) / 2, yc = (c.y0 + c.y1) / 2, H = c.y1 - c.y0, W = c.z1 - c.z0;
  const b = (sx, sy, sz, x, y, z, m = white) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  b(depth, w, W, c.front + depth / 2, c.y0 + w / 2, zc); b(depth, w, W, c.front + depth / 2, c.y1 - w / 2, zc);
  b(depth, H, w, c.front + depth / 2, yc, c.z0 + w / 2); b(depth, H, w, c.front + depth / 2, yc, c.z1 - w / 2);
  b(w, H, W, c.back - w / 2, yc, zc);
  b(depth - 0.03, 0.014, W - 0.03, c.front + depth / 2 + 0.01, c.y0 + H * 0.5, zc); // shelf
  // the door: front + a raised shaker frame, a black handle at the free (south) edge, hinged at z0 next to
  // the tall oven unit, which stands 25 cm proud of the wall cabinets. Like a real cabinet hinge the pivot
  // sits at the door's outer face (P in front of the carcass, the handle's depth), so the door swings clear
  // of the carcass and stops flat against the tall unit's side at OPEN_DEG (#116)
  const P = 0.045;
  const door = new THREE.Group();
  door.position.set(c.front - P, c.y0, c.z0);
  const add = (sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x + P, y, z); o.castShadow = true; door.add(o); };
  add(0.02, H - 0.003, W - 0.003, -0.01, H / 2, W / 2, c.material);
  for (const [sy, sz, y, z] of [[H - 0.01, 0.06, H / 2, 0.035], [H - 0.01, 0.06, H / 2, W - 0.035], [0.06, W - 0.01, 0.035, W / 2], [0.06, W - 0.01, H - 0.035, W / 2]]) add(0.008, sy, sz, -0.024, y, z, c.material);
  add(0.02, 0.12, 0.012, -0.035, 0.1, W - 0.04, c.handle);
  const cab = {
    name: 'skåpet', kind: 'appliance', isOpen: false, z0: c.z0, width: W, t: 0, object: door, pickable: door, door, hinge: 'side', lamp: { emissiveIntensity: 0 },
    get verb() { return this.isOpen && heldItem()?.isCup ? 'ställa tillbaka koppen i' : this.isOpen ? 'stänga' : 'öppna'; },
    toggle() {
      if (this.isOpen && heldItem()?.isCup) { heldItem().goHome(); return; } // the held cup back on its shelf (#141)
      this.isOpen = !this.isOpen; sfx.click(door.getWorldPosition(new THREE.Vector3()));
    },
    update(dt) {
      const target = this.isOpen ? 1 : 0;
      this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 2.5);
      door.rotation.y = -this.t * this.t * (3 - 2 * this.t) * THREE.MathUtils.degToRad(OPEN_DEG);
    },
  };
  door.traverse((m) => { m.userData.door = cab; });
  g.add(door);
  return { object: g, cab, shelfY: c.y0 + w, x: c.front + depth / 2, zc };
}

function mugModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(C.r, C.r * 0.92, C.h, 20, 1, true), new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.3, side: THREE.DoubleSide }));
  body.position.y = C.h / 2;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(C.r * 0.92, 20).rotateX(-Math.PI / 2), body.material);
  bottom.position.y = 0.004;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 8, 16, Math.PI), body.material);
  handle.rotation.z = -Math.PI / 2; handle.position.set(C.r + 0.002, C.h * 0.55, 0);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(C.r * 0.94, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.coffee, roughness: 0.15 }));
  coffee.visible = false;
  g.add(body, bottom, handle, coffee);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { g, coffee };
}

export class Cup {
  constructor(scene, camera, homePos, counter) {
    const { g, coffee } = mugModel();
    Object.assign(this, { name: 'koppen', placeVerb: 'ställa ner', isCup: true, scene, camera, model: g, coffee, counter, home: homePos.clone(),
      state: 'cabinet', fill: 0, pouring: 0, held: false, steamT: 0 });
    const cup = this;
    this.target = { name: 'koppen', kind: 'cup', pickable: g, cup: this, item: this, get verb() { return cup.verb; },
      get blocked() { return cup.blocked; }, toggle: () => this.press() };
    g.traverse((m) => { m.userData.door = this.target; });
    scene.add(g);
    g.position.copy(homePos);
    this.steam = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.steam.position.y = C.h + 0.08;
    g.add(this.steam);
  }

  /** The jug in the hand, if that is what you hold. */
  get jug() { const h = heldItem(); return h?.isJug ? h : null; }
  /** Pouring is possible: the jug in the hand and the cup standing out (not in the cabinet, not in the hand). */
  get pourable() { return !!this.jug && this.state === 'placed'; }
  get blocked() { return this.pourable ? this.fill >= 0.99 : handBusy(this); }
  get verb() {
    if (this.pourable) return this.jug.fill > 0.05 ? 'hälla kaffe i' : 'koka kaffe först, sedan hälla i';
    return 'ta';
  }

  setFill(f) {
    this.fill = f;
    this.coffee.visible = f > 0.01;
    this.coffee.position.y = 0.006 + (C.h - 0.02) * f;
  }

  press() {
    if (this.pouring > 0) return;
    if (this.pourable) this.pourFrom(this.jug);
    else this.take();
  }

  /** Pour from the held jug (#141): what the jug has, up to a full cup (CUPS.pour of the jug per cup). */
  pourFrom(jug) {
    const want = (1 - this.fill) * C.pour, got = Math.min(want, jug.fill);
    if (got < 0.01) { sfx.click(this.model.getWorldPosition(new THREE.Vector3())); return; }
    this.pouring = 1.2;
    this.pourTo = this.fill + got / C.pour;
    this.pourJug = jug;
    jug.pour(got, 1.2);
    sfx.pour(this.model.getWorldPosition(new THREE.Vector3()));
  }

  take() {
    if (handBusy(this)) return; // put down what you hold first (#102)
    setHeld(this);
    this.held = true;
    this.state = 'held';
    if (!this.camera.parent) this.scene.add(this.camera);
    this.camera.add(this.model);
    this.model.position.set(C.held.x, C.held.y, C.held.z);
    this.model.rotation.set(0.1, -0.5, 0);
    sfx.click(this.model.getWorldPosition(new THREE.Vector3()));
  }

  /** Put it down at a world point on a table top / the floor (`y` = the surface's height), standing. */
  placeAt(p) {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'placed';
    this.scene.add(this.model);
    this.model.position.set(p.x, p.y, p.z);
    this.model.rotation.set(0, Math.random() * 6, 0);
    sfx.click(this.model.position);
  }

  /** Back on its shelf in the cabinet (#141). */
  goHome() {
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.state = 'cabinet';
    this.scene.add(this.model);
    this.model.position.copy(this.home);
    this.model.rotation.set(0, 0, 0);
    sfx.click(this.home);
  }

  /** Another thing was taken: the cup goes down on the worktop. */
  putBack() { if (this.held) this.placeAt(this.counter); }

  /** A click drinks a sip while there is coffee in it (#117). */
  get useLabel() { return this.held && this.fill > 0.01 ? 'Drick' : null; }
  use() {
    if (!this.held || this.fill <= 0.01 || this.sip > 0) return;
    this.sip = 1;
    this.onSip?.();
    sfx.gulp(this.model.getWorldPosition(new THREE.Vector3()));
    this.setFill(this.fill - C.sip < 1e-6 ? 0 : this.fill - C.sip);
  }

  update(dt) {
    if (this.held) { // a sip: up to the mouth, tipped, and down again
      this.sip = Math.max(0, (this.sip ?? 0) - dt * 1.6);
      const k = Math.sin(this.sip * Math.PI);
      this.model.position.set(C.held.x - 0.14 * k, C.held.y + 0.15 * k, C.held.z + 0.16 * k);
      this.model.rotation.set(0.1 + 0.9 * k, -0.5, 0);
    }
    if (this.pouring > 0) {
      const from = this.fill;
      this.pouring -= dt;
      this.setFill(this.pouring > 0 ? Math.min(this.pourTo, from + (this.pourTo - from) * dt / (this.pouring + dt)) : this.pourTo);
    }
    // steam over a full cup, a soft wisp going up
    this.steamT += dt;
    const k = (this.steamT % 2) / 2;
    this.steam.material.opacity = this.fill > 0.5 ? 0.18 * Math.sin(Math.PI * k) : 0;
    this.steam.position.y = C.h + 0.04 + 0.1 * k;
    this.steam.quaternion.copy(this.camera.quaternion).premultiply(this.model.getWorldQuaternion(new THREE.Quaternion()).invert()); // face the camera
  }
}

/** The Moccamaster's glass jug (#141): take it off the hot plate, pour into cups, put it back on the plate. */
export class Jug extends Holdable {
  constructor(scene, camera, mocca) {
    const model = mocca.jug;
    model.updateWorldMatrix(true, false);
    const pos = model.getWorldPosition(new THREE.Vector3()), rot = new THREE.Euler().setFromQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    model.removeFromParent();
    super(scene, camera, {
      name: 'kannan', verb: 'ta', backName: 'kaffebryggarens platta', backVerb: 'ställa tillbaka kannan på', placeVerb: 'ställa ner',
      model, home: { pos, rot },
      heldPose: { pos: new THREE.Vector3(C.jugHeld.x, C.jugHeld.y, C.jugHeld.z), rot: new THREE.Euler(0, -1.4, 0) }, // handle to the right
      pick: { pos: pos.clone().setY(pos.y + 0.09), size: [0.2, 0.2, 0.2] }, cooldown: 0.3, // pouring = E on a cup
    });
    Object.assign(this, { isJug: true, mocca, tilt: 0, tiltT: 0 });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // it stands when put down (holdable.js would lay it on its side)
    mocca.jugHolder = this;
  }

  get fill() { return this.mocca.fill; }
  get atHome() { return !this.held && !this.placed; }

  /** Pour `amount` (of a full jug) over `secs` seconds: the level drops, the jug tips forward meanwhile. */
  pour(amount, secs) {
    this.mocca.setFill(Math.max(0, this.mocca.fill - amount));
    this.tiltT = secs;
  }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); }

  tick(dt) {
    this.tiltT = Math.max(0, this.tiltT - dt);
    const target = this.tiltT > 0 ? 1 : 0;
    this.tilt += (target - this.tilt) * Math.min(1, dt * 8);
    this.model.rotation.set(0, -1.4, -1.1 * this.tilt); // tips its spout towards the cup
  }
}

/** The cabinet, the cups, and the "put it down here" target while a cup is held. */
export function buildCups(scene, camera, world, cabinetBox) {
  const mocca = world.lids.find((l) => l.kind === 'coffee');
  const cab = cupCabinet(cabinetBox);
  scene.add(cab.object);
  world.lids.push(cab.cab);
  const counterY = world.cupSurfaces?.find((s) => s.userData.counter)?.userData.surface ?? cabinetBox.counterY;
  const counter = new THREE.Vector3(C.counter.x, counterY, C.counter.z);
  const cups = [...Array(C.n)].map((_, i) => new Cup(scene, camera, new THREE.Vector3(cab.x - 0.02, cab.shelfY, cab.zc + (i - 1) * 0.11), counter));
  const jug = new Jug(scene, camera, mocca);
  return { cups, jug, cabinet: cab.cab, group: [cab.object, ...cups.map((c) => c.model)], update(dt) { for (const c of cups) c.update(dt); } };
}

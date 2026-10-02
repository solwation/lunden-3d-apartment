import * as THREE from 'three';
import { CUPS as C } from './config.js';
import { sfx } from './audio.js';
import { heldItem, setHeld, handBusy } from './holdable.js';

// Coffee cups (#90). Three mugs in the wall cabinet over the Moccamaster. Once it has brewed:
// E on a cup in the (open) cabinet → it stands on the worktop beside the machine; E again → it fills
// from the jug (the jug level drops); E on the full cup → you hold it (steam rising); E while looking at
// a table top → it is put down there (and can be picked up again). One held thing at a time, shared
// with the toys (holdable.js).

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
    toggle() { this.isOpen = !this.isOpen; sfx.click(door.getWorldPosition(new THREE.Vector3())); },
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
  constructor(scene, camera, homePos, mocca, counter) {
    const { g, coffee } = mugModel();
    Object.assign(this, { name: 'koppen', placeVerb: 'ställa ner', scene, camera, model: g, coffee, mocca, counter, state: 'cabinet', fill: 0, pouring: 0, held: false, steamT: 0 });
    this.target = { name: 'koppen', kind: 'cup', pickable: g, cup: this, item: this, get verb() { return this.cup.verb; },
      get blocked() { return (this.cup.state === 'full' || this.cup.state === 'placed') && handBusy(this.cup); }, toggle: () => this.press() };
    g.traverse((m) => { m.userData.door = this.target; });
    scene.add(g);
    g.position.copy(homePos);
    this.steam = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.steam.position.y = C.h + 0.08;
    g.add(this.steam);
  }

  get brewed() { return this.mocca && this.mocca.done > 0; }
  get verb() {
    if (this.state === 'cabinet') return this.brewed ? 'ta fram' : 'koka kaffe först, sedan ta fram';
    if (this.state === 'empty') return this.mocca.fill > 0.05 ? 'hälla kaffe i' : 'koka mer kaffe, sedan hälla i';
    return 'ta';
  }

  setFill(f) {
    this.fill = f;
    this.coffee.visible = f > 0.01;
    this.coffee.position.y = 0.006 + (C.h - 0.02) * f;
  }

  press() {
    if (this.pouring > 0) return;
    if (this.state === 'cabinet') {
      if (!this.brewed) { sfx.click(this.model.getWorldPosition(new THREE.Vector3())); return; } // "koka kaffe först"
      this.state = 'empty';
      this.model.position.copy(this.counter);
      this.model.rotation.set(0, Math.random() * 6, 0);
      sfx.click(this.counter);
    } else if (this.state === 'empty') {
      if (this.mocca.fill <= 0.05) return;
      this.pouring = 1.2;
      sfx.pour(this.model.getWorldPosition(new THREE.Vector3()));
    } else this.take();
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

  /** Another thing was taken: the cup goes back on the worktop. */
  putBack() { if (this.held) this.placeAt(this.counter); }

  use() {} // nothing to click with a cup

  update(dt) {
    if (this.pouring > 0) {
      this.pouring -= dt;
      this.setFill(Math.min(1, this.fill + dt / 1.2));
      if (this.pouring <= 0) { this.state = 'full'; this.setFill(1); this.mocca.setFill(Math.max(0, this.mocca.fill - C.pour)); }
    }
    // steam over a full cup, a soft wisp going up
    this.steamT += dt;
    const k = (this.steamT % 2) / 2;
    this.steam.material.opacity = this.fill > 0.5 ? 0.18 * Math.sin(Math.PI * k) : 0;
    this.steam.position.y = C.h + 0.04 + 0.1 * k;
    this.steam.quaternion.copy(this.camera.quaternion).premultiply(this.model.getWorldQuaternion(new THREE.Quaternion()).invert()); // face the camera
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
  const cups = [...Array(C.n)].map((_, i) => new Cup(scene, camera, new THREE.Vector3(cab.x - 0.02, cab.shelfY, cab.zc + (i - 1) * 0.11), mocca, counter));
  return { cups, cabinet: cab.cab, group: [cab.object, ...cups.map((c) => c.model)], update(dt) { for (const c of cups) c.update(dt); } };
}

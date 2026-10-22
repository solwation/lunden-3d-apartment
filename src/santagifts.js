import * as THREE from 'three';
import { Holdable, handBusy, stowedItem } from './holdable.js';
import { TRINKETS } from './furniture.js';
import { SANTA_GIFTS as C } from './santagiftconfig.js';
import { PLAYER } from './config.js';

const vector = a => new THREE.Vector3(...a);
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);

function wrapping() {
  const model = new THREE.Group();
  const add = (size, color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.65 }));
    mesh.position.y = C.size[1] / 2; mesh.castShadow = true; model.add(mesh);
  };
  add(C.size, 0xae202e);
  add([C.ribbon, C.size[1] + C.floorLift, C.size[2] + C.floorLift], 0xf2c45a);
  add([C.size[0] + C.floorLift, C.size[1] + C.floorLift, C.ribbon], 0xf2c45a);
  return model;
}

class ChristmasGift extends Holdable {
  constructor(owner, id, kind, opened, home) {
    const model = new THREE.Group();
    super(owner.scene, owner.camera, {
      name: 'julklappen', backName: 'julklappens plats', backVerb: 'lägga tillbaka på',
      model, home: { pos: vector(home), rot: new THREE.Euler() },
      heldPose: { pos: vector(C.held), rot: new THREE.Euler(...C.heldRotation) },
      pick: { pos: vector(home), size: C.size },
    });
    this.owner = owner; this.giftId = id; this.giftKind = kind; this.isChristmasGift = true;
    this.rebuild(opened);
  }

  rebuild(opened) {
    // The same Holdable changes model: no hand transfer, duplicate result or paper item.
    if (!this.opened) this.model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    this.model.clear(); this.opened = opened;
    if (opened) TRINKETS[this.giftKind].build(this.model);
    else this.model.add(wrapping());
    this.name = opened ? TRINKETS[this.giftKind].name : 'julklappen';
    this.takeTarget.name = this.name;
    this.useLabel = opened ? null : 'Öppna julklappen';
    this.model.traverse(o => { o.userData.door = this.takeTarget; });
    this.rest = undefined;
    this.model.updateWorldMatrix(true, true);
    this.owner.onChange?.(this); // discard any wrapping-shaped placement preview
  }

  onUse() {
    if (this.opened) return;
    this.rebuild(true);
    this.owner.onMessage?.(`Du fick ${this.name}!`);
  }

  // F / handsfree return to the last real placement, rather than to Santa's temporary model.
  placeAt(p, yaw) {
    super.placeAt(p, yaw);
    this.home.pos.copy(this.model.position); this.home.rot.copy(this.model.rotation);
    this.backTarget.pickable.position.copy(this.home.pos);
  }
}

/** Dynamic ordinary Holdables. onItem registers each item with main's normal targets/update list. */
export class ChristmasGifts {
  constructor(scene, camera, { onItem, onMessage, onChange, floorY, random = Math.random } = {}) {
    Object.assign(this, { scene, camera, onItem, onMessage, onChange, floorY, random, items: [], nextId: 1 });
  }

  create(id, kind, opened, home) {
    const item = new ChristmasGift(this, id, kind, opened, home);
    this.items.push(item); this.nextId = Math.max(this.nextId, id + 1);
    this.onItem?.(item);
    return item;
  }

  give() {
    if (handBusy()) { this.onMessage?.('Lägg ifrån dig det du håller först'); return null; }
    // Choose once at receipt, before any opening or save. Reopening never draws again.
    const sample = this.random();
    const kind = C.pool[Math.max(0, Math.min(C.pool.length - 1, Math.floor((Number.isFinite(sample) ? sample : 0) * C.pool.length)))];
    const p = this.camera.getWorldPosition(new THREE.Vector3());
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    direction.y = 0; direction.normalize(); p.addScaledVector(direction, C.handReach);
    // Safe floor home used only before the visitor has put it down on a surface.
    p.y = (this.floorY?.() ?? p.y - PLAYER.eye) + C.floorLift;
    const item = this.create(this.nextId, kind, false, p.toArray()); item.take();
    return item;
  }

  saveState() {
    return { v: 1, nextId: this.nextId, items: this.items.map(item => ({
      id: item.giftId, kind: item.giftKind, opened: item.opened,
      home: item.home.pos.toArray(), homeRotation: item.home.rot.toArray().slice(0, 3),
      held: item.held || item === stowedItem(),
      p: item.model.getWorldPosition(new THREE.Vector3()).toArray(),
      q: item.model.getWorldQuaternion(new THREE.Quaternion()).toArray(),
      placed: !!item.placed,
    })) };
  }

  loadState(state) {
    if (state?.v !== 1 || !Array.isArray(state.items)) return;
    const seen = new Set();
    for (const e of state.items) {
      if (!e || !Number.isSafeInteger(e.id) || e.id < 1 || seen.has(e.id) || !C.pool.includes(e.kind) ||
          !finite(e.home, 3) || !finite(e.p, 3) || !finite(e.q, 4)) continue;
      seen.add(e.id);
      let item = this.items.find(i => i.giftId === e.id);
      if (item) continue; // restore is idempotent; never recreate an already opened package
      item = this.create(e.id, e.kind, e.opened === true, e.home);
      if (finite(e.homeRotation, 3)) item.home.rot.set(...e.homeRotation);
      item.model.position.set(...e.p); item.model.quaternion.set(...e.q).normalize();
      item.placed = !!e.placed;
      if (e.held && !handBusy()) item.take();
      else if (e.held) item.goHome();
    }
    if (Number.isSafeInteger(state.nextId) && state.nextId > 0) this.nextId = Math.max(this.nextId, state.nextId);
  }
}

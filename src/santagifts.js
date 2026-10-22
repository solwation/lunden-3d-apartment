import * as THREE from 'three';
import { Holdable, handBusy, stowedItem } from './holdable.js';
import { TRINKETS } from './furniture.js';
import { SANTA_GIFTS as C } from './santagiftconfig.js';
import { PLAYER } from './config.js';

const vector = a => new THREE.Vector3(...a);
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const worldYaw = model => {
  model.updateWorldMatrix(true, false);
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
  return Math.atan2(forward.x, forward.z);
};

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

  take() {
    if (handBusy(this)) return;
    if (!this.held) this.owner?.removeSupport(this);
    this.stackSupport = null;
    super.take();
  }

  putBack() {
    if (this.held && !this.opened) {
      // A removed lower parcel returns on top of the settled column, never inside it.
      let support = null, top = -Infinity;
      for (const candidate of this.owner.items) {
        if (!this.owner.canSupport(candidate, this)) continue;
        const bounds = new THREE.Box3().setFromObject(candidate.model), center = bounds.getCenter(new THREE.Vector3());
        if (Math.abs(center.x - this.home.pos.x) > C.stack.tolerance || Math.abs(center.z - this.home.pos.z) > C.stack.tolerance || bounds.max.y <= top) continue;
        support = candidate; top = bounds.max.y;
      }
      if (support) {
        const point = this.home.pos.clone(); point.y = top;
        this.poseAt(this.model, point, worldYaw(support.model));
        this.home.pos.copy(this.model.position); this.home.rot.copy(this.model.rotation);
        this.stackSupport = support.giftId; this.backTarget.pickable.position.copy(this.home.pos);
      }
    }
    super.putBack();
  }

  // F / handsfree return to the last real placement, rather than to Santa's temporary model.
  placeAt(p, yaw) {
    if (!this.held) return;
    const support = this.owner.supportAt(p, this);
    if (support) yaw = worldYaw(support.model);
    super.placeAt(p, yaw);
    this.stackSupport = support?.giftId ?? null;
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

  /** A real top-face ray, snapped to the centre and yaw so the whole equal-sized parcel fits.
   * Main retains distance for normal wall/nearer-object checks; stackSupport skips floor-grid snapping. */
  stackHit(raycaster, item) {
    if (!item?.isChristmasGift || item.opened || !item.held || raycaster.ray.direction.y >= 0) return null;
    let nearest = null;
    for (const support of this.items) {
      if (!this.canSupport(support, item)) continue;
      support.model.updateWorldMatrix(true, true);
      const hit = raycaster.intersectObject(support.model, true).find(h => h.face &&
        h.face.normal.clone().transformDirection(h.object.matrixWorld).y >= C.stack.topNormal);
      if (!hit || (nearest && nearest.distance <= hit.distance)) continue;
      const bounds = new THREE.Box3().setFromObject(support.model);
      support.model.userData.surface = bounds.max.y;
      const point = bounds.getCenter(new THREE.Vector3()); point.y = bounds.max.y;
      nearest = { ...hit, object: support.model, point, stackYaw: worldYaw(support.model), stackSupport: support };
    }
    return nearest;
  }

  canSupport(support, item) {
    if (support === item || support.opened || support.held || support === stowedItem() || support.broken) return false;
    for (let node = support.model; node; node = node.parent) if (!node.visible) return false;
    return !!support.model.parent;
  }

  supportAt(point, item) {
    if (item.opened) return null;
    return this.items.find(support => {
      if (!this.canSupport(support, item)) return false;
      const bounds = new THREE.Box3().setFromObject(support.model), center = bounds.getCenter(new THREE.Vector3());
      return Math.abs(point.y - bounds.max.y) <= C.stack.tolerance &&
        Math.abs(point.x - center.x) <= C.stack.tolerance && Math.abs(point.z - center.z) <= C.stack.tolerance;
    }) ?? null;
  }

  /** Taking a lower parcel lets the remaining column settle onto its former support. */
  removeSupport(item) {
    const children = this.items.filter(h => !h.held && h.stackSupport === item.giftId);
    if (!children.length) return;
    const bounds = new THREE.Box3().setFromObject(item.model), fall = bounds.max.y - bounds.min.y + C.stack.gap;
    const descendants = new Set(children);
    for (const h of descendants) for (const child of this.items) if (!child.held && child.stackSupport === h.giftId) descendants.add(child);
    for (const h of descendants) {
      h.model.position.y -= fall; h.home.pos.y -= fall;
      h.backTarget.pickable.position.copy(h.home.pos); h.model.updateWorldMatrix(true, true);
    }
    for (const child of children) child.stackSupport = item.stackSupport ?? null;
    this.onChange?.(item);
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
      support: item.stackSupport ?? null,
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
      item.stackSupport = Number.isSafeInteger(e.support) && e.support !== e.id ? e.support : null;
      if (e.held && !handBusy()) item.take();
      else if (e.held) item.goHome();
    }
    if (Number.isSafeInteger(state.nextId) && state.nextId > 0) this.nextId = Math.max(this.nextId, state.nextId);
  }
}

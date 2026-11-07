import * as THREE from 'three';
import { SAUSAGE } from './config.js';
import { sfx } from './audio.js';
import { cookRefusal, cookRate, lifeFood } from './cookrules.js';

// #1881 / #1887: the life sim's cooking food (a raw sausage) in the air fryer's basket and on the oven tray (oventray.js), as in
// the pan (eggs.js, #1640) and on the grills (sausages.js, #1124). Each is a life store like the pan's: put in with E, cooked
// while that appliance heats (the air fryer running with the basket in; the tray in the shut, powered oven, #1219), at its
// COOKING rate (src/cookrules.js) on the food's own seconds (SAUSAGE), taken out with E like any life item. Which food may go in
// is the shared rule, not a list per appliance: an egg (raw or cracked) is refused with "Ägg steker man i stekpannan" (#1887,
// eggs.js keeps the pan's egg); `busy(appliance, kind)` (main.js)
// keeps one kind of food per vessel (fish fingers, fries, a caught fish, the chicken). The tray's slots are children of the
// tray, so what lies on it rides along when it is taken out and slid back in.

const TIMES = { sausage: SAUSAGE }; // (#1887: an egg cooks only in the pan, eggs.js)

/** One step of cooking for a life item on appliance `appliance` (shared by the stores here). */
export function cookLifeItem(life, it, dt, appliance, surface) {
  const food = lifeFood(life.items.defs, it.type), C = TIMES[food];
  if (!C) return false;
  const cook = Math.min(C.burnAt + C.seconds, (it.machine.cook ?? 0) + dt * cookRate(food, appliance)), cooked = cook >= C.seconds;
  if (cooked && !it.machine.cooked && it.type === 'sausage') life.emit('sausageGrilled', { item: it, surface });
  if (cook !== it.machine.cook) life.items.set(it, { machine: { cook, cooked } });
  return true;
}

export class CookStores {
  /** fryer: the AirFryer; tray: the OvenTray (oventray.js); busy(appliance, kind) → a reason or null. */
  constructor(life, { fryer, tray, busy = () => null }) {
    Object.assign(this, { life, busy, vessels: [], sizzle: 0 });
    if (fryer) {
      const B = fryer.basket, inD = 0.21;
      this.add({ id: 'fryerBasket', appliance: 'airfryer', name: 'korgen i airfryern', parent: B,
        spots: [-0.055, 0.055].map((x) => [new THREE.Vector3(x, fryer.plateY + 0.002, fryer.frontZ + 0.02 + inD / 2), Math.PI / 2]),
        pick: [new THREE.Vector3(0, fryer.plateY + 0.05, fryer.frontZ + 0.02 + inD / 2), [0.24, 0.1, inD]],
        isOpen: () => fryer.open, shutText: 'Dra ut korgen först', heats: () => fryer.cooking });
    }
    if (tray) { // (the store keeps its #1881 id 'ovenRack', so saved homes find what lay in the oven: now on the tray)
      const r = tray.spot;
      this.add({ id: 'ovenRack', appliance: 'oven', name: 'ugnsplåten', parent: tray.model,
        spots: [-0.09, 0.09].map((dz) => [new THREE.Vector3(r.x, r.y + 0.003, r.z + dz), 0]),
        pick: [new THREE.Vector3(r.x, r.y + 0.06, r.z), [0.36, 0.12, 0.4]],
        isOpen: () => tray.open, shutText: 'Öppna ugnen först', heats: () => tray.cooking });
    }
  }

  /** The first empty slot of vessel `v`, or -1. */
  freeIdx(v) { const I = this.life.items; return v.anchors.findIndex((_, k) => !I.occupant({ at: 'slot', store: v.id, slot: k })); }
  byId(id) { return this.vessels.find((v) => v.id === id) ?? null; }
  /** The vessel of appliance `a` ('airfryer' | 'oven'), or null. */
  of(a) { return this.vessels.find((v) => v.appliance === a) ?? null; }
  /** The life items in appliance `a`. */
  items(a) { const v = this.of(a); return v ? v.items() : []; }

  /** Why `held` may not go into vessel `v` (the shared rule, then one kind of food at a time), or null. */
  why(v, held) {
    const food = lifeFood(this.life.items.defs, held?.type);
    if (!food) return `Det där ska inte i ${v.name}`;
    return cookRefusal(food, v.appliance) ?? this.busy(v.appliance, 'life');
  }

  add(v) {
    const life = this.life, I = life.items;
    const anchors = v.spots.map(([p, yaw]) => { const a = new THREE.Object3D(); a.position.copy(p); a.rotation.y = yaw; v.parent.add(a); return a; });
    I.addStore({ id: v.id, name: v.name, slots: anchors.map(() => ({ size: 's' })), accepts: ['sausage', 'friedEgg'], // (friedEgg: one saved here under #1881 still loads and can be taken out) isOpen: v.isOpen, shutText: v.shutText,
      fullText: `Det får inte plats mer i ${v.name}`, putLabel: (held) => `lägga ${I.name(held)} i ${v.name}` });
    life.anchors.set(v.id, (slot) => anchors[slot] ?? null);
    I.store(v.id).refuse = (held) => this.why(v, held);
    const [at, size] = v.pick, pick = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
    pick.visible = false; pick.position.copy(at);
    const ray = pick.raycast.bind(pick);
    pick.raycast = (r, hits) => { if (v.isOpen() && lifeFood(I.defs, I.held()?.type)) ray(r, hits); }; // only with food that cooks in the hand
    v.parent.add(pick);
    const target = { kind: 'life', name: v.name, store: v.id, pickable: pick };
    target.options = () => life.options(target); target.toggle = () => life.run(target); pick.userData.door = target;
    Object.defineProperties(target, { blocked: { get: () => !target.options().some((a) => !a.reason) }, blockedText: { get: () => target.options()[0]?.reason } });
    (life.storeTargets ??= []).push(target);
    Object.assign(v, { anchors, target, items: () => I.all().filter((it) => it.place.at === 'slot' && it.place.store === v.id) });
    this.vessels.push(v);
  }

  update(dt) {
    let sizzling = null;
    for (const v of this.vessels) {
      if (!v.heats()) continue;
      for (const it of v.items()) if (cookLifeItem(this.life, it, dt, v.appliance, v.id) && v.appliance === 'airfryer') sizzling = v;
    }
    if (sizzling && (this.sizzle -= dt) <= 0) { sfx.sizzle(sizzling.parent.getWorldPosition(new THREE.Vector3())); this.sizzle = 1.1; }
  }
}


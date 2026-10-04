import * as THREE from 'three';
import { LIFE, ITEMS } from './config.js';
import { Items } from './items.js';
import { Holdable, heldItem, setHeld, handBusy } from './holdable.js';
import { buildModel } from './lifemodels.js';
import { sfx } from './audio.js';

const DEFAULT_HELD = { pos: [0.17, -0.22, -0.42], rot: [0.35, -0.6, 0] };
const tmpQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);

/**
 * The view of one item instance (#366): an ordinary Holdable (one thing in the hand, `placeAt`, the hand's grip, E to
 * take), whose model always shows the instance's place and state. The data decides: take / put down move the instance
 * (items.js) and the model follows its place (a worktop, the hand, a store's slot, a carrier's spot).
 */
export class LifeItem extends Holdable {
  constructor(life, item) {
    const def = life.items.def(item), view = buildModel(def), h = def.held ?? DEFAULT_HELD;
    super(life.scene, life.camera, {
      name: def.name, verb: 'ta', backName: def.name, backVerb: 'lägga tillbaka', placeVerb: def.placeVerb ?? 'lägga ner', model: view.object,
      home: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(...h.pos), rot: new THREE.Euler(...h.rot) },
      pick: { pos: new THREE.Vector3(), size: [0.01, 0.01, 0.01] }, cooldown: 0.3,
    });
    this.backTarget.pickable.raycast = () => {}; // (an item goes back into its store / onto a carrier through their own targets)
    Object.assign(this, { life, item, view, lifeItem: true, anchors: view.anchors ?? [], grip: view.grip, rest: { q: new THREE.Quaternion(), lift: 0 } });
    const self = this;
    Object.defineProperties(this.takeTarget, {
      name: { get: () => self.life.items.name(self.item), configurable: true },
      blocked: { get: () => handBusy(self) || !!self.shutReason(), configurable: true },
      blockedText: { get: () => self.shutReason() ?? null, configurable: true },
    });
    this.sync();
  }

  /** In a shut store: why it can't be taken ("Öppna kylen först"), else null. */
  shutReason() {
    const p = this.item?.place, s = p?.at === 'slot' ? this.life.items.store(p.store) : null;
    return s && s.isOpen && !s.isOpen() ? s.shutText ?? `Öppna ${s.name} först` : null;
  }

  // Holdable's constructor sends it home before the instance is known: the instance's place is its home
  goHome() { if (this.item) this.sync(); }

  /** Put the model where the instance is, looking as it is. */
  sync() {
    const p = this.item.place, m = this.model;
    const wasHeld = this.held;
    this.held = p.at === 'hand';
    this.placed = p.at === 'world';
    if (wasHeld && !this.held && heldItem() === this) setHeld(null);
    if (this.held) {
      if (heldItem() !== this) setHeld(this);
      if (!this.camera.parent) this.scene.add(this.camera);
      this.camera.add(m);
      m.position.copy(this.heldPose.pos);
      m.rotation.copy(this.heldPose.rot);
    } else if (p.at === 'world') {
      this.life.group.add(m);
      m.position.set(...p.pos);
      m.quaternion.setFromAxisAngle(UP, p.yaw ?? 0);
    } else {
      const a = this.life.anchorOf(p);
      if (a) { a.add(m); m.position.set(0, 0, 0); m.quaternion.identity(); }
    }
    m.visible = true;
    this.refresh();
  }

  /** The model shows the instance's state (amount, package …). */
  refresh() { this.view.show?.(this.item, this.life.items); }

  take() {
    if (handBusy(this)) return;
    const why = this.life.items.move(this.item, { at: 'hand' });
    if (why) { this.life.say(why); return; }
    this.t = 0;
    this.lastYaw = this.camera.rotation.y; this.lastPitch = this.camera.rotation.x;
    sfx.click(this.where());
  }

  /** Down at world point `p` (a worktop, a table, the floor), turned `yaw` (radians; a random turn without). */
  placeAt(p, yaw = Math.random() * Math.PI * 2) {
    if (!this.held) return;
    const why = this.life.items.move(this.item, { at: 'world', pos: [p.x, p.y + 0.001, p.z], yaw });
    if (why) { this.life.say(why); return; }
    sfx.click(p);
  }

  /** The hand is needed for something else (or F): back to its home (a store's slot) if that is free, else down where
   * it last lay, else at the visitor's feet. Never lost. */
  putBack() {
    if (!this.held) return;
    const items = this.life.items, it = this.item;
    for (const place of [it.home, this.life.lastWorld.get(it.id), this.life.feet()]) {
      if (place && !items.move(it, place, { ignoreShut: true })) return;
    }
  }
}

/** The life simulator's things (#366): the instances (items.js) and their views. */
export class Life {
  constructor({ scene, camera, defs = ITEMS, say = () => {}, feet = () => ({ at: 'world', pos: [0, 0, 0], yaw: 0 }) }) {
    Object.assign(this, { scene, camera, say, feet });
    this.items = new Items(defs);
    this.views = new Map();
    this.lastWorld = new Map(); // id → the last world place (a putBack falls back to it)
    this.group = new THREE.Group(); // the things lying out (world.looseItems: F hides them)
    this.group.name = 'life';
    scene.add(this.group);
    this.anchors = new Map(); // store id → (slot) => Object3D (#369)
    this.items.on((kind, item) => {
      if (kind === 'create') this.views.set(item.id, new LifeItem(this, item));
      else if (kind === 'move') { if (item.place.at === 'world') this.lastWorld.set(item.id, { ...item.place, pos: [...item.place.pos] }); this.views.get(item.id)?.sync(); }
      else if (kind === 'change') this.views.get(item.id)?.refresh();
      else if (kind === 'remove') this.dropView(item);
    });
  }

  /** A new instance with its view (null + `items.lastReason` when the place is not allowed). */
  create(type, place, props) {
    const it = this.items.create(type, place, props);
    if (it?.place.at === 'world') this.lastWorld.set(it.id, { ...it.place, pos: [...it.place.pos] });
    return it;
  }
  view(item) { return this.views.get(typeof item === 'string' ? item : item?.id) ?? null; }

  dropView(item) {
    const v = this.views.get(item.id);
    if (!v) return;
    if (heldItem() === v) { v.held = false; setHeld(null); }
    v.model.removeFromParent();
    v.holder.removeFromParent();
    this.views.delete(item.id);
    this.lastWorld.delete(item.id);
  }

  /** Where a slot / a carrier's spot is in the scene. */
  anchorOf(p) {
    if (p.at === 'on') return this.view(p.parent)?.anchors[p.slot] ?? null;
    if (p.at === 'slot') return this.anchors.get(p.store)?.(p.slot) ?? null;
    return null;
  }

  /** The E targets: every item not in the hand. */
  targets() { const out = []; for (const v of this.views.values()) if (!v.held) out.push(v.target); return out; }

  update(dt) { for (const v of this.views.values()) v.update(dt); }
}

// The life simulator (epic #364): making, eating and cleaning up with real things in the flat. This module glues the
// life-sim layers to the game; what exists to build on is mapped in docs/livssimulator-inventering.md (#365).
//
// The developer scenario `&life` (#365, LIFE.dev): a reproducible start for tests and screenshots — every loose thing
// at home, every front and the fridge / freezer shut, no cat, the clock at noon and paused (unless &time), the visitor
// in the kitchen facing a free worktop with a few test things on it. It never touches the visitor's own home: resume.js
// neither reads nor writes the resume / F5 records with `&life`, and nothing the scenario sets is stored.

/** Is this page the `&life` developer scenario? */
export const lifeDev = (search = location.search) => new URLSearchParams(search).has('life');

/**
 * Set the scene for `&life`. `a` = the app's parts (main.js): { life, world, holdables, cups, things, milk, fish, fries, fruit,
 * airFryer, beer, cat, day, player, camera, at (true when &at= places the camera), timeGiven (true with &time) }.
 */
export function devScenario(a) {
  const D = LIFE.dev;
  if (!a.world.furnitureOn) { a.world.setFurniture(true); a.beer?.show(a.beer.out); } // (F off in this browser: on here, not stored)
  // everything home, every front shut
  for (const h of a.holdables) if (h.held) h.putBack();
  for (const h of a.holdables) if (h.placed) h.goHome();
  a.cups.reset();
  a.fish?.reset();
  a.fries?.reset();
  a.fruit?.reset();
  a.airFryer?.reset();
  for (const l of a.world.lids) if (l.isOpen && l.kind !== 'flush') { l.toggle(); for (let i = 0; i < 40; i++) l.update?.(0.1); }
  // no cat turns up (the scenario stays the same every time)
  if (a.cat.visible) a.cat.hide();
  a.cat.awayFor = Infinity;
  // the clock: noon, paused
  if (!a.timeGiven) { a.day.hour = D.hour; a.day.paused = true; a.day.update?.(0); }
  // the test things: an empty cup and the milk on the worktop, an empty wine glass on the dining table
  const top = a.world.cupSurfaces.find((s) => s.userData.counter)?.userData.surface ?? 0.93;
  const cup = a.cups.cups.find((c) => c.state === 'cabinet');
  if (cup) { cup.take(); cup.placeAt(new THREE.Vector3(D.cup[0], top, D.cup[1])); cup.model.rotation.set(0, 0, 0); }
  if (a.milk) { a.milk.take(); a.milk.placeAt(new THREE.Vector3(D.milk[0], top, D.milk[1])); a.milk.model.rotation.set(0, Math.PI / 2, 0); }
  const glass = a.things.find((t) => t.kind === 'glass' && t.name === 'vinglaset');
  const table = a.world.cupSurfaces.find((s) => Math.abs(s.userData.surface - 0.754) < 0.01)?.userData.surface ?? 0.754;
  if (glass) { glass.take(); glass.placeAt(new THREE.Vector3(D.glass[0], table, D.glass[1])); glass.model.rotation.set(0, 0, 0); }
  // the life sim's things (#366): a plate and a cucumber on the dining table
  const made = {};
  for (const [type, [x, z, yaw]] of Object.entries(D.items ?? {})) made[type] = a.life.create(type, { at: 'world', pos: [x, table, z], yaw: THREE.MathUtils.degToRad(yaw) });
  // the visitor in the kitchen, facing the worktop (unless &at= says otherwise)
  if (!a.at) {
    const [x, z, yaw, pitch] = D.at;
    a.player.spawn(x, z, THREE.MathUtils.degToRad(yaw));
    a.camera.rotation.x = THREE.MathUtils.degToRad(pitch);
  }
  return { cup, glass, milk: a.milk, ...made };
}

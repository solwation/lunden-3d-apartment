import * as THREE from 'three';
import { INVENTORY as I } from './config.js';

// Things you can take down and hold (#78, #86, #87, #89): the lightsaber, the Nerf blasters, the magic
// wands, the flashlight. Each has a home (hooks, a rack, a shelf) with an invisible pick box, a model
// that sits there, and a pose in the view while it is held (a child of the camera). E on it takes it;
// E on its home puts it back, E on a table top / worktop / the floor puts it down there (#102), and it is
// taken again with E on it. One thing in the hand at a time: while you hold something, other things
// can't be taken (their target is `blocked`). "Use" = a click, the touch action button when nothing else
// is aimed at, and — for things you swing — looking around fast. Subclasses fill in onTake / onPut /
// onUse / tick. The cups (cups.js) share setHeld / placeAt.

let current = null;
let bicycleHand = null; // #984: transient reservation, never a second inventory or saved item.
export const stowedItem = () => bicycleHand?.item ?? null;
export const bicycleHandsBusy = () => !!bicycleHand;
export const isStowed = item => !!item && (bicycleHand?.item === item || isPocketed(item));
/** Atomically free both hands without put/take hooks, placement changes or a second instance. */
export function stowBicycleHand() {
  if (bicycleHand) return;
  const item = current, model = item?.model;
  bicycleHand = { item, state: item?.state, parent: model?.parent, pos: model?.position.clone(), quat: model?.quaternion.clone(), scale: model?.scale.clone(), visible: model?.visible };
  current = null;
  if (!item) return;
  item.held = false; // stop use/automatic fire before cancelling a trigger (never loose a drawn bow).
  item.trigger?.(false);
  item.relax?.(); // cancel the existing bow draw without a release or ammunition change
  if (model) { bicycleHand.pos.copy(model.position); bicycleHand.quat.copy(model.quaternion); }
  model?.removeFromParent(); // detached even if an idle/show callback changes visible.
}
/** Called only after a successful exit/spawn. Reattach the same model with its exact held pose/state. */
export function restoreBicycleHand() {
  const saved = bicycleHand; bicycleHand = null;
  if (!saved?.item) return;
  const { item, parent, pos, quat, scale, visible } = saved;
  if (item.broken || item.model.parent || item.state !== saved.state ||
      (item.isMiele && (!item.cat?.visible || !item.cat?.held)) ||
      (item.drawing && !item.image) ||
      (item.isPaper && (!item.sheets || item.sink >= 0)) ||
      (item.lifeItem && (item.life.items.get(item.item.id) !== item.item || item.item.place.at !== 'hand'))) return; // reset/removal must never resurrect an old instance
  current = item; item.held = true;
  parent?.add(item.model); item.model.position.copy(pos); item.model.quaternion.copy(quat); item.model.scale.copy(scale); item.model.visible = visible;
  const camera = item.camera ?? (parent?.isCamera ? parent : null);
  if (camera?.isCamera) { item.lastYaw = camera.rotation.y; item.lastPitch = camera.rotation.x; }
}

/** The item in the visitor's hand, or null. */
export const heldItem = () => current;

// --- the inventory (#1954) -------------------------------------------------------------------------------------------------
// INVENTORY.slots places, one of them the hand (`active`). Taking a thing while the hand holds a pocketable one moves that one to its
// place instead of sending it home; `selectSlot` swaps which place is in the hand, as weapons are swapped in an FPS. A carried thing is
// detached exactly like the bicycle's stowed hand (no put / take hooks, no placement change, its owner state untouched) and comes back
// with the same pose; one that was reset, removed, broken or re-homed meanwhile is simply dropped from its place (never resurrected).
// Squirrel nuts stack: up to INVENTORY.stack of them share a place (`stacks`), the next one comes into the hand when the held one is
// gone. Only the classes in POCKET (weapons, tools, the catch) are carried; food, cups, the life simulator's items, the cat, drawings
// and paper keep the old rule (one at a time; they cannot be swapped away, the hand must be emptied first). Saved across a reload by
// keep.js's `inventory` part (#1959) through `inventoryContents` / `stowInto` / `freeHand` / `settleInventory` below.
const POCKET = new Set(['Saber', 'Blaster', 'Wand', 'Flashlight', 'Bow', 'Harpoon', 'Binoculars', 'FishingRod', 'CaughtFish', 'SharkFin', 'Mussel', 'Nut', 'SprayCan', 'Basketball', 'Rifle']);
const pockets = Array(I.slots).fill(null), stacks = Array.from({ length: I.slots }, () => []);
let active = 0;
/** May `item` be carried in a place of the inventory? */
export const pocketable = (item) => !!item && !item.broken && !item.lifeItem && (item.isRifle || POCKET.has(item.constructor?.name));
const stackable = (item) => !!item?.isSquirrelNut;
/** Detach `item` (the hand's) without hooks: the record that `attach` brings back. */
function detach(item) {
  const model = item.model, rec = { item, state: item.state, parent: model?.parent, pos: model?.position.clone(), quat: model?.quaternion.clone(), scale: model?.scale.clone(), visible: model?.visible };
  item.held = false; // stop use/automatic fire before cancelling a trigger (never loose a drawn bow)
  item.trigger?.(false);
  item.relax?.();
  if (model) { rec.pos.copy(model.position); rec.quat.copy(model.quaternion); }
  model?.removeFromParent();
  return rec;
}
/** Is the carried record still the thing that was put away (not reset, removed, broken or back in the world)? */
const intact = (rec) => !!rec?.item && !rec.item.broken && !rec.item.held && !rec.item.placed && !rec.item.model.parent && rec.item.state === rec.state;
/** The record's thing into the hand again, as it was held. False (nothing changes) when it is no longer intact. */
function attach(rec) {
  if (!intact(rec)) return false;
  const { item, parent, pos, quat, scale, visible } = rec;
  current = item; item.held = true;
  parent?.add(item.model); item.model.position.copy(pos); item.model.quaternion.copy(quat); item.model.scale.copy(scale); item.model.visible = visible;
  const camera = item.camera ?? (parent?.isCamera ? parent : null);
  if (camera?.isCamera) { item.lastYaw = camera.rotation.y; item.lastPitch = camera.rotation.x; }
  return true;
}
/** The thing on top of place `i`: the hand's for the active place, else the carried one. */
const topOf = (i) => (i === active ? current : pockets[i]?.item ?? null);
const countOf = (i) => (topOf(i) ? 1 : 0) + stacks[i].length;
/** The place a newly taken `item` goes to: a nut joins a place of nuts with room; else the hand when it is empty; else a free place. -1: none. */
function placeFor(item) {
  if (stackable(item)) for (let i = 0; i < I.slots; i++) if (stackable(topOf(i)) && countOf(i) < I.stack) return i;
  if (!current && !pockets[active] && !stacks[active].length) return active;
  for (let i = 0; i < I.slots; i++) if (countOf(i) === 0) return i;
  return -1;
}
/** Is `item` carried in the inventory (not in the hand)? */
export const isPocketed = (item) => !!item && (pockets.some((r) => r?.item === item) || stacks.some((st) => st.some((r) => r.item === item)));
/** The places for the HUD: [{ item (the top thing or null), count, active }]. */
export const inventorySlots = () => pockets.map((_, i) => ({ item: topOf(i), count: countOf(i), active: i === active }));
export const activeSlot = () => active;
/** Put place `i` in the hand (the held thing goes to its own place). Returns true, or why not: 'riding', 'busy' (a thing that cannot be
 * carried is held: put it down first), 'same'. */
export function selectSlot(i) {
  if (!(i >= 0 && i < I.slots)) return 'same';
  if (bicycleHand) return 'riding';
  if (i === active) return 'same';
  if (current && !pocketable(current)) return 'busy';
  if (current) { const item = current; current = null; pockets[active] = detach(item); }
  active = i;
  const rec = pockets[i]; pockets[i] = null;
  if (rec) attach(rec);
  inventoryTick();
  return true;
}
/** The next (dir 1) / previous (-1) place with something in it, into the hand. False when there is no other. */
export function cycleSlot(dir) {
  for (let k = 1; k < I.slots; k++) { const i = (active + dir * k + I.slots * k) % I.slots; if (countOf(i) > 0) return selectSlot(i) === true; }
  return false;
}
/** Per frame (main.js): things that left the game while carried lose their place; an empty hand over a stack of nuts takes the next one. */
export function inventoryTick() {
  for (let i = 0; i < I.slots; i++) {
    if (pockets[i] && !intact(pockets[i])) pockets[i] = null;
    if (stacks[i].length) stacks[i] = stacks[i].filter(intact);
    if (i !== active && !pockets[i] && stacks[i].length) pockets[i] = stacks[i].pop(); // a stack always has a top
  }
  if (!bicycleHand && !current) while (stacks[active].length && !attach(stacks[active].pop()));
}
// --- saving (#1959, keep.js `inventory`) -------------------------------------------------------------------------------------
/** What each place holds, for saving: [[top, ...stacked]] (the active place's top is the hand's, when it can be carried), and the active place. */
export const inventoryContents = () => ({ active, slots: pockets.map((_, i) => {
  const top = topOf(i);
  return [...(top && (i !== active || pocketable(top)) ? [top] : []), ...stacks[i].map((r) => r.item)];
}) });
/** Loading: put `item` (just taken into the hand by its own `take()`, or already the hand's) into place `slot`, without hooks. */
export function stowInto(item, slot) {
  if (!(slot >= 0 && slot < I.slots) || !item || isPocketed(item)) return false;
  if (current === item) current = null;
  const rec = detach(item);
  if (!pockets[slot] && !stacks[slot].length) pockets[slot] = rec; else stacks[slot].push(rec);
  return true;
}
/** Loading: empty the hand for a moment without hooks (it may hold something that cannot be carried); give the thing back to `settleInventory`. */
export function freeHand() { const h = current; current = null; return h; }
/** Loading, last: the thing `freeHand` returned is back in the hand, and place `i` (the saved active one) is the active place. */
export function settleInventory(i, hand = null) {
  if (!(i >= 0 && i < I.slots)) i = 0;
  if (hand) { current = hand; active = i; return; }
  active = i;
  const rec = pockets[i]; pockets[i] = null;
  if (rec) attach(rec);
  inventoryTick();
}
/** Take `item` into the hand (null = empty hand). What was held goes to its place in the inventory when it can be carried and there
 * is room (#1954); otherwise home (cups, #90). */
export function setHeld(item) {
  if (bicycleHand) return false; // reserved hands cannot take or send the stowed object home
  const prev = current;
  if (item && prev && prev !== item && pocketable(prev)) {
    const to = placeFor(item);
    if (to >= 0) {
      current = null;
      const rec = detach(prev);
      if (to === active) stacks[active].push(rec); // a nut on the held nut
      else {
        pockets[active] = rec; active = to;
        if (pockets[to]) { stacks[to].push(pockets[to]); pockets[to] = null; } // a nut on a carried place of nuts
      }
      current = item;
      return;
    }
  }
  current = item; // first, so the previous item's putBack does not come back here for itself
  if (prev && prev !== item) prev.putBack();
}
/** Is the hand busy with something other than `item`? (#102: put that down first; #1954: not when the held thing can be carried and
 * there is a place for `item`) */
export const handBusy = (item) => !!bicycleHand || (!!current && current !== item && !(item && pocketable(current) && placeFor(item) >= 0));

const tmpBox = new THREE.Box3();
/**
 * How a thing lies on a surface (#102), from its own shape: the longest side along the surface, the
 * shortest straight up. Returns { q, lift }: the rest rotation and how far its origin sits above the top.
 */
export function restPose(model) {
  const parent = model.parent, pos = model.position.clone(), quat = model.quaternion.clone();
  model.removeFromParent();
  model.position.set(0, 0, 0); model.quaternion.identity(); model.updateMatrixWorld(true);
  const size = tmpBox.setFromObject(model).getSize(new THREE.Vector3());
  const up = [0, 1, 2].sort((a, b) => size.getComponent(a) - size.getComponent(b))[0];
  const q = new THREE.Quaternion();
  if (up === 0) q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);      // x → y
  else if (up === 2) q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // z → y
  model.quaternion.copy(q); model.updateMatrixWorld(true);
  const lift = -tmpBox.setFromObject(model).min.y;
  model.position.copy(pos); model.quaternion.copy(quat);
  parent?.add(model);
  // Bounds sampling must restore world matrices before detail culling sees the held model.
  model.updateWorldMatrix(true, true);
  return { q, lift };
}

/** The target of a broken thing: an empty object no ray hits. */
const NOTHING = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };

export class Holdable {
  /**
   * opts: { name, verb, backName, backVerb, model (Object3D), home: { pos, rot }, heldPose: { pos, rot },
   *   pick: { pos, size } (the home's E box, world), parts (Object3D[] of the home: hooks …), swing
   *   (rad/s of looking that counts as a use, or 0), cooldown (s), useLabel (touch button text) }
   * A subclass with `clickIsUse` (weapons, the ball) fires on every left click; the others give a left click to E while
   * something is in focus and use themselves on a right click (main.js `click`, #443).
   */
  constructor(scene, camera, opts) {
    Object.assign(this, { scene, camera, held: false, t: 0, uses: 0, cool: 0, lastYaw: 0, lastPitch: 0, ...opts });
    this.homeScale = this.model.scale.clone();
    this.holder = new THREE.Group();
    for (const p of opts.parts ?? []) this.holder.add(p);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(...opts.pick.size), new THREE.MeshBasicMaterial());
    pick.position.copy(opts.pick.pos);
    pick.visible = false;
    this.holder.add(pick);
    scene.add(this.holder);
    const self = this;
    this.takeTarget = { name: opts.name, kind: 'holdable', verb: opts.verb ?? 'ta', pickable: this.model, item: this, get blocked() { return handBusy(self); }, toggle: () => this.take() };
    this.backTarget = { name: opts.backName, kind: 'holdable', verb: opts.backVerb, pickable: pick, toggle: () => this.putBack() };
    this.model.traverse((m) => { m.userData.door = this.takeTarget; });
    pick.userData.door = this.backTarget;
    this.goHome();
  }

  /** The E target now: the thing at home, or its empty home while it is held; nothing while it lies in pieces (#263). */
  get target() { return this.broken ? NOTHING : this.held ? this.backTarget : this.takeTarget; }

  /** Shot to pieces (#263, breaking.js): gone until mend(). */
  shatter() { this.broken = true; this.placed = false; this.model.visible = false; }
  /** Whole again, at home. */
  mend() { this.broken = false; this.goHome(); this.model.visible = true; }

  /** World pose of the same home used by goHome (return preview, #487). */
  homeMatrix() {
    const frame = this.homeParent ?? this.drawer?.object ?? this.scene, pose = this.local ?? this.home;
    if (!pose?.pos?.isVector3 || !pose.rot?.isEuler) return null;
    frame.updateWorldMatrix(true, false);
    return frame.matrixWorld.clone().multiply(new THREE.Matrix4().compose(pose.pos, new THREE.Quaternion().setFromEuler(pose.rot), this.homeScale));
  }

  goHome() {
    this.placed = false;
    this.scene.add(this.model);
    this.model.position.copy(this.home.pos);
    this.model.rotation.copy(this.home.rot);
  }

  /** Put it down at world point `p` on a horizontal surface (#102): lying on its side, turned `yaw` (radians; the ghost's
   * turn, #368 — a random one without). */
  placeAt(p, yaw = Math.random() * Math.PI * 2) {
    if (!this.held) return;
    this.held = false;
    if (current === this) current = null;
    this.onPut?.();
    this.scene.add(this.model);
    this.poseAt(this.model, p, yaw);
    this.placed = true;
  }

  /** How it lies put down at `p` turned `yaw`, applied to `obj` (its model, or main.js's ghost of it, #368). */
  poseAt(obj, p, yaw = 0) {
    this.rest ??= restPose(this.model);
    obj.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(this.rest.q);
    obj.position.set(p.x, p.y + this.rest.lift + 0.001, p.z);
  }

  take() {
    if (handBusy(this)) return; // one thing at a time (#102)
    setHeld(this);
    this.held = true;
    this.placed = false;
    if (!this.camera.parent) this.scene.add(this.camera); // children of the camera only render in the scene
    this.camera.add(this.model);
    this.model.position.copy(this.heldPose.pos);
    this.model.rotation.copy(this.heldPose.rot);
    this.t = 0;
    this.lastYaw = this.camera.rotation.y; this.lastPitch = this.camera.rotation.x;
    this.onTake?.();
  }

  putBack() {
    if (!this.held) return;
    this.held = false;
    if (current === this) current = null;
    this.onPut?.();
    this.goHome();
  }

  /** Click / touch button / a fast look. */
  use(speed = 0) {
    if (!this.held || this.cool > 0) return;
    this.cool = this.cooldown ?? 0.3;
    this.uses++;
    this.onUse?.(speed);
  }

  /** The model's position in the world (sounds, particles). */
  where(out = new THREE.Vector3()) { return this.model.getWorldPosition(out); }

  update(dt) {
    if (isStowed(this)) return;
    this.cool -= dt;
    if (!this.held) { this.idle?.(dt); return; }
    this.t += dt;
    let speed = 0;
    if (dt > 0) {
      let dy = this.camera.rotation.y - this.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      speed = Math.hypot(dy, this.camera.rotation.x - this.lastPitch) / dt;
      if (this.swing && speed > this.swing) this.use(speed);
    }
    this.lastYaw = this.camera.rotation.y; this.lastPitch = this.camera.rotation.x;
    this.tick?.(dt, speed);
  }
}

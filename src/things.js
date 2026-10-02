import * as THREE from 'three';
import { Holdable, heldItem, handBusy } from './holdable.js';
import { sfx } from './audio.js';
import { DRINKS as D } from './config.js';
import { Contents, GlassLiquid, pourAmount, drinkName } from './drinks.js';

// Small things in the living room you can take (#152): the wine bottles in the wine rack, the whisky bottles and
// glasses in the BESTÅ. Built by furniture.js (userData.things), turned into Holdables here: E takes one, E on a
// table top / worktop / the floor puts it down standing, E on its own place in the rack or cabinet puts it back.
// Pouring (#167): with a bottle in the hand, E on a glass that stands out (not in the cabinet, not in the hand)
// pours (the bottle tips, the glass fills over a second); a click / "Drick" with a filled glass in the hand drinks
// a sip. A glass put back in the BESTÅ is empty again. The bottles never run dry.

const NAMES = { wine: 'vinflaskan', champagne: 'champagneflaskan', whisky: 'whiskyflaskan', glass: 'glaset', plant: 'blomkrukan' };
const HELD = {
  glass: { pos: [0.17, -0.2, -0.4], rot: [0.05, 0, 0] },
  bottle: { pos: [0.2, -0.32, -0.48], rot: [0.15, 0, -0.1] },
  plant: { pos: [0.16, -0.32, -0.5], rot: [0.1, 0, 0] }, // a pot plant held in front, the plant up (#185)
};

export class Thing extends Holdable {
  constructor(scene, camera, { model, kind, back, name: given }) {
    model.updateWorldMatrix(true, true);
    const pos = model.getWorldPosition(new THREE.Vector3());
    const rot = new THREE.Euler().setFromQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const held = HELD[kind === 'glass' || kind === 'plant' ? kind : 'bottle'];
    const name = given ?? NAMES[kind] ?? 'flaskan';
    super(scene, camera, {
      name, verb: 'ta', backName: back, backVerb: kind === 'plant' ? `ställa tillbaka ${name} på` : kind === 'glass' ? `ställa tillbaka ${name} i` : `lägga tillbaka ${name} i`, placeVerb: 'ställa ner', model,
      home: { pos, rot }, heldPose: { pos: new THREE.Vector3(...held.pos), rot: new THREE.Euler(...held.rot) },
      pick: { pos: mid, size: [size.x + 0.03, size.y + 0.03, size.z + 0.03] }, cooldown: kind === 'glass' ? 0.6 : 0.3,
    });
    Object.assign(this, { kind });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // its origin is the bottom centre: put down standing
  }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); }
}

/** A wine, champagne or whisky bottle: pours its drink into a glass (it tips meanwhile). */
export class Bottle extends Thing {
  constructor(scene, camera, opts) {
    super(scene, camera, opts);
    Object.assign(this, { drink: opts.kind, tilt: 0, tiltT: 0 });
  }

  /** Tip it for `secs` seconds (a glass is being filled from it). */
  pour(secs) { this.tiltT = secs; }

  tick(dt) {
    this.tiltT = Math.max(0, this.tiltT - dt);
    this.tilt += ((this.tiltT > 0 ? 1 : 0) - this.tilt) * Math.min(1, dt * 8);
    const r = this.heldPose.rot;
    this.model.rotation.set(r.x, r.y, r.z + D.tilt * this.tilt); // the neck over towards the middle of the view
  }

  putBack() { this.tiltT = this.tilt = 0; super.putBack(); }
}

/** A glass: something to pour into, and to drink from. */
export class Glass extends Thing {
  constructor(scene, camera, opts) {
    super(scene, camera, opts);
    this.contents = new Contents();
    this.liquid = new GlassLiquid(this.model, opts.inner ?? [[0.03, 0.01], [0.03, 0.09]]);
    this.sipT = 0;
    const self = this;
    Object.defineProperties(this.takeTarget, {
      verb: { get: () => self.pourVerb, configurable: true },
      blocked: { get: () => self.blocked, configurable: true },
      blockedText: { get: () => (self.pourable ? `${self.name[0].toUpperCase()}${self.name.slice(1)} är fullt` : null), configurable: true },
    });
    this.takeTarget.toggle = () => this.press();
  }

  get fill() { return this.contents.total; }
  /** The held thing that pours, if it can pour into this glass now (the glass standing out, #167). */
  get source() { const h = heldItem(); return h?.drink && D.pour.glass[h.drink] && this.placed && !this.held ? h : null; }
  get pourable() { return !!this.source; }
  get blocked() { return this.pourable ? pourAmount('glass', this.source.drink, this.fill) <= 0 : handBusy(this); }
  get pourVerb() { return this.pourable ? `hälla ${drinkName(this.source.drink)} i` : 'ta'; }

  press() {
    if (this.contents.pouring) return;
    const src = this.source;
    if (src) this.pourFrom(src);
    else this.take();
  }

  /** Pour from the held bottle (or milk): up to the drink's level in a glass (DRINKS.pour.glass). */
  pourFrom(src) {
    const amount = pourAmount('glass', src.drink, this.fill);
    if (!amount) return;
    this.contents.pour(src.drink, amount, D.secs);
    src.pour?.(D.secs);
    sfx.pour(this.where(), D.secs);
  }

  /** "Drick" while something is in it. */
  get useLabel() { return this.held && this.fill > 0.01 ? 'Drick' : null; }

  onUse() {
    if (this.fill <= 0.01) return;
    this.sipT = 1;
    this.onSip?.(this.contents.main);
    sfx.gulp(this.where());
    this.contents.sip(D.sip);
    this.liquid.show(this.contents);
  }

  /** Back in the cabinet: washed up, empty. */
  goHome() {
    super.goHome();
    if (!this.contents) return; // (the constructor of Holdable sends it home before the contents exist)
    this.contents.clear();
    this.liquid.show(this.contents);
  }

  tick(dt) {
    this.sipT = Math.max(0, this.sipT - dt * 1.6);
    const k = Math.sin(this.sipT * Math.PI), p = this.heldPose.pos, r = this.heldPose.rot; // up to the mouth, tipped, down again
    this.model.position.set(p.x - 0.14 * k, p.y + 0.15 * k, p.z + 0.16 * k);
    this.model.rotation.set(r.x + 1.1 * k, r.y, r.z);
  }

  update(dt) {
    if (this.contents.update(dt)) this.liquid.show(this.contents);
    super.update(dt);
  }
}

/**
 * A small thing in the secretary (#182): the toy car, the crayons, the letter … in its drawers, the owl and the
 * cactus on top. Its home is in its drawer's own frame, so at home it slides in and out with the drawer; put
 * down somewhere else it stays there when the drawer closes. It goes back only while its drawer is open.
 */
export class Trinket extends Holdable {
  constructor(scene, camera, { model, name, homeParent, drawer, back }) {
    model.updateWorldMatrix(true, true);
    const local = { pos: model.position.clone(), rot: model.rotation.clone() };
    const box = new THREE.Box3().setFromObject(model, true), size = box.getSize(new THREE.Vector3());
    const big = size.y > 0.08; // the owl, the cactus
    super(scene, camera, {
      name, kind: 'trinket', verb: 'ta', backName: back, backVerb: drawer ? `lägga tillbaka ${name} i` : `ställa tillbaka ${name} på`, placeVerb: big ? 'ställa ner' : 'lägga ner',
      model, homeParent, local, drawer, home: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
      heldPose: big ? { pos: new THREE.Vector3(0.18, -0.26, -0.45), rot: new THREE.Euler(0.1, -0.4, 0) } : { pos: new THREE.Vector3(0.14, -0.16, -0.34), rot: new THREE.Euler(0.6, -0.3, 0) },
      pick: { pos: new THREE.Vector3(), size: [Math.max(size.x, 0.04) + 0.03, size.y + 0.03, Math.max(size.z, 0.04) + 0.03] }, cooldown: 0.3,
    });
    // the "put it back" box lives in the drawer (it rides along) and only counts while the drawer is open
    const pick = this.backTarget.pickable;
    homeParent.add(pick);
    pick.position.copy(local.pos).y += size.y / 2;
    const ray = pick.raycast.bind(pick); // its drawer is a recursive pick target: the box only counts while this is held
    pick.raycast = (r, hits) => { if (this.held) ray(r, hits); };
    Object.defineProperties(this.backTarget, {
      blocked: { get: () => !!drawer && !drawer.isOpen, configurable: true },
      blockedText: { get: () => 'Öppna lådan först', configurable: true },
    });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // its origin is its bottom centre: down as it lies in the drawer
  }

  /** Home: in its drawer (or on the secretary), in that frame. */
  goHome() {
    this.placed = false;
    this.homeParent.add(this.model);
    this.model.position.copy(this.local.pos);
    this.model.rotation.copy(this.local.rot);
  }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); }
}

const KINDS = { glass: Glass, trinket: Trinket, plant: Thing }; // pot plants (#185) are plain Things
/** Every bottle, glass, secretary trinket and pot plant furniture.js offers (world.things). */
export const buildThings = (scene, camera, list) => list.map((t) => new (KINDS[t.kind] ?? Bottle)(scene, camera, t));

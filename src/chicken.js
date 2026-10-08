import * as THREE from 'three';
import { Holdable, setHeld, heldItem } from './holdable.js';
import { sfx } from './audio.js';
import { chicken } from './fridge.js';
import { CHICKEN as C } from './config.js';

// The roast chicken in the fridge (#160), a Holdable: E (fridge open) takes it on its plate, E on its shelf
// spot puts it back; it goes down on tables / worktops / the floor like other things. E on the pan standing
// on the hob lays it in the pan (the plate stays out of sight: it rides with the chicken, hidden). In the pan
// on a lit zone it fries: after `cookSeconds` it sizzles, browns and starts to smoke. The smoke follows it
// (carried, too) and stops after `smokeSeconds`, or at once when it is back in the fridge and the door shuts.
// The chicken in the pan is a child of the pan: carry the pan and it comes along.
// #194: raw it is pale (CHICKEN.raw) and turns golden as it fries; with the cooker hood running over it the smoke is
// drawn up into the hood (`hood`, main.js sets it). Cooked, E on a leg or wing breaks it off into the hand (a
// ChickenPiece: a click eats it in CHICKEN.bites bites); with the legs and wings gone the body comes off in pieces
// until only the plate is left. F (reset) puts it back raw and whole.

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Chicken extends Holdable {
  /** fridge: the Fridge (its shelfSpot is home); pan: the Pan (or null); hob: world.hob. */
  constructor(scene, camera, fridge, pan, hob) {
    const model = chicken();
    const plate = model.children[0];
    model.traverse((m) => { if (m.isMesh && m !== plate) m.material = m.material.clone(); }); // its own skin: it browns
    fridge.object.updateWorldMatrix(true, false);
    const home = fridge.object.localToWorld(fridge.shelfSpot.clone());
    super(scene, camera, {
      name: 'kycklingen', verb: 'ta', backName: 'kycklingen i kylen', backVerb: 'ställa tillbaka', placeVerb: 'ställa ner',
      model, home: { pos: home, rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(C.held.x, C.held.y, C.held.z), rot: new THREE.Euler(0.3, 0.4, 0) },
      pick: { pos: home.clone().setY(home.y + 0.07), size: [0.3, 0.16, 0.3] },
    });
    Object.assign(this, { fridge, pan, hob, plate, inPan: false, cooked: 0, smokeT: 0, sizzleT: 0, smokeClock: 0 });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // its origin is the plate's bottom: put down standing
    this.skins = [];
    model.traverse((m) => { if (m.isMesh && m !== plate && m.material.color.r > 2 * m.material.color.b) this.skins.push({ m: m.material, c0: m.material.color.clone() }); });
    // raw colours: the light skin and the darker parts each get their pale counterpart
    const light = Math.max(...this.skins.map((k) => k.c0.r));
    for (const k of this.skins) k.raw = new THREE.Color(k.c0.r >= light - 0.01 ? C.raw[0] : C.raw[1]);
    // the parts that break off (fridge.js chicken(): plate, body, breast, then per side thigh, bone, knob, wing)
    const ch = model.children;
    this.parts = [
      { name: 'kycklingbenet', meshes: [ch[3], ch[4], ch[5]] }, { name: 'kycklingbenet', meshes: [ch[7], ch[8], ch[9]] },
      { name: 'vingen', meshes: [ch[6]] }, { name: 'vingen', meshes: [ch[10]] },
    ];
    this.body = [ch[1], ch[2]];
    this.bodyLeft = C.bodyBites;
    for (const p of this.parts) p.target = { name: p.name, kind: 'holdable', verb: 'bryta loss', pickable: model, item: this, get blocked() { return !!heldItem(); }, toggle: () => this.breakOff(p) };
    this.bodyTarget = { name: 'en bit av kycklingen', kind: 'holdable', verb: 'bryta loss', pickable: model, item: this, get blocked() { return !!heldItem(); }, toggle: () => this.breakOff(null) };
    this.done = false;
    this.paint(0);
    const mat = new THREE.SpriteMaterial({ map: smokeTexture(), color: 0xb9bcc0, transparent: true, depthWrite: false, opacity: 0 });
    this.smoke = [...Array(10)].map((_, i) => {
      const s = new THREE.Sprite(mat.clone());
      s.userData.phase = i / 10;
      s.visible = false;
      s.raycast = () => {};
      scene.add(s);
      return s;
    });
  }

  get smoking() { return this.smokeT > 0; }

  /** Lay it in the pan on the hob (main.js: E on the pan with the chicken in the hand). */
  intoPan() {
    if (!this.held || !this.pan || this.pan.egg) return;
    this.held = false;
    setHeld(null); // the hand is free (this one is no longer held, so nothing is put back)
    this.pan.model.add(this.model);
    this.model.position.set(0, C.inPanY, 0);
    this.model.rotation.set(0, Math.PI / 2, 0);
    this.model.scale.setScalar(C.inPanScale); // the bird shrinks a little in the pan (and fits in it)
    this.plate.visible = false;
    this.inPan = true;
    this.placed = true; // F sends it home from there
    sfx.click(this.where());
  }

  take() { super.take(); this.inPan = false; this.plate.visible = true; this.model.scale.setScalar(1); }

  goHome() {
    this.inPan = false;
    if (this.plate) this.plate.visible = true;
    this.model.scale.setScalar(1);
    super.goHome();
  }

  /** F: home without smoke, raw and whole again. */
  reset() {
    if (this.held) this.putBack(); else this.goHome();
    if (heldItem()?.isChickenPiece) heldItem().putBack();
    this.smokeT = 0; this.cooked = 0; this.brownK = 0; this.done = false;
    for (const s of this.smoke) s.visible = false;
    for (const p of this.parts) { p.gone = false; for (const m of p.meshes) m.visible = true; }
    this.bodyLeft = C.bodyBites;
    for (const m of this.body) { m.visible = true; m.scale.copy(m.userData.s0 ?? m.scale); }
    this.paint(0);
    this.retarget();
  }

  /** Colour by how far it is cooked: 0 raw … 1 golden; `dark` 0…1 = darker still from frying on. */
  paint(k, dark = 0) { for (const s of this.skins) s.m.color.copy(s.raw).lerp(s.c0, k).multiplyScalar(1 - C.darken * dark); }
  brown(k) { this.paint(1, k); }

  /** Which E target each mesh is: cooked, its legs, wings and body break off; raw (or eaten), the whole thing is taken. */
  retarget() {
    for (const m of this.body) m.userData.door = this.done && this.bodyLeft > 0 && this.parts.every((p) => p.gone) ? this.bodyTarget : this.takeTarget;
    for (const p of this.parts) for (const m of p.meshes) m.userData.door = this.done && !p.gone ? p.target : this.takeTarget;
  }

  /** Break a leg / wing (p) or a piece of the body (null) off into the hand. */
  breakOff(p) {
    if (heldItem() || !this.done) return;
    const src = p ? p.meshes : this.body;
    const piece = new ChickenPiece(this, p, src);
    if (p) { p.gone = true; for (const m of p.meshes) m.visible = false; }
    else {
      this.bodyLeft--;
      for (const m of this.body) { m.userData.s0 ??= m.scale.clone(); m.scale.copy(m.userData.s0).multiplyScalar(0.45 + 0.55 * this.bodyLeft / C.bodyBites); m.visible = this.bodyLeft > 0; }
    }
    this.retarget();
    this.piece = piece;
    piece.take();
    sfx.rustle?.(this.where());
  }

  /** A piece came back (something else was taken, or F): its part is on the bird again. */
  restore(p) {
    if (p) { p.gone = false; for (const m of p.meshes) m.visible = true; } else {
      this.bodyLeft = Math.min(C.bodyBites, this.bodyLeft + 1);
      for (const m of this.body) { m.scale.copy(m.userData.s0).multiplyScalar(0.45 + 0.55 * this.bodyLeft / C.bodyBites); m.visible = true; }
    }
    this.retarget();
  }

  update(dt) {
    super.update(dt);
    this.piece?.update(dt); // a piece in the hand being eaten
    if (this.inPan && this.pan && this.model.parent !== this.pan.model) this.inPan = false;
    if (this.inPan && this.pan.model.parent === this.pan.drawer?.object) this.goHome(); // the pan went back into its drawer
    const frying = this.inPan && this.pan.onHob && this.hob?.on;
    if (frying) {
      this.cooked += dt;
      if (!this.done) this.paint(Math.min(1, this.cooked / C.cookSeconds)); // raw → golden while it fries
      if (this.cooked >= C.cookSeconds) {
        if (!this.done) { this.done = true; this.retarget(); this.onCooked?.(); }
        this.brownK = Math.min(1, (this.brownK ?? 0) + dt / (2 * C.cookSeconds)); // a little darker the longer it fries
        this.brown(this.brownK);
        this.smokeT = C.smokeSeconds; // keeps smoking while it fries, then smokeSeconds more
        if ((this.sizzleT -= dt) <= 0) { sfx.sizzle(this.where()); this.sizzleT = 0.6 + Math.random() * 0.3; }
      }
    } else {
      this.cooked = 0;
      if (this.smokeT > 0) this.smokeT = Math.max(0, this.smokeT - dt);
    }
    // back in the fridge and the door shut: the smoke stops at once
    if (this.smoking && !this.held && !this.placed && !this.fridge.isOpen) this.smokeT = 0;
    this.smokeClock += dt;
    const on = this.smoking && this.model.parent && this.visibleUp();
    const from = on ? this.where(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0)) : null;
    const fade = Math.min(1, this.smokeT / 4);
    const drawn = on && !!this.hood?.draws(from);
    for (const s of this.smoke) {
      s.visible = !!on;
      if (!on) continue;
      const k = (this.smokeClock / 3 + s.userData.phase) % 1; // 0 → 1 over 3 s
      s.position.copy(from).add(new THREE.Vector3(Math.sin((k + s.userData.phase) * 9) * 0.04, k * 0.75, Math.cos((k + s.userData.phase) * 7) * 0.03));
      if (drawn) s.position.lerp(this.hood.intake, k * k); // the running hood pulls it up and in (#194)
      s.scale.setScalar(drawn ? 0.08 + k * 0.12 : 0.08 + k * 0.22);
      s.material.opacity = 0.6 * fade * Math.sin(Math.PI * k);
    }
  }

  /** Smoke the hood does not take care of (the smoke alarm listens to this, #194). */
  get freeSmoke() {
    if (!this.smoking || !this.model.parent || !this.visibleUp()) return false;
    return !this.hood?.draws(this.where(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0)));
  }

  visibleUp() { for (let p = this.model; p; p = p.parent) if (!p.visible) return false; return true; }
}

/** A leg, wing or bit of the body broken off the cooked chicken (#194): in the hand, a click / "Ät" takes a bite. */
export class ChickenPiece {
  constructor(bird, part, meshes) {
    Object.assign(this, { bird, part, isChickenPiece: true, name: part ? part.name : 'kycklingbiten', held: false, bites: 0, bite: 0 });
    this.model = new THREE.Group();
    const box = new THREE.Box3();
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      const c = new THREE.Mesh(m.geometry, m.material);
      m.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      this.model.add(c);
      box.expandByObject(c);
    }
    const mid = box.getCenter(new THREE.Vector3());
    for (const c of this.model.children) { c.position.sub(mid); if (!part) c.scale.multiplyScalar(0.4); }
  }

  take() {
    setHeld(this);
    this.held = true;
    const cam = this.bird.camera;
    if (!cam.parent) this.bird.scene.add(cam);
    cam.add(this.model);
    this.pose(0);
  }

  pose(k) {
    this.model.position.set(C.piece.x - 0.1 * k, C.piece.y + 0.09 * k, C.piece.z + 0.16 * k);
    this.model.rotation.set(0.3 - 0.2 * k, 0.6, 0.2);
  }

  /** Something else was taken (or F): the piece goes back on the bird. */
  putBack() {
    if (!this.held) return;
    this.held = false;
    if (heldItem() === this) setHeld(null);
    this.model.removeFromParent();
    this.bird.restore(this.part);
  }

  get useLabel() { return this.held ? 'Ät' : null; }
  use() {
    if (!this.held || this.bite > 0) return;
    this.bite = 1;
    sfx.chew(this.model.getWorldPosition(new THREE.Vector3()), 0.8);
  }

  update(dt) {
    if (!this.held || this.bite <= 0) return;
    const before = this.bite;
    this.bite = Math.max(0, this.bite - dt * 2.5);
    if (before > 0.5 && this.bite <= 0.5) {
      this.bites++;
      this.model.scale.setScalar(1 - this.bites / (C.bites + 0.4));
      if (this.bites >= C.bites) { // eaten
        this.held = false;
        setHeld(null);
        this.model.removeFromParent();
        this.bird.onEaten?.();
        return;
      }
    }
    this.pose(Math.sin(this.bite * Math.PI));
  }
}

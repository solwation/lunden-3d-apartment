import * as THREE from 'three';
import { forgetBicycleHand } from './keep.js';
import { Holdable, setHeld, heldItem, isStowed } from './holdable.js';
import { sfx } from './audio.js';
import { chicken } from './fridge.js';
import { CHICKEN as C } from './config.js';

// The fridge's whole chicken (#160, #708): a kettle grill only (courtyard or L1007's patio kettle, #1157); raw → golden → burnt.
// Existing model, pieces and smoke are reused. Life's saved extra keeps cooking/placement/parts/reward flags;
// F returns it home without refilling or undoing cooking. Grill placement keeps E as whole-bird pickup.

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
    Object.assign(this, { fridge, pan, hob, plate, inPan: false, inGrill: false, burnt: false, rewarded: false, burntCounted: false, cooked: 0, smokeT: 0, sizzleT: 0, smokeClock: 0, generation: 0 });
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

  /** grill: the courtyard Grill, or a list of Grills (#1157: also L1007's patio kettle); the first is the default. */
  initLife(life, grill) {
    const grills = [grill].flat().filter(Boolean);
    Object.assign(this, { life, grills, grill: grills[0], id: 'chicken', type: 'chicken', generation: 0 });
    life.onEvent((kind, data) => { if (['chickenTaskReady', 'chickenTaskReset'].includes(kind) && data.task === 'grillChicken') this.renewForTask(); });
    life.keepPart('chicken', { save: () => this.saveState(), load: (s) => this.loadState(s) });
  }

  /** Only the completed task's expired cooldown may replenish the chicken (#710); F never calls this. */
  renewForTask() {
    const generation = this.generation + 1;
    this.loadState({ v: 1, generation, cooked: 0, bodyLeft: C.bodyBites, gone: [], place: null });
    this.life.dirty = true;
  }

  /** #1124: the last piece of a cooked bird eaten: a fresh raw chicken on its plate in the fridge (a new generation). */
  renewIfEaten() {
    if (!this.done || this.bodyLeft > 0 || !this.parts.every((p) => p.gone) || heldItem()?.isChickenPiece) return false;
    this.piece = null;
    this.loadState({ v: 1, generation: this.generation + 1, cooked: 0, bodyLeft: C.bodyBites, gone: [], place: null });
    if (this.life) { this.life.dirty = true; this.life.say('En ny rå kyckling ligger i kylen.'); }
    this.event('chickenRestocked', { surface: 'fridge' });
    return true;
  }

  get cookState() { return this.burnt ? 'burnt' : this.done ? 'golden' : 'raw'; }
  event(kind, extra = {}) {
    this.life?.emit(kind, { item: { id: this.id, type: 'chicken', machine: { cook: this.cooked, cooked: this.done, burnt: this.burnt } },
      state: this.cookState, ...extra });
  }

  /** A pan attempt is refused without releasing the hand or changing the chicken. */
  intoPan() {
    if (!this.held) return false;
    this.life?.say('Den här är för stor för pannan – den vill ha riktig grill.');
    this.event('chickenPanRefused', { surface: 'pan' });
    return false;
  }

  /** g: which grill (#1157: the courtyard's or L1007's patio kettle); the bird stays with it until taken. */
  intoGrill(g = this.grill) {
    if (!this.held || !g?.on) { this.life?.say('Tänd grillen först.'); return false; }
    if (g.hasSausage?.()) { this.life?.say('Ta av korvarna först – kycklingen behöver hela grillen.'); return false; } // #1124
    forgetBicycleHand(this);
    this.held = false; setHeld(null);
    this.grill = g;
    this.grill.object.add(this.model);
    this.model.position.copy(this.grill.grateTop);
    this.model.rotation.set(0, Math.PI / 2, 0); this.model.scale.setScalar(1);
    this.plate.visible = false; this.inGrill = this.placed = true;
    this.retarget(); this.life && (this.life.dirty = true);
    this.event('chickenPlaced', { surface: 'grill' });
    return true;
  }

  placementState() {
    return this.inGrill ? { grill: true, ...(this.grill !== this.grills?.[0] ? { kind: this.grill.kind } : {}) } : this.placed ? { pos: this.where().toArray(), quat: this.model.getWorldQuaternion(new THREE.Quaternion()).toArray() } : null;
  }

  take({silent=false} = {}) {
    const fromGrill = this.inGrill;
    if (heldItem() && heldItem() !== this) return;
    this.lastRest = this.placementState();
    super.take(); this.inPan = this.inGrill = false; this.plate.visible = true; this.model.scale.setScalar(1);
    this.retarget(); this.life && (this.life.dirty = true);
    if(!silent)this.event('chickenTaken', { surface: fromGrill ? 'grill' : 'other' });
  }

  goHome({ silent = false } = {}) {
    forgetBicycleHand(this);
    this.inPan = this.inGrill = false;
    if (this.plate) this.plate.visible = true;
    this.model.scale.setScalar(1); super.goHome();
    if (this.body) this.retarget();
    if (this.life && !silent && !this.silentHome) { this.life.dirty = true; this.event('chickenReturnedHome', { surface: 'fridge' }); }
  }

  /** F: home and quiet; cooking, missing/eaten parts and reward flags survive (#708). */
  reset() {
    if (heldItem()?.isChickenPiece) heldItem().putBack();
    this.silentHome = true;
    if (this.held) this.putBack(); else this.goHome();
    this.silentHome = false;
    this.smokeT = 0;
    for (const s of this.smoke) s.visible = false;
    this.life && (this.life.dirty = true);
  }

  saveState() {
    return { v: 1, generation: this.generation, cooked: this.cooked, brown: this.brownK ?? 0, done: this.done, burnt: this.burnt,
      rewarded: this.rewarded, burntCounted: this.burntCounted, gone: this.parts.map(p => !!p.gone), bodyLeft: this.bodyLeft,
      place: this.held || isStowed(this) ? this.lastRest ?? null : this.placementState() };
  }

  loadState(s) {
    if (s?.v !== 1) return;
    if (heldItem()?.isChickenPiece) heldItem().putBack();
    if (heldItem() === this) setHeld(null); this.held = false; this.goHome({ silent: true });
    this.generation = Number.isSafeInteger(s.generation) ? Math.max(0, s.generation) : 0;
    this.id = this.generation ? `chicken:${this.generation}` : 'chicken';
    this.cooked = Number.isFinite(s.cooked) ? Math.max(0, Math.min(C.burnSeconds, s.cooked)) : 0;
    this.burnt = !!s.burnt || this.cooked >= C.burnSeconds; this.done = this.burnt || !!s.done || this.cooked >= C.cookSeconds;
    this.rewarded = !!s.rewarded || this.done; this.burntCounted = !!s.burntCounted || this.burnt;
    this.brownK = this.burnt ? 1 : Number.isFinite(s.brown) ? Math.max(0, Math.min(1, s.brown)) : 0;
    this.parts.forEach((p, i) => { p.gone = !!s.gone?.[i]; for (const m of p.meshes) m.visible = !p.gone; });
    this.bodyLeft = Number.isInteger(s.bodyLeft) ? Math.max(0, Math.min(C.bodyBites, s.bodyLeft)) : C.bodyBites;
    for (const m of this.body) { m.userData.s0 ??= m.scale.clone(); m.scale.copy(m.userData.s0).multiplyScalar(0.45 + 0.55 * this.bodyLeft / C.bodyBites); m.visible = this.bodyLeft > 0; }
    if (s.place?.grill) this.grill = this.grills?.find((g) => g.kind === (s.place.kind ?? this.grills[0].kind)) ?? null;
    if (s.place?.grill && this.grill) {
      this.grill.object.add(this.model); this.model.position.copy(this.grill.grateTop); this.model.rotation.set(0, Math.PI / 2, 0);
      this.inGrill = this.placed = true; this.plate.visible = false; this.grill.lidK = 1; this.grill.update(0);
    } else if (Array.isArray(s.place?.pos) && s.place.pos.length === 3 && s.place.pos.every(Number.isFinite) && Array.isArray(s.place.quat) && s.place.quat.length === 4 && s.place.quat.every(Number.isFinite)) {
      this.scene.add(this.model); this.model.position.set(...s.place.pos); this.model.quaternion.set(...s.place.quat); this.placed = true;
    }
    this.smokeT = 0; this.paint(this.done ? 1 : Math.min(1, this.cooked / C.cookSeconds), this.brownK);
    this.retarget(); // no completion/reward events on restoration
  }

  /** #1034: x.chicken owns the bird; this record only identifies its already held portion. */
  saveStowed(item) {
    if (item === this) return { whole:true, generation:this.generation };
    if (item !== this.piece || !item.isChickenPiece) return null;
    return { whole:false, generation:this.generation, part:item.part ? this.parts.indexOf(item.part) : null,
      body:item.part ? null : item.meta.bodyIdx, bites:item.bites, id:item.portionId };
  }
  loadStowed(s) {
    const source=this.life?.loadedX?.chicken;
    if (!source || source.v!==1 || !Number.isSafeInteger(s.generation) || s.generation<0 || s.generation!==this.generation || s.generation!==source.generation || typeof s.whole!=='boolean') return null;
    if (s.whole) { this.take({silent:true}); return this; }
    if (!this.done || !Number.isSafeInteger(s.bites) || s.bites<0 || s.bites>=C.bites) return null;
    const part=Number.isInteger(s.part)&&s.part>=0&&s.part<this.parts.length ? this.parts[s.part] : null;
    if (part ? !part.gone || s.body!==null : s.part!==null || !Number.isInteger(s.body) || s.body<1 || s.body>C.bodyBites || this.bodyLeft!==s.body-1) return null;
    const id=part ? `chicken:${this.generation}:part:${s.part}` : `chicken:${this.generation}:body:${s.body}`;
    if(s.id!==id)return null;
    this.piece?.model.removeFromParent();
    const item=new ChickenPiece(this,part,part?.meshes??this.body,{partIdx:s.part,bodyIdx:s.body,generation:this.generation});
    item.bites=s.bites; item.model.scale.setScalar(1-s.bites/(C.bites+.4)); this.piece=item; item.take(); return item;
  }
  placeAt(p,yaw) { forgetBicycleHand(this); super.placeAt(p,yaw); }

  /** Colour by how far it is cooked: 0 raw … 1 golden; `dark` 0…1 = darker still from frying on. */
  paint(k, dark = 0) { for (const s of this.skins) s.m.color.copy(s.raw).lerp(s.c0, k).multiplyScalar(1 - C.darken * dark); }
  brown(k) { this.paint(1, k); }

  /** Which E target each mesh is: cooked, its legs, wings and body break off; raw (or eaten), the whole thing is taken. */
  retarget() {
    for (const m of this.body) m.userData.door = !this.inGrill && this.done && this.bodyLeft > 0 && this.parts.every((p) => p.gone) ? this.bodyTarget : this.takeTarget;
    for (const p of this.parts) for (const m of p.meshes) m.userData.door = !this.inGrill && this.done && !p.gone ? p.target : this.takeTarget;
  }

  /** Break a leg / wing (p) or a piece of the body (null) off into the hand. */
  breakOff(p) {
    if (heldItem() || !this.done) return;
    const src = p ? p.meshes : this.body;
    const partIdx = p ? this.parts.indexOf(p) : null;
    const bodyIdx = p ? null : this.bodyLeft;
    if (p) { p.gone = true; for (const m of p.meshes) m.visible = false; }
    else {
      this.bodyLeft--;
      for (const m of this.body) { m.userData.s0 ??= m.scale.clone(); m.scale.copy(m.userData.s0).multiplyScalar(0.45 + 0.55 * this.bodyLeft / C.bodyBites); m.visible = this.bodyLeft > 0; }
    }
    const piece = new ChickenPiece(this, p, src, { partIdx, bodyIdx, generation: this.generation });
    this.retarget();
    this.life && (this.life.dirty = true);
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
    this.life && (this.life.dirty = true);
  }

  update(dt) {
    super.update(dt);
    this.piece?.update(dt); // a piece in the hand being eaten
    if (this.inGrill && this.model.parent !== this.grill?.object) this.inGrill = false;
    const grilling = this.inGrill && this.grill?.on;
    if (grilling) {
      this.cooked = Math.min(C.burnSeconds, this.cooked + dt);
      if (!this.done && this.cooked >= C.cookSeconds) {
        this.done = true; this.retarget();
        if (!this.rewarded) { this.rewarded = true; this.onCooked?.(); }
        this.event('grilled', { surface: 'grill' });
      }
      this.brownK = Math.max(0, Math.min(1, (this.cooked - C.cookSeconds) / (C.burnSeconds - C.cookSeconds)));
      this.paint(Math.min(1, this.cooked / C.cookSeconds), this.brownK);
      if (!this.burnt && this.cooked >= C.burnSeconds) {
        this.burnt = true;
        if (!this.burntCounted) { this.burntCounted = true; this.onBurnt?.(); }
        this.event('chickenBurnt', { surface: 'grill' });
      }
      if (this.done) {
        this.smokeT = C.smokeSeconds;
        if ((this.sizzleT -= dt) <= 0) { sfx.sizzle(this.where()); this.sizzleT = 0.6 + Math.random() * 0.3; }
      }
      this.life && (this.life.dirty = true);
    } else if (this.smokeT > 0) this.smokeT = Math.max(0, this.smokeT - dt);
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

  /** Only active cooking owned by the kitchen pan can feed its alarm; lingering grill smoke is visual only (#1179). */
  get freeSmoke() {
    if (this.inGrill || !this.inPan || !this.pan?.onHob || !this.hob?.on || this.model.parent !== this.pan.model || !this.smoking || !this.visibleUp()) return false;
    return !this.hood?.draws(this.where(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0)));
  }

  visibleUp() { for (let p = this.model; p; p = p.parent) if (!p.visible) return false; return true; }
}

/** A leg, wing or bit of the body broken off the cooked chicken (#194): in the hand, a click / "Ät" takes a bite. */
export class ChickenPiece {
  constructor(bird, part, meshes, meta = {}) {
    Object.assign(this, { bird, part, isChickenPiece: true, name: part ? part.name : 'kycklingbiten', held: false, bites: 0, bite: 0, meta });
    const partIdx = meta.partIdx ?? (part ? bird.parts.indexOf(part) : null);
    const bodyIdx = meta.bodyIdx ?? (part ? null : bird.bodyLeft + 1);
    const gen = meta.generation ?? bird.generation ?? 0;
    this.portionId = part ? `chicken:${gen}:part:${partIdx}` : `chicken:${gen}:body:${bodyIdx}`;
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
    forgetBicycleHand(this);
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
        forgetBicycleHand(this);
        const portionId = this.portionId;
        this.held = false;
        setHeld(null);
        this.model.removeFromParent();
        this.bird.onEaten?.(this);
        this.bird.onConsume?.(this, portionId);
        this.bird.life && (this.bird.life.dirty = true);
        this.bird.renewIfEaten(); // #1124
        return;
      }
    }
    this.pose(Math.sin(this.bite * Math.PI));
  }
}

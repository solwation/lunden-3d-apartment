import * as THREE from 'three';
import { Holdable, setHeld } from './holdable.js';
import { sfx } from './audio.js';
import { chicken } from './fridge.js';
import { CHICKEN as C } from './config.js';

// The roast chicken in the fridge (#160), a Holdable: E (fridge open) takes it on its plate, E on its shelf
// spot puts it back; it goes down on tables / worktops / the floor like other things. E on the pan standing
// on the hob lays it in the pan (the plate stays out of sight: it rides with the chicken, hidden). In the pan
// on a lit zone it fries: after `cookSeconds` it sizzles, browns and starts to smoke. The smoke follows it
// (carried, too) and stops after `smokeSeconds`, or at once when it is back in the fridge and the door shuts.
// The chicken in the pan is a child of the pan: carry the pan and it comes along.

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
    model.traverse((m) => { if (m.isMesh && m !== plate && m.material.color.r > 0.4 && m.material.color.g < 0.5) this.skins.push({ m: m.material, c0: m.material.color.clone() }); });
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
    if (!this.held || !this.pan) return;
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

  /** F: home without smoke. */
  reset() { if (this.held) this.putBack(); else this.goHome(); this.smokeT = 0; this.cooked = 0; for (const s of this.smoke) s.visible = false; }

  brown(k) { for (const { m, c0 } of this.skins) m.color.copy(c0).multiplyScalar(1 - C.darken * k); }

  update(dt) {
    super.update(dt);
    if (this.inPan && this.pan && this.model.parent !== this.pan.model) this.inPan = false;
    if (this.inPan && this.pan.model.parent === this.pan.drawer?.object) this.goHome(); // the pan went back into its drawer
    const frying = this.inPan && this.pan.onHob && this.hob?.on;
    if (frying) {
      this.cooked += dt;
      if (this.cooked >= C.cookSeconds) {
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
    for (const s of this.smoke) {
      s.visible = !!on;
      if (!on) continue;
      const k = (this.smokeClock / 3 + s.userData.phase) % 1; // 0 → 1 over 3 s
      s.position.copy(from).add(new THREE.Vector3(Math.sin((k + s.userData.phase) * 9) * 0.04, k * 0.75, Math.cos((k + s.userData.phase) * 7) * 0.03));
      s.scale.setScalar(0.08 + k * 0.22);
      s.material.opacity = 0.6 * fade * Math.sin(Math.PI * k);
    }
  }

  visibleUp() { for (let p = this.model; p; p = p.parent) if (!p.visible) return false; return true; }
}

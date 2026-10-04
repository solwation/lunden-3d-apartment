import * as THREE from 'three';
import { Holdable, heldItem, setHeld } from './holdable.js';
import { sfx } from './audio.js';
import { MILK as M, DRINKS as D } from './config.js';

// The milk in the fridge (#168): a 1 l carton with a gable top and a printed label. With the fridge open E takes
// it, E on its place on the shelf puts it back, E on a table top / the worktop puts it down standing. In the hand
// it pours (drinks.js): E on a glass or a cup that stands out. F sends it home to the fridge (it stays visible
// there, like the rest of the fridge's contents). #382: it holds MILK.ml and runs out; the empty carton goes in the bin.

function labelTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = M.blue; g.fillRect(0, 150, 128, 106);            // the blue lower part
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, 150); g.bezierCurveTo(40, 120, 88, 180, 128, 140); g.lineTo(128, 150); g.lineTo(0, 160); g.fill(); // a wave
  g.fillStyle = M.blue; g.textAlign = 'center';
  g.font = 'bold 34px sans-serif'; g.fillText('Mjölk', 64, 70);
  g.font = 'bold 26px sans-serif'; g.fillText('3 %', 64, 104);
  g.fillStyle = '#ffffff'; g.font = '18px sans-serif'; g.fillText('1 liter', 64, 220);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The carton, its origin at the bottom centre. */
function carton() {
  const g = new THREE.Group();
  const { w, h, gable } = M;
  const label = new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), [label, label, white, white, label, label]);
  body.position.y = h / 2;
  const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, gable)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: w, bevelEnabled: false }), white);
  roof.position.set(0, h, -w / 2);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, w), white);
  fin.position.y = h + gable + 0.005;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 12), new THREE.MeshStandardMaterial({ color: M.blue, roughness: 0.5 }));
  cap.position.set(0, h + gable * 0.45, w * 0.22); cap.rotation.x = Math.atan2(w / 2, gable); // on the front slope
  g.add(body, roof, fin, cap);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

const NOTHING = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };

export class Milk extends Holdable {
  constructor(scene, camera, fridge) {
    const model = carton();
    const pos = fridge.milkAt.clone();
    super(scene, camera, {
      name: 'mjölken', verb: 'ta', backName: 'kylskåpet', backVerb: 'ställa tillbaka mjölken i', placeVerb: 'ställa ner',
      model, home: { pos, rot: new THREE.Euler(0, Math.PI / 2, 0) }, // the label towards the door
      heldPose: { pos: new THREE.Vector3(M.held.x, M.held.y, M.held.z), rot: new THREE.Euler(0.15, -0.3, -0.1) },
      pick: { pos: pos.clone().setY(pos.y + M.h / 2), size: [0.12, M.h + 0.06, 0.12] }, cooldown: 0.3,
    });
    Object.assign(this, { fridge, tilt: 0, tiltT: 0, ml: M.ml, away: false, fridgeWas: false, drinkKind: 'milk' });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // it stands when put down
    const self = this;
    Object.defineProperty(this.takeTarget, 'name', { get: () => self.name, configurable: true });
  }

  // #382: it runs out. `drink` (what pours) only while there is milk left; empty it is a package for the bin.
  get drink() { return this.ml > 0.5 ? 'milk' : null; }
  set drink(v) {} // (nothing sets it: it follows the amount)
  get name() { return this.ml > 0.5 ? 'mjölken' : 'den tomma mjölkkartongen'; }
  set name(v) {} // (Holdable's constructor assigns opts.name)
  /** What kind of waste it is (the bin, #381 / #386): an empty carton is a package. */
  get wasteKind() { return this.ml > 0.5 ? null : 'package'; }
  /** Take `ml` out (what was poured); never below 0. */
  drain(ml) { if (ml > 0) this.ml = Math.max(0, this.ml - ml); }
  /** Thrown away (#382): out of the hand and gone; a full carton is back on its shelf the next time the fridge is opened
   * after being shut (as the life sim restocks, #373). */
  discard() {
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    this.away = true; this.fridgeWas = !!this.fridge.isOpen; this.ml = M.ml;
    this.goHome();
    this.model.visible = false;
  }
  /** A full carton again, wherever it is (the &life scenario). */
  refill() { this.ml = M.ml; if (this.away) { this.away = false; this.model.visible = true; } }
  get target() { return this.away ? NOTHING : super.target; }
  get emptyText() { return 'Mjölken är slut'; }
  /** The saved state (life.js extras): null for a full carton in its place. */
  keepState() { return this.ml < M.ml || this.away ? { ml: Math.round(this.ml), ...(this.away ? { away: 1 } : {}) } : null; }
  loadKeep(s) {
    if (!s || typeof s !== 'object') return;
    if (Number.isFinite(s.ml)) this.ml = Math.max(0, Math.min(M.ml, s.ml));
    if (s.away) { if (this.held) this.putBack(); this.away = true; this.model.visible = false; this.fridgeWas = !!this.fridge.isOpen; }
  }

  /** Tip it for `secs` seconds (pouring into a glass or a cup); `ml` = what went in (it is taken out of the carton). */
  pour(secs, ml = 0) { this.tiltT = secs; this.drain(ml); }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); }

  idle() { // thrown away: back the next time the fridge is opened after being shut
    if (!this.away) return;
    const open = !!this.fridge.isOpen;
    if (open && !this.fridgeWas) { this.away = false; this.model.visible = true; this.goHome(); }
    this.fridgeWas = open;
  }

  tick(dt) {
    this.tiltT = Math.max(0, this.tiltT - dt);
    this.tilt += ((this.tiltT > 0 ? 1 : 0) - this.tilt) * Math.min(1, dt * 8);
    const r = this.heldPose.rot;
    this.model.rotation.set(r.x, r.y, r.z + D.tilt * this.tilt);
  }
}

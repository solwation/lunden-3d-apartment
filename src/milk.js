import * as THREE from 'three';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';
import { MILK as M, DRINKS as D } from './config.js';

// The milk in the fridge (#168): a 1 l carton with a gable top and a printed label. With the fridge open E takes
// it, E on its place on the shelf puts it back, E on a table top / the worktop puts it down standing. In the hand
// it pours (drinks.js): E on a glass or a cup that stands out. F sends it home to the fridge (it stays visible
// there, like the rest of the fridge's contents).

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
    Object.assign(this, { drink: 'milk', fridge, tilt: 0, tiltT: 0 });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // it stands when put down
  }

  /** Tip it for `secs` seconds (pouring into a glass or a cup). */
  pour(secs) { this.tiltT = secs; }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); }

  tick(dt) {
    this.tiltT = Math.max(0, this.tiltT - dt);
    this.tilt += ((this.tiltT > 0 ? 1 : 0) - this.tilt) * Math.min(1, dt * 8);
    const r = this.heldPose.rot;
    this.model.rotation.set(r.x, r.y, r.z + D.tilt * this.tilt);
  }
}

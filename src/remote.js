import * as THREE from 'three';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';
import { REMOTE as R } from './config.js';

// The TV remote (#101): a slim black remote on the coffee table, a Holdable. Held and pointed at a TV
// (the one in the look direction, not through walls — main.js finds it): a click / the touch button
// changes the programme (switching the TV on if it is off), right click / the ⏻ touch button switches the
// TV on and off. Its red LED blinks on every press (emissive, no light).

function remoteModel() {
  const g = new THREE.Group();
  const { w, l, h } = R;
  const black = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.55, metalness: 0.1 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x4a4d53, roughness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.4 });
  const box = (sx, sy, sz, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  box(w, h, l, 0, h / 2, 0, black);                                                     // body, the top end at −z
  box(0.012, 0.004, 0.008, 0, h + 0.002, -l / 2 + 0.014, red);                          // power button
  const nav = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 16), grey);
  nav.position.set(0, h + 0.002, -l / 2 + 0.05);
  g.add(nav);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) box(0.008, 0.003, 0.006, (c - 1) * 0.011, h + 0.0015, -l / 2 + 0.08 + r * 0.016, grey); // number keys
  box(0.024, 0.003, 0.008, 0, h + 0.0015, l / 2 - 0.02, grey);                          // volume rocker
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.002),
    new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 0, roughness: 0.3 }));
  led.position.set(0, h / 2, -l / 2 - 0.001);
  g.add(led);
  return { g, led };
}

export class Remote extends Holdable {
  /** findTv() → the TV target the camera points at (within reach, not behind a wall), or null. */
  constructor(scene, camera, findTv) {
    const { g, led } = remoteModel();
    const home = new THREE.Vector3(R.x, R.y, R.z);
    super(scene, camera, {
      name: 'fjärrkontrollen', verb: 'ta', backName: 'fjärrkontrollen på soffbordet', backVerb: 'lägga tillbaka',
      model: g, home: { pos: home, rot: new THREE.Euler(0, THREE.MathUtils.degToRad(R.turn), 0) },
      heldPose: { pos: new THREE.Vector3(R.held.x, R.held.y, R.held.z), rot: new THREE.Euler(0.25, 0.08, 0) }, // pointing ahead
      pick: { pos: home.clone().setY(R.y + 0.02), size: [0.12, 0.05, 0.24] }, cooldown: 0.25, useLabel: 'Byt kanal',
    });
    Object.assign(this, { led, findTv, blink: 0, presses: 0 });
  }

  press(power) {
    this.blink = 0.18;
    this.presses++;
    const p = this.where();
    sfx.click(p);
    const tv = this.findTv();
    if (!tv) return null;
    const at = tv.pickable.getWorldPosition(new THREE.Vector3());
    if (power || !tv.isOpen) { const on = tv.toggle(); sfx.tvClick(at, on); }
    else { tv.channel(); sfx.tvStatic(at); }
    return tv;
  }

  onUse() { this.press(false); }
  /** The power button: right click / the ⏻ touch button. */
  useAlt() { if (this.held && this.cool <= 0) { this.cool = 0.25; this.press(true); } }

  tick(dt) { this.idle(dt); }
  idle(dt) {
    this.blink = Math.max(0, this.blink - dt);
    this.led.material.emissiveIntensity = this.blink > 0 ? 2.5 : 0;
  }
}

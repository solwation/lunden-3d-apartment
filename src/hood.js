import * as THREE from 'three';
import { sfx } from './audio.js';
import { SMOKE_ALARM as A } from './config.js';

// The cooker hood (Spiskåpa Tango, #194) and the smoke alarm in the kitchen ceiling. E on the hood switches the fan
// on and off: a low whoosh and its lights under it come on. The chicken's smoke (chicken.js) is drawn up into the
// hood while it runs. If something smokes for more than SMOKE_ALARM.delay s without the hood running over it, the
// alarm goes off — a loud beeping and a blinking red LED — until the smoke is gone or the hood is switched on.

export class Hood {
  /** x0..x1 (wall cabinet depth), z0..z1 (over the hob), y0 = its underside, y1 = its top. */
  constructor({ x0, x1, z0, z1, y0, y1 }) {
    Object.assign(this, { name: 'köksfläkten', kind: 'hood', on: false, sound: null });
    this.object = new THREE.Group();
    // its lights: a bright panel under it, only lit while the fan runs (the baked LED strip is the room's lamp)
    this.lightMat = new THREE.MeshBasicMaterial({ color: 0x3a3a38 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.1, z1 - z0 - 0.08).rotateX(Math.PI / 2), this.lightMat);
    panel.position.set((x0 + x1) / 2 - 0.02, y0 - 0.004, (z0 + z1) / 2);
    // a small control strip on the front edge with a green LED
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x1a2a1a });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.012), this.ledMat);
    led.position.set(x0 - 0.003, (y0 + y1) / 2, z1 - 0.06);
    // the E box: the whole hood, a little bigger
    const pick = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.04, y1 - y0 + 0.06, z1 - z0), new THREE.MeshBasicMaterial());
    pick.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    pick.visible = false;
    this.object.add(panel, led, pick);
    this.object.traverse((m) => { m.userData.door = this; });
    this.pickable = this.object;
    this.intake = new THREE.Vector3((x0 + x1) / 2, y0, (z0 + z1) / 2); // where smoke goes
  }

  get isOpen() { return this.on; }
  get verb() { return this.on ? 'stänga av' : 'slå på'; }

  toggle() { this.set(!this.on); }

  set(on) {
    if (on === this.on) return;
    this.on = on;
    sfx.click(this.intake);
    this.sound?.stop(); this.sound = on ? sfx.fan(this.intake) : null;
    this.lightMat.color.setHex(on ? 0xfff3d8 : 0x3a3a38);
    this.ledMat.color.setHex(on ? 0x30ff50 : 0x1a2a1a);
  }

  /** Is world point p (a smoking thing) under the running hood's draw? */
  draws(p) { return this.on && Math.hypot(p.x - this.intake.x, p.z - this.intake.z) < A.hoodReach && p.y < this.intake.y && p.y > this.intake.y - 1.2; }

  update() {}
}

export class SmokeAlarm {
  constructor() {
    Object.assign(this, { ringing: false, t: 0, smokyFor: 0, sound: null });
    this.object = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.035, 24), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }));
    body.position.y = -0.0175;
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x401010 });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12).rotateX(Math.PI / 2), this.ledMat);
    led.position.set(0.03, -0.0352, 0);
    this.object.add(body, led);
    this.object.position.set(A.x, A.y, A.z);
    this.pos = new THREE.Vector3(A.x, A.y - 0.05, A.z);
  }

  /** `smoky` = something smokes without the hood drawing it away. */
  update(dt, smoky) {
    this.t += dt;
    this.smokyFor = smoky ? this.smokyFor + dt : 0;
    const ring = this.smokyFor > A.delay;
    if (ring !== this.ringing) {
      this.ringing = ring;
      this.sound?.stop(); this.sound = ring ? sfx.alarm(this.pos) : null;
      if (ring) this.onRing?.();
    }
    // a slow standby blink, fast red flashes while it rings
    const on = ring ? (this.t * 4) % 1 < 0.5 : (this.t % 40) < 0.08;
    this.ledMat.color.setHex(on ? 0xff2020 : 0x401010);
  }

  /** F / a fresh start: quiet. */
  reset() { this.smokyFor = 0; this.update(0, false); }
}

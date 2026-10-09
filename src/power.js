import * as THREE from 'three';
import { POWER as P } from './config.js';
import { sfx } from './audio.js';

// The power cut (#604): the fuse box in the hall's EL/C cabinet (interior.js buildElCabinet, `fuse`). With the cabinet
// open, E / the action button on it ("Pilla på elcentralen") makes it buzz and crackle for POWER.buzz s while the lamps
// flicker (`supply` jumps about), then it bangs with a spark, and Kv. Lunden has no power (`supply` 0) until it is
// mended: the action button held on it for POWER.repair s in all ("Laga elcentralen"; letting go or looking away pauses
// the progress, it is never lost). main.js carries the cut out (`onCut`, `onRestore`, `supply` → lights.js and the
// rest); nothing of it is saved, so a reload always has power.

function sparkTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.15, 'rgba(220,235,255,0.9)'); r.addColorStop(0.5, 'rgba(120,170,255,0.25)'); r.addColorStop(1, 'rgba(80,120,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** A cheap stable hash of an integer → 0 … 1 (the flicker pattern). */
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export class Power {
  /** `cabinet`: the EL/C cabinet's Openable (its `fuse`: back / front plan points, y0 / y1, normal, leds). */
  constructor(scene, cabinet) {
    const F = cabinet.fuse, [bx, bz] = F.back, [fx, fz] = F.front, n = F.normal, out = P.pick.out;
    Object.assign(this, { cabinet, state: 'on', t: 0, progress: 0, holding: false, supply: 1, tinkerT: 0, sound: null, onCut: null, onRestore: null });
    this.leds = F.leds;
    this.ledColor = F.leds.color.clone();
    this.ledEmissive = F.leds.emissiveIntensity;
    // an invisible pick box over the breakers, a little in front of them
    const x0 = Math.min(bx, fx + n.x * out), x1 = Math.max(bx, fx + n.x * out), z0 = Math.min(bz, fz + n.z * out), z1 = Math.max(bz, fz + n.z * out);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, F.y1 - F.y0, z1 - z0), new THREE.MeshBasicMaterial());
    pick.position.set((x0 + x1) / 2, (F.y0 + F.y1) / 2, (z0 + z1) / 2);
    pick.visible = false;
    scene.add(pick);
    // where the sparks fly: the middle of the breakers' face
    this.pos = new THREE.Vector3((n.x ? fx : (bx + fx) / 2) + n.x * 0.02, (F.y0 + F.y1) / 2, (n.z ? fz : (bz + fz) / 2) + n.z * 0.02);
    this.spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTexture(), color: P.spark.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    this.spark.position.copy(this.pos);
    this.spark.scale.setScalar(P.spark.size);
    this.spark.visible = false;
    this.spark.raycast = () => {};
    scene.add(this.spark);
    this.flash = 0;
    const self = this;
    this.target = {
      kind: 'fusebox', pickable: pick, power: this,
      get name() { return 'elcentralen'; },
      get verb() { return self.state === 'off' ? 'laga' : 'pilla på'; },
      get isOpen() { return self.state !== 'on'; },
      get blocked() { return self.state === 'buzz'; },
      blockedText: 'Det sprakar i elcentralen …',
    };
    pick.userData.door = this.target;
  }

  /** Is there power in Kv. Lunden? (also while it only crackles) */
  get on() { return this.state !== 'off'; }
  /** The fuse box can be reached: its cabinet is open. */
  get reachable() { return this.cabinet.isOpen; }
  /** How far it is mended, 0 … 1. */
  get fraction() { return Math.min(1, this.progress / P.repair); }

  /** E / the action button on it: crackle and bang when there is power, start mending (held) when there is none. */
  use() {
    if (this.state === 'on') { this.trip(); return 'trip'; }
    if (this.state === 'off') { this.holding = true; return 'hold'; }
    return null;
  }

  /** It starts to buzz (the bang follows by itself). */
  trip() {
    if (this.state !== 'on') return false;
    Object.assign(this, { state: 'buzz', t: 0 });
    this.sound = sfx.mainsBuzz(this.pos, P.buzz);
    return true;
  }

  /** The action button let go (key up, mouse up, finger off). */
  release() { this.holding = false; }

  /** Each frame; `aimed`: the fuse box is what the visitor looks at (mending needs it). */
  update(dt, aimed = true) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt / P.spark.time);
      this.spark.material.opacity = this.flash;
      this.spark.scale.setScalar(P.spark.size * (0.6 + 0.8 * this.flash));
      this.spark.visible = this.flash > 0;
    }
    if (this.state === 'buzz') {
      this.t += dt;
      const step = Math.floor(this.t * P.flicker), r = hash(step), late = this.t / P.buzz;
      this.supply = r < 0.25 + 0.35 * late ? 0.05 + 0.2 * hash(step + 7) : r < 0.75 ? 1 : 0.6; // more and more dark moments
      if (hash(step + 3) > 0.8) this.sparkle(0.35 + 0.4 * late); // small sparks with the crackles
      if (this.t >= P.buzz) this.bang();
      return;
    }
    if (this.state !== 'off') return;
    if (this.holding && aimed) {
      this.progress += dt;
      if ((this.tinkerT -= dt) <= 0) { this.tinkerT = P.tinker; sfx.click(this.pos); }
      if (this.progress >= P.repair) this.restore();
    }
  }

  sparkle(k) { if (k > this.flash) { this.flash = k; this.spark.visible = true; } }

  /** The bang: Kv. Lunden goes dark. */
  bang() {
    this.sound?.stop(); this.sound = null;
    Object.assign(this, { state: 'off', t: 0, supply: 0, progress: 0, holding: false, tinkerT: 0 });
    sfx.fuseBang(this.pos, P.bang);
    this.sparkle(1);
    this.leds.color.setHex(0x0a140c); this.leds.emissiveIntensity = 0;
    this.onCut?.();
  }

  /** Mended: the power comes back. */
  restore() {
    this.sound?.stop(); this.sound = null;
    Object.assign(this, { state: 'on', t: 0, supply: 1, progress: 0, holding: false });
    sfx.breakerOn(this.pos);
    this.leds.color.copy(this.ledColor); this.leds.emissiveIntensity = this.ledEmissive;
    this.onRestore?.();
  }
}
